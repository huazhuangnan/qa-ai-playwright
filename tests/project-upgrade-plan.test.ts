import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'bun:test';
import type { Environment } from '../packages/qa-cli/cli/environment.ts';
import { projectUpgradePlan } from '../packages/qa-cli/cli/project-upgrade-plan.ts';
import { projectUpgrade } from '../packages/qa-cli/cli/project-upgrade.ts';
import { projectRollback, projectSnapshots, saveProjectSnapshot } from '../packages/qa-cli/cli/project-snapshots.ts';
import { OWNER } from '../packages/qa-cli/cli/shared.ts';

/** Construct isolated template and project fixtures. */
function fixture(stack: 'python' | 'typescript' = 'typescript') {
  const base = mkdtempSync(join(tmpdir(), 'qa-upgrade-plan-'));
  const repo = join(base, 'repo');
  const target = join(base, 'project');
  const root = join(base, 'environment');
  const language = join(repo, 'packages/templates', stack);
  const qa = join(repo, 'packages/templates/qa');
  const put = (path: string, value: string): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, value);
  };
  put(join(language, 'VERSION'), '0.0.1\n');
  put(join(qa, 'VERSION'), '0.0.1\n');
  mkdirSync(target, { recursive: true });
  mkdirSync(root, { recursive: true });
  const calls: string[] = [];
  const env = { repo, root, requireInitialized: (value: string) => calls.push(value) } as unknown as Environment;
  const marker = (files: Record<string, unknown>): void => put(join(target, '.qa-project.json'), JSON.stringify({
    owner: OWNER,
    target,
    stack,
    files,
    directories: [],
    qa_template_version: '0.0.1',
    language_template_version: '0.0.1',
    last_successful_init: { browser: 'chromium', browser_system_dependencies_requested: false },
  }));
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

