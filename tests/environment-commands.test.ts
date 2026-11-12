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
    Object.assign(env.state, { stack: 'typescript', profile: 'standard', bun: '1.0.0', components: { codex: false }, installations: { bun: { source: 'reused', path: join(base, 'bun'), status: 'ready' } } });
    env.save();
    const before = readFileSync(env.stateFile);
    env.listDiscoveredTools = () => [{ name: 'bun', path: join(base, 'bun'), scope: 'system-or-user', source: 'unknown' }];
    const result = environmentStatus(env) as { initialized: boolean; stack: string; installations: { bun: { source: string; path: string; status: string } }; tools: { recordedVersion: string; detectedVersion: null; source: string }[] };
    assert.equal(result.initialized, true);
    assert.equal(result.stack, 'typescript');
    assert.deepEqual(result.installations.bun, { source: 'reused', path: join(base, 'bun'), status: 'ready' });
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
    assert.deepEqual(selected, {
      stack: 'python',
      profile: 'full',
      skipCodex: true,
      skipSkills: false,
      skipCcSwitch: false,
    });
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

test('repair resumes interrupted options and successful uninstall invalidates the environment', async () => {
  const base = mkdtempSync(join(tmpdir(), 'qa-env-resume-'));
  try {
    const env = new Environment({ root: join(base, 'environment'), env: { PATH: '' } });
    const options: EnvironmentInitOptions = {
      stack: 'typescript',
      profile: 'full',
      skipCodex: true,
      skipSkills: false,
      skipCcSwitch: true,
    };
    Object.assign(env.state, { stack: 'typescript', profile: 'full', init_status: 'initializing', init_options: options });
    env.save();
    assert.equal((environmentStatus(env) as { initialized: boolean }).initialized, false);
    let selected: EnvironmentInitOptions | undefined;
    env.init = async (value) => { selected = value; return 0; };
    await executeEnvironment({ command: 'env', action: 'repair', root: env.root }, env, async () => true);
    assert.deepEqual(selected, options);
    env.removeSharedMcpRegistrations = () => ({ removed: [], absent: [], preserved: [], failed: [] });
    assert.equal(await executeEnvironment({ command: 'env', action: 'uninstall', root: env.root }, env, async () => true), 20);
    assert.equal(env.state.init_status, 'uninstalled');
    assert.equal((environmentStatus(env) as { initialized: boolean }).initialized, false);
    assert.equal(parseArgs(['env', 'init', 'typescript', '--skip-cc-switch']).skipCcSwitch, true);
    assert.throws(() => parseArgs(['env', 'init', 'typescript', '--with-cc-switch']), /Unknown option/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('environment check reports incomplete or uninstalled status', () => {
  const base = mkdtempSync(join(tmpdir(), 'qa-env-status-'));
  const oldLog = console.log;
  try {
    const env = new Environment({ root: join(base, 'environment'), env: { PATH: '' } });
    const logs: string[] = [];
    console.log = (...values: unknown[]) => { logs.push(values.join(' ')); };
    for (const status of ['initializing', 'uninstalled']) {
      env.state.init_status = status;
      assert.equal(env.check({ stack: 'typescript', profile: 'standard', skipCodex: true, skipSkills: true }), 1);
      const report = JSON.parse(logs.at(-1) ?? '{}') as { missing: string[] };
      assert.ok(report.missing.includes('environment-initialization'));
    }
  } finally {
    console.log = oldLog;
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
