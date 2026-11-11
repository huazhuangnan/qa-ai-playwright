import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'bun:test';
import type { Environment } from '../packages/qa-cli/cli/environment.ts';
import { projectUpgradePlan } from '../packages/qa-cli/cli/project-upgrade-plan.ts';
import { OWNER } from '../packages/qa-cli/cli/shared.ts';

/** Construct isolated template and project fixtures. */
function fixture(stack: 'python' | 'typescript' = 'typescript') {
  const base = mkdtempSync(join(tmpdir(), 'qa-upgrade-plan-'));
  const repo = join(base, 'repo');
  const target = join(base, 'project');
  const language = join(repo, 'packages/templates', stack);
  const qa = join(repo, 'packages/templates/qa');
  const put = (path: string, value: string): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, value);
  };
  put(join(language, 'VERSION'), '0.0.1\n');
  put(join(qa, 'VERSION'), '0.0.1\n');
  mkdirSync(target, { recursive: true });
  const calls: string[] = [];
  const env = { repo, requireInitialized: (value: string) => calls.push(value) } as unknown as Environment;
  const marker = (files: Record<string, unknown>): void => put(join(target, '.qa-project.json'), JSON.stringify({ owner: OWNER, target, stack, files, directories: [], qa_template_version: '0.0.1', language_template_version: '0.0.1' }));
  return { base, target, language, qa, put, marker, env, calls };
}

/** Match the project ownership hash format. */
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

test.each(['python', 'typescript'] as const)('plans all file states and preserves project data for %s', (stack) => {
  const f = fixture(stack);
  try {
    for (const [name, value] of Object.entries({ same: 'same', update: 'new', modified: 'new', missing: 'new', added: 'new', collision: 'template' })) f.put(join(f.language, name), value);
    f.put(join(f.qa, 'shared.md'), 'shared');
    for (const [name, value] of Object.entries({ same: 'same', update: 'old', modified: 'user', removed: 'old', collision: 'user', invalid: 'user' })) f.put(join(f.target, name), value);
    f.marker({ same: hash('same'), update: hash('old'), modified: hash('old'), missing: hash('old'), removed: hash('old'), invalid: 'bad-hash' });
    const markerBefore = readFileSync(join(f.target, '.qa-project.json'));
    const plan = projectUpgradePlan(f.env, f.target);
    const statuses = Object.fromEntries(plan.entries.map((entry) => [entry.path, entry.status]));
    assert.deepEqual(Object.fromEntries(['same', 'update', 'modified', 'missing', 'added', 'removed', 'collision', 'invalid', 'docs/qa/shared.md'].map((name) => [name, statuses[name]])), {
      same: 'unchanged', update: 'update', modified: 'modified', missing: 'missing', added: 'new', removed: 'removed', collision: 'unknown', invalid: 'unknown', 'docs/qa/shared.md': 'new',
    });
    assert.deepEqual(f.calls, [stack]);
    assert.equal(plan.templateVersions.qa, '0.0.1');
    assert.deepEqual(readFileSync(join(f.target, '.qa-project.json')), markerBefore);
    assert.equal(readFileSync(join(f.target, 'modified'), 'utf8'), 'user');
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test('rejects unsafe recorded paths before reading them', () => {
  const f = fixture();
  try {
    for (const name of ['../outside', '/absolute', 'a/../outside', 'a\\outside', 'C:outside']) {
      f.marker({ [name]: hash('x') });
      assert.throws(() => projectUpgradePlan(f.env, f.target), /Unsafe project path/u);
    }
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test('rejects a linked project file and linked template file', () => {
  const f = fixture();
  try {
    f.put(join(f.base, 'outside'), 'outside');
    f.marker({ linked: hash('outside') });
    try {
      symlinkSync(join(f.base, 'outside'), join(f.target, 'linked'), 'file');
    } catch (error) {
      if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) return;
      throw error;
    }
    assert.throws(() => projectUpgradePlan(f.env, f.target), /Linked path/u);
    rmSync(join(f.target, 'linked'));
    symlinkSync(join(f.base, 'outside'), join(f.language, 'linked'), 'file');
    assert.throws(() => projectUpgradePlan(f.env, f.target), /Linked path/u);
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test('propagates an uninitialized or mismatched environment', () => {
  const f = fixture();
  try {
    f.marker({});
    const env = { repo: f.env.repo, requireInitialized: () => { throw new Error('Environment not initialized'); } } as unknown as Environment;
    assert.throws(() => projectUpgradePlan(env, f.target), /Environment not initialized/u);
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});