test('upgrade stops before writing if a managed file has user changes', () => {
  const f = fixture();
  try {
    f.put(join(f.language, 'changed'), 'new');
    f.put(join(f.target, 'changed'), 'user');
    f.marker({ changed: hash('old') });
    assert.equal(projectUpgrade(f.env, f.target, 'upgrade'), 1);
    assert.equal(readFileSync(join(f.target, 'changed'), 'utf8'), 'user');
    assert.equal(projectUpgradePlan(f.env, f.target).entries.find((entry) => entry.path === 'VERSION')?.status, 'new');
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test('upgrade updates owned files and repair restores only missing files', () => {
  const f = fixture();
  try {
    f.put(join(f.language, 'changed'), 'new');
    f.put(join(f.language, 'missing'), 'restored');
    f.put(join(f.target, 'changed'), 'old');
    f.marker({ changed: hash('old'), missing: hash('restored') });
    assert.equal(projectUpgrade(f.env, f.target, 'repair'), 0);
    assert.equal(readFileSync(join(f.target, 'changed'), 'utf8'), 'old');
    assert.equal(readFileSync(join(f.target, 'missing'), 'utf8'), 'restored');
    assert.equal(projectUpgrade(f.env, f.target, 'upgrade'), 0);
    assert.equal(readFileSync(join(f.target, 'changed'), 'utf8'), 'new');
    assert.ok(projectUpgradePlan(f.env, f.target).entries.every((entry) => entry.status === 'unchanged'));
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test('project snapshot rolls back owned files and project marker', () => {
  const f = fixture();
  try {
    f.put(join(f.language, 'changed'), 'new');
    f.put(join(f.target, 'changed'), 'old');
    f.marker({ changed: hash('old') });
    const before = readFileSync(join(f.target, '.qa-project.json'));
    assert.equal(projectUpgrade(f.env, f.target, 'upgrade'), 0);
    const [id] = projectSnapshots(f.env, f.target);
    assert.ok(id);
    assert.equal(projectRollback(f.env, f.target, id), 0);
    assert.equal(readFileSync(join(f.target, 'changed'), 'utf8'), 'old');
    assert.deepEqual(readFileSync(join(f.target, '.qa-project.json')), before);
    assert.equal(existsSync(join(f.target, 'VERSION')), false);
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test('project upgrade and rollback preserve executable permissions', () => {
  if (process.platform === 'win32') return;
  const f = fixture();
  try {
    const target = join(f.target, 'script.sh');
    f.put(join(f.language, 'script.sh'), 'new');
    f.put(target, 'old');
    chmodSync(target, 0o751);
    f.marker({ 'script.sh': hash('old') });
    assert.equal(projectUpgrade(f.env, f.target, 'upgrade'), 0);
    assert.equal(lstatSync(target).mode & 0o777, 0o751);
    const [id] = projectSnapshots(f.env, f.target);
    assert.ok(id);
    assert.equal(projectRollback(f.env, f.target, id), 0);
    assert.equal(lstatSync(target).mode & 0o777, 0o751);
    assert.equal(readFileSync(target, 'utf8'), 'old');
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test('snapshot refuses a project ownership record changed after planning', () => {
  const f = fixture();
  try {
    f.marker({});
    const plan = projectUpgradePlan(f.env, f.target);
    f.marker({ VERSION: hash('user-owned') });
    assert.throws(() => saveProjectSnapshot(f.env, plan), /record changed after planning/);
    assert.equal(existsSync(join(f.env.root, 'project-snapshots')), false);
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test('project rollback preserves edits made after an upgrade', () => {
  const f = fixture();
  try {
    f.put(join(f.language, 'changed'), 'new');
    f.put(join(f.target, 'changed'), 'old');
    f.marker({ changed: hash('old') });
    assert.equal(projectUpgrade(f.env, f.target, 'upgrade'), 0);
    const [id] = projectSnapshots(f.env, f.target);
    assert.ok(id);
    f.put(join(f.target, 'changed'), 'user edit');
    assert.throws(() => projectRollback(f.env, f.target, id), /changed after the snapshot/);
    assert.equal(readFileSync(join(f.target, 'changed'), 'utf8'), 'user edit');
    assert.equal(readFileSync(join(f.target, 'VERSION'), 'utf8'), '0.0.1\n');
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test('project rollback rejects a corrupted snapshot before modifying the project', () => {
  const f = fixture();
  try {
    f.put(join(f.language, 'changed'), 'new');
    f.put(join(f.target, 'changed'), 'old');
    f.marker({ changed: hash('old') });
    assert.equal(projectUpgrade(f.env, f.target, 'upgrade'), 0);
    const [id] = projectSnapshots(f.env, f.target);
    assert.ok(id);
    const snapshot = join(f.env.root, 'project-snapshots', hash(f.target), `${id}.json`);
    writeFileSync(snapshot, '{}');
    assert.throws(() => projectRollback(f.env, f.target, id), /corrupted/);
    assert.equal(readFileSync(join(f.target, 'changed'), 'utf8'), 'new');
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test('project rollback handles an interrupted upgrade', () => {
  const f = fixture();
  try {
    f.marker({});
    const markerPath = join(f.target, '.qa-project.json');
    const original = readFileSync(markerPath);
    const plan = projectUpgradePlan(f.env, f.target);
    const id = saveProjectSnapshot(f.env, plan);
    const first = plan.entries.find((entry) => ['new', 'missing', 'update', 'adopt'].includes(entry.status));
    assert.ok(first && first.templateHash && first.path === 'VERSION');
    f.put(join(f.target, 'VERSION'), '0.0.1\n');
    const intermediate = JSON.parse(original.toString('utf8')) as { files: Record<string, string> };
    intermediate.files.VERSION = first.templateHash;
    writeFileSync(markerPath, `${JSON.stringify(intermediate, null, 2)}\n`);
    assert.equal(projectRollback(f.env, f.target, id), 0);
    assert.equal(existsSync(join(f.target, 'VERSION')), false);
    assert.deepEqual(readFileSync(markerPath), original);
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test('repair refuses a missing file whose recorded template has changed', () => {
  const f = fixture();
  try {
    f.put(join(f.language, 'missing'), 'new template');
    f.marker({ missing: hash('original template') });
    const markerBefore = readFileSync(join(f.target, '.qa-project.json'));
    assert.equal(projectUpgrade(f.env, f.target, 'repair'), 1);
    assert.equal(projectUpgradePlan(f.env, f.target).entries.find((entry) => entry.path === 'missing')?.status, 'missing');
    assert.deepEqual(readFileSync(join(f.target, '.qa-project.json')), markerBefore);
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test('Python upgrade blocks stale dependency locks and adopts a reconciled source', () => {
  const f = fixture('python');
  try {
    f.put(join(f.language, 'requirements.in'), 'new requirement');
    f.put(join(f.target, 'requirements.in'), 'old requirement');
    f.put(join(f.target, 'requirements.lock'), 'old lock');
    f.put(join(f.target, 'requirements.lock.meta.json'), JSON.stringify({ requirements_in_sha256: hash('old requirement') }));
    f.marker({ 'requirements.in': hash('old requirement') });
    assert.equal(projectUpgrade(f.env, f.target, 'upgrade'), 1);
    assert.equal(readFileSync(join(f.target, 'requirements.in'), 'utf8'), 'old requirement');
    assert.equal(projectUpgradePlan(f.env, f.target).entries.find((entry) => entry.path === 'VERSION')?.status, 'new');
    f.put(join(f.target, 'requirements.in'), 'new requirement');
    assert.equal(projectUpgrade(f.env, f.target, 'upgrade'), 1);
    f.put(join(f.target, 'requirements.lock.meta.json'), JSON.stringify({ requirements_in_sha256: hash('new requirement') }));
    assert.equal(projectUpgrade(f.env, f.target, 'upgrade'), 0);
    assert.equal(projectUpgradePlan(f.env, f.target).entries.find((entry) => entry.path === 'requirements.in')?.status, 'unchanged');
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
