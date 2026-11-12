import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'bun:test';
import { Environment, type EnvironmentInitOptions } from '../packages/qa-cli/cli/environment.ts';
import { executeEnvironment } from '../packages/qa-cli/cli/environment-commands.ts';
import { environmentStatus } from '../packages/qa-cli/cli/environment-status.ts';
import { parseArgs } from '../packages/qa-cli/qa-cli.ts';

test('environment list reports recorded and discovered information without writes', () => {
  const base = mkdtempSync(join(tmpdir(), 'qa-env-list-'));
  try {
    const root = join(base, 'environment');
    const env = new Environment({ root, env: { PATH: '' } });
    assert.equal((environmentStatus(env) as { initialized: boolean }).initialized, false);
    assert.equal(existsSync(root), false);
    Object.assign(env.state, { stack: 'typescript', profile: 'standard', bun: '1.0.0', components: { codex: false } });
    env.save();
    const before = readFileSync(env.stateFile);
    env.listDiscoveredTools = () => [{ name: 'bun', path: join(base, 'bun'), scope: 'system-or-user', source: 'unknown' }];
    const result = environmentStatus(env) as { initialized: boolean; stack: string; tools: { recordedVersion: string; detectedVersion: null; source: string }[] };
    assert.equal(result.initialized, true);
    assert.equal(result.stack, 'typescript');
    assert.deepEqual(result.tools.map(({ recordedVersion, detectedVersion, source }) => ({ recordedVersion, detectedVersion, source })), [
      { recordedVersion: '1.0.0', detectedVersion: null, source: 'unknown' },
    ]);
    assert.deepEqual(readFileSync(env.stateFile), before);
    assert.equal(parseArgs(['env', 'list']).action, 'list');
    assert.throws(() => parseArgs(['env', 'list', 'extra']), /Unknown option/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('environment repair restores recorded configuration even when Bun and pnpm are absent', async () => {
  const base = mkdtempSync(join(tmpdir(), 'qa-env-command-'));
  try {
    const env = new Environment({ root: join(base, 'environment'), env: { PATH: '' } });
    Object.assign(env.state, { stack: 'python', profile: 'full', components: { codex: false, browser_tools: true } });
    env.save();
    let selected: EnvironmentInitOptions | undefined;
    env.init = async (options) => { selected = options; return 0; };
    const result = await executeEnvironment({ command: 'env', action: 'repair', root: env.root }, env, async () => true);
    assert.equal(result, 0);
    assert.deepEqual(selected, { stack: 'python', profile: 'full', skipCodex: true, skipSkills: false });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('environment repair rejects missing ownership and state', async () => {
  const base = mkdtempSync(join(tmpdir(), 'qa-env-command-'));
  try {
    const env = new Environment({ root: join(base, 'environment'), env: { PATH: '' } });
    await assert.rejects(executeEnvironment({ command: 'env', action: 'repair', root: env.root }, env, async () => true), /ownership or state/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('Unix launcher falls back to a compatible shared Node', () => {
  if (process.platform === 'win32') return;
  const base = mkdtempSync(join(tmpdir(), 'qa-node-selection-'));
  try {
    const bin = join(base, 'bin');
    const shared = join(base, '.local/share/qa-ai-playwright/node/bin');
    mkdirSync(bin, { recursive: true });
    mkdirSync(shared, { recursive: true });
    writeFileSync(join(bin, 'node'), '#!/bin/sh\necho v22.17.0\n');
    writeFileSync(join(shared, 'node'), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo v26.0.0; else echo shared-node-selected; fi\n');
    chmodSync(join(bin, 'node'), 0o755);
    chmodSync(join(shared, 'node'), 0o755);
    const result = spawnSync('bash', [join(process.cwd(), 'packages/qa-cli/bin/qa.sh'), '--root', join(base, 'environment'), 'doctor'], {
      encoding: 'utf8', env: { ...process.env, HOME: base, PATH: `${bin}:${process.env.PATH ?? ''}` },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /shared-node-selected/u);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
