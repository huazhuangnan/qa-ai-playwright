import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'bun:test';
import { Environment } from '../packages/qa-cli/cli/environment.ts';
import { listEnvironmentUvSnapshots, planEnvironmentUv, rollbackEnvironmentUv, upgradeEnvironmentUv } from '../packages/qa-cli/cli/environment-upgrade.ts';
import { OWNER } from '../packages/qa-cli/cli/shared.ts';

/** Provide a managed environment without installing external software. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'qa-uv-upgrade-'));
  const bootstrap = join(root, 'bootstrap');
  mkdirSync(bootstrap);
  const uv = join(bootstrap, 'uv');
  const stateFile = join(root, 'state.json');
  const marker = join(root, '.qa-managed');
  writeFileSync(marker, OWNER);
  const state: Record<string, unknown> = { uv: 'uv 1.0.0', uv_sha256: createHash('sha256').update('uv-original').digest('hex'), stack: 'python' };
  writeFileSync(uv, 'uv-original');
  const save = (): void => writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  save();
  const env = {
    root, uv, stateFile, marker, state, uvVersion: '2.0.0', requireInitialized: () => {}, save,
    run: () => 'uv 1.0.0',
    ensureUv: async function (this: Environment) { writeFileSync(this.uv, 'uv-upgraded'); return 'uv 2.0.0'; },
  } as unknown as Environment;
  return { env, root, uv, state, stateFile };
}

test('uv upgrade creates an owned snapshot and rolls back the version and binary', async () => {
  const f = fixture();
  try {
    assert.equal(planEnvironmentUv(f.env).action, 'upgrade');
    const result = await upgradeEnvironmentUv(f.env);
    assert.equal(result.status, 'applied');
    assert.ok(result.id);
    assert.equal(listEnvironmentUvSnapshots(f.env)[0]?.phase, 'applied');
    assert.equal(readFileSync(f.uv, 'utf8'), 'uv-upgraded');
    assert.equal(f.state.uv, 'uv 2.0.0');
    assert.equal(f.state.uv_sha256, createHash('sha256').update('uv-upgraded').digest('hex'));
    await rollbackEnvironmentUv(f.env, result.id);
    assert.equal(readFileSync(f.uv, 'utf8'), 'uv-original');
    assert.equal(f.state.uv, 'uv 1.0.0');
    assert.equal(f.state.uv_sha256, createHash('sha256').update('uv-original').digest('hex'));
    await assert.rejects(() => rollbackEnvironmentUv(f.env, result.id!), /already restored/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('uv planning refuses missing or mismatched ownership without changing the executable', () => {
  for (const scenario of ['missing', 'wrong', 'modified']) {
    const f = fixture();
    try {
      if (scenario === 'missing') delete f.state.uv_sha256;
      if (scenario === 'wrong') f.state.uv_sha256 = '0'.repeat(64);
      if (scenario === 'modified') writeFileSync(f.uv, 'user-modified');
      writeFileSync(f.stateFile, `${JSON.stringify(f.state, null, 2)}\n`);
      const before = readFileSync(f.uv, 'utf8');
      assert.throws(() => planEnvironmentUv(f.env), /ownership hash is missing or mismatched/);
      assert.equal(readFileSync(f.uv, 'utf8'), before);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});

test('uv initialization preserves an unowned or modified executable', async () => {
  for (const scenario of ['missing', 'wrong']) {
    const f = fixture();
    try {
      if (scenario === 'missing') delete f.state.uv_sha256;
      else f.state.uv_sha256 = '0'.repeat(64);
      Object.setPrototypeOf(f.env, Environment.prototype);
      let invoked = false;
      f.env.run = () => { invoked = true; return 'uv 1.0.0'; };
      await assert.rejects(() => Environment.prototype.ensureUv.call(f.env), /ownership hash/);
      assert.equal(readFileSync(f.uv, 'utf8'), 'uv-original');
      if (scenario === 'wrong') assert.equal(invoked, false);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});

test('initialization preserves an owned uv with a different version', async () => {
  const f = fixture();
  try {
    Object.setPrototypeOf(f.env, Environment.prototype);
    await assert.rejects(() => Environment.prototype.ensureUv.call(f.env), /use qa env plan uv/);
    assert.equal(readFileSync(f.uv, 'utf8'), 'uv-original');
    assert.equal(listEnvironmentUvSnapshots(f.env).length, 0);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('a verified uv is recorded before later initialization and checked on retry', async () => {
  const f = fixture();
  try {
    delete f.state.uv_sha256;
    Object.setPrototypeOf(f.env, Environment.prototype);
    Object.defineProperty(f.env, 'uvVersion', { value: '1.0.0' });
    f.env.recordUvOwnership();
    const persisted = JSON.parse(readFileSync(f.stateFile, 'utf8')) as Record<string, unknown>;
    assert.equal(persisted.uv_sha256, createHash('sha256').update('uv-original').digest('hex'));
    Object.assign(f.state, persisted);
    assert.equal(await Environment.prototype.ensureUv.call(f.env), 'uv 1.0.0');
    writeFileSync(f.uv, 'modified-after-failure');
    await assert.rejects(() => Environment.prototype.ensureUv.call(f.env), /ownership hash is mismatched/);
    assert.equal(readFileSync(f.uv, 'utf8'), 'modified-after-failure');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('uv rollback preserves a subsequently modified executable', async () => {
  const f = fixture();
  try {
    const result = await upgradeEnvironmentUv(f.env);
    writeFileSync(f.uv, 'user-modified');
    await assert.rejects(() => rollbackEnvironmentUv(f.env, result.id!), /changed after upgrade/);
    assert.equal(readFileSync(f.uv, 'utf8'), 'user-modified');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('a failed staging download keeps the original executable and can be rolled back', async () => {
  const f = fixture();
  try {
    f.env.ensureUv = async () => { throw new Error('download failed'); };
    let id = '';
    await assert.rejects(() => upgradeEnvironmentUv(f.env), (error: Error) => {
      id = error.message.match(/snapshot ([0-9a-f-]+)/u)?.[1] ?? '';
      return !!id;
    });
    assert.equal(readFileSync(f.uv, 'utf8'), 'uv-original');
    await rollbackEnvironmentUv(f.env, id);
    assert.equal(readFileSync(f.uv, 'utf8'), 'uv-original');
    assert.equal(f.state.uv, 'uv 1.0.0');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('an interrupted state write can be rolled back using the prepared snapshot', async () => {
  const f = fixture();
  try {
    const result = await upgradeEnvironmentUv(f.env);
    const id = result.id!;
    const metadata = join(f.root, 'bootstrap', 'uv-snapshots', id, 'snapshot.json');
    const snapshot = JSON.parse(readFileSync(metadata, 'utf8')) as { phase: string };
    snapshot.phase = 'prepared';
    writeFileSync(metadata, JSON.stringify(snapshot));
    unlinkSync(f.stateFile);
    assert.equal(readFileSync(f.uv, 'utf8'), 'uv-upgraded');
    assert.equal(listEnvironmentUvSnapshots(f.env)[0]?.phase, 'prepared');
    await rollbackEnvironmentUv(f.env, id);
    assert.equal(readFileSync(f.uv, 'utf8'), 'uv-original');
    assert.equal(f.state.uv, 'uv 1.0.0');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('a live process guard blocks upgrades', async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, 'bootstrap', '.uv-upgrade.guard'), JSON.stringify({ pid: process.pid, host: hostname() }));
    await assert.rejects(() => upgradeEnvironmentUv(f.env), /busy/);
    assert.equal(readFileSync(f.uv, 'utf8'), 'uv-original');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('a guard from an exited local process can be recovered', async () => {
  const f = fixture();
  try {
    const child = spawnSync(process.execPath, ['-e', ''], { stdio: 'ignore' });
    assert.equal(child.status, 0);
    assert.ok(child.pid);
    writeFileSync(join(f.root, 'bootstrap', '.uv-upgrade.guard'), JSON.stringify({ pid: child.pid, host: hostname() }));
    assert.equal((await upgradeEnvironmentUv(f.env)).status, 'applied');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
