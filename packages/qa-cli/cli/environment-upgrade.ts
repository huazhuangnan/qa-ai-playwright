import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import type { Environment } from './environment.ts';
import { digest, OWNER } from './shared.ts';

interface UvSnapshot {
  schema: 1;
  component: 'uv';
  root: string;
  id: string;
  phase: 'prepared' | 'applied' | 'restored';
  beforeHash: string;
  beforeVersion: string;
  beforeMode: number;
  beforeStateHash: string;
  afterHash?: string;
  afterVersion?: string;
  afterStateHash?: string;
}

/** Reject links at every managed component boundary before accessing files. */
function assertSafe(env: Environment, id?: string): { directory: string; metadata: string; binary: string; state: string } {
  const bootstrap = join(env.root, 'bootstrap');
  const snapshots = join(bootstrap, 'uv-snapshots');
  if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id)) throw new Error('Invalid uv snapshot identifier');
  const directory = id ? join(snapshots, id) : snapshots;
  const metadata = join(directory, 'snapshot.json');
  const binary = join(directory, 'uv.original');
  const state = join(directory, 'state.original');
  for (const path of [env.root, bootstrap, env.uv, env.marker, env.stateFile, snapshots, ...(id ? [directory, metadata, binary, state] : [])]) {
    try {
      if (lstatSync(path).isSymbolicLink()) throw new Error(`Linked environment path is unsupported: ${path}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return { directory, metadata, binary, state };
}

/** Summarizes the installed, recorded and target uv versions without writes. */
export function planEnvironmentUv(env: Environment): { component: 'uv'; installed: string; recorded: string; target: string; action: 'unchanged' | 'upgrade' } {
  env.requireInitialized('python');
  assertSafe(env);
  if (!existsSync(env.uv) || !lstatSync(env.uv).isFile()) throw new Error('Managed uv is missing; use env repair first');
  if (typeof env.state.uv_sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(env.state.uv_sha256)
    || digest(env.uv) !== env.state.uv_sha256) {
    throw new Error('Cannot upgrade uv: ownership hash is missing or mismatched. Back up and move the existing uv manually, then rerun env init.');
  }
  if (!/^\d+\.\d+\.\d+$/u.test(env.uvVersion)) throw new Error('An exact uv target version is required');
  const installed = (env.run([env.uv, '--version'], { capture: true }) ?? '').trim();
  const recorded = typeof env.state.uv === 'string' ? env.state.uv.trim() : '';
  const persisted = JSON.parse(readFileSync(env.stateFile, 'utf8')) as Record<string, unknown>;
  if (!/^uv \d+\.\d+\.\d+(?:\s.*)?$/u.test(installed) || installed !== recorded
    || typeof persisted.uv !== 'string' || persisted.uv.trim() !== recorded
    || JSON.stringify(persisted) !== JSON.stringify(env.state)) throw new Error('Managed uv version differs from its environment record');
  return { component: 'uv', installed, recorded, target: env.uvVersion,
    action: installed === `uv ${env.uvVersion}` || installed.startsWith(`uv ${env.uvVersion} `) ? 'unchanged' : 'upgrade' };
}

/** List valid snapshots without requiring a still-present environment state file. */
export function listEnvironmentUvSnapshots(env: Environment): { id: string; phase: UvSnapshot['phase'] | 'incomplete'; beforeVersion?: string; afterVersion?: string }[] {
  const base = assertSafe(env);
  if (!existsSync(env.marker) || readFileSync(env.marker, 'utf8').trim() !== OWNER) throw new Error('Invalid environment ownership marker');
  if (!existsSync(base.directory)) return [];
  const snapshots: { id: string; phase: UvSnapshot['phase'] | 'incomplete'; beforeVersion?: string; afterVersion?: string }[] = [];
  for (const id of readdirSync(base.directory).sort()) {
    const paths = assertSafe(env, id);
    if (!existsSync(paths.metadata)) {
      snapshots.push({ id, phase: 'incomplete' });
      continue;
    }
    const snapshot = JSON.parse(readFileSync(paths.metadata, 'utf8')) as UvSnapshot;
    if (snapshot.schema !== 1 || snapshot.component !== 'uv' || snapshot.root !== env.root || snapshot.id !== id
      || !['prepared', 'applied', 'restored'].includes(snapshot.phase) || typeof snapshot.beforeVersion !== 'string'
      || (snapshot.afterVersion !== undefined && typeof snapshot.afterVersion !== 'string')) throw new Error(`Invalid uv snapshot: ${id}`);
    snapshots.push({ id, phase: snapshot.phase, beforeVersion: snapshot.beforeVersion,
      ...(snapshot.afterVersion ? { afterVersion: snapshot.afterVersion } : {}) });
  }
  return snapshots;
}

async function guarded<T>(env: Environment, action: () => Promise<T>): Promise<T> {
  assertSafe(env);
  const bootstrap = join(env.root, 'bootstrap');
  const guard = join(bootstrap, '.uv-upgrade.guard');
  const candidate = join(bootstrap, `.uv-guard-${randomUUID()}`);
  const owner = JSON.stringify({ pid: process.pid, host: hostname() });
  writeFileSync(candidate, owner, { flag: 'wx' });
  try {
    for (let attempt = 0; ; attempt += 1) {
      try { linkSync(candidate, guard); break; } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || attempt > 0) throw new Error(`Environment uv upgrade is busy or requires guard inspection: ${guard}`);
        let existing: { pid?: unknown; host?: unknown };
        let content: string;
        try {
          if (!lstatSync(guard).isFile() || lstatSync(guard).isSymbolicLink()) throw new Error('Invalid guard');
          content = readFileSync(guard, 'utf8');
          existing = JSON.parse(content) as { pid?: unknown; host?: unknown };
          if (existing.host !== hostname() || !Number.isSafeInteger(existing.pid) || (existing.pid as number) < 1) throw new Error('Unknown guard owner');
          try { process.kill(existing.pid as number, 0); throw new Error('Owner still running'); }
          catch (check) { if ((check as NodeJS.ErrnoException).code !== 'ESRCH') throw check; }
          if (readFileSync(guard, 'utf8') !== content) throw new Error('Guard changed');
          unlinkSync(guard);
        } catch { throw new Error(`Environment uv upgrade is busy or requires guard inspection: ${guard}`); }
      }
    }
    try { return await action(); }
    finally { if (existsSync(guard) && readFileSync(guard, 'utf8') === owner) unlinkSync(guard); }
  } finally { if (existsSync(candidate)) unlinkSync(candidate); }
}

/** Replace snapshot metadata without deleting the previous committed metadata first. */
function saveSnapshot(path: string, data: UvSnapshot): void {
  const temporary = join(dirname(path), `.snapshot-${randomUUID()}`);
  try {
    writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
    renameSync(temporary, path);
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
}

/** Commit the new state without removing the previous state or rewriting its ownership marker. */
function saveEnvironmentState(env: Environment): void {
  const temporary = join(env.root, `.uv-state-${randomUUID()}`);
  try {
    writeFileSync(temporary, `${JSON.stringify(env.state, null, 2)}\n`, { flag: 'wx' });
    renameSync(temporary, env.stateFile);
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
}

/** Upgrade only the environment-owned uv executable and retain an explicit snapshot. */
export async function upgradeEnvironmentUv(env: Environment): Promise<{ id?: string; status: 'unchanged' | 'applied'; installed: string }> {
  return guarded(env, async () => {
    const plan = planEnvironmentUv(env);
    if (plan.action === 'unchanged') return { status: 'unchanged', installed: plan.installed };
    const id = randomUUID();
    const base = assertSafe(env);
    mkdirSync(base.directory, { recursive: true });
    const paths = assertSafe(env, id);
    mkdirSync(paths.directory);
    const beforeHash = digest(env.uv);
    const beforeStateHash = digest(env.stateFile);
    copyFileSync(env.uv, paths.binary);
    copyFileSync(env.stateFile, paths.state);
    if (digest(paths.binary) !== beforeHash || digest(env.uv) !== beforeHash) throw new Error(`uv changed while creating snapshot ${id}`);
    if (digest(paths.state) !== beforeStateHash || digest(env.stateFile) !== beforeStateHash) throw new Error(`Environment state changed while creating snapshot ${id}`);
    const snapshot: UvSnapshot = { schema: 1, component: 'uv', root: env.root, id, phase: 'prepared', beforeHash,
      beforeVersion: plan.recorded, beforeMode: lstatSync(env.uv).mode & 0o777, beforeStateHash };
    saveSnapshot(paths.metadata, snapshot);
    try {
      if (digest(env.uv) !== beforeHash || digest(env.stateFile) !== beforeStateHash) throw new Error('Environment changed before uv upgrade');
      const stageRoot = join(paths.directory, 'stage');
      const stageBootstrap = join(stageRoot, 'bootstrap');
      mkdirSync(stageBootstrap, { recursive: true });
      mkdirSync(join(stageRoot, 'tmp'));
      const stage = Object.create(env) as Environment;
      const stageUv = join(stageBootstrap, process.platform === 'win32' ? 'uv.exe' : 'uv');
      Object.defineProperties(stage, { root: { value: stageRoot }, uv: { value: stageUv }, state: { value: { ...env.state } },
        save: { value: () => {} } });
      const installed = (await stage.ensureUv()).trim();
      if (!(installed === `uv ${plan.target}` || installed.startsWith(`uv ${plan.target} `))) throw new Error('Installed uv does not match the target version');
      assertSafe(env, id);
      if ([stageRoot, stageBootstrap, stageUv].some((path) => lstatSync(path).isSymbolicLink())
        || !lstatSync(stageUv).isFile()) throw new Error('Staged uv is not a regular file');
      if (digest(env.stateFile) !== beforeStateHash) throw new Error('Environment state changed during upgrade');
      snapshot.afterHash = digest(stageUv);
      snapshot.afterVersion = installed;
      env.state.uv = installed;
      env.state.uv_sha256 = snapshot.afterHash;
      snapshot.afterStateHash = createHash('sha256').update(`${JSON.stringify(env.state, null, 2)}\n`).digest('hex');
      // Persist recovery facts before committing the new environment record.
      saveSnapshot(paths.metadata, snapshot);
      if (digest(env.uv) !== beforeHash || digest(env.stateFile) !== beforeStateHash || digest(stageUv) !== snapshot.afterHash) throw new Error('Environment changed before uv replacement');
      renameSync(stageUv, env.uv);
      saveEnvironmentState(env);
      if (digest(env.stateFile) !== snapshot.afterStateHash) throw new Error('Environment state could not be verified');
      snapshot.phase = 'applied';
      saveSnapshot(paths.metadata, snapshot);
      return { id, status: 'applied', installed };
    } catch (error) {
      throw new Error(`uv upgrade did not complete; inspect snapshot ${id} before recovery: ${String(error)}`);
    }
  });
}

/** Restore a snapshot only if both the owned binary and environment record match it. */
export async function rollbackEnvironmentUv(env: Environment, id: string): Promise<void> {
  await guarded(env, async () => {
    const paths = assertSafe(env, id);
    if (!existsSync(env.marker) || readFileSync(env.marker, 'utf8').trim() !== OWNER) throw new Error('Invalid environment ownership marker');
    const data = JSON.parse(readFileSync(paths.metadata, 'utf8')) as UvSnapshot;
    if (data.schema !== 1 || data.component !== 'uv' || data.id !== id || data.root !== env.root
      || !/^[a-f0-9]{64}$/u.test(data.beforeHash) || digest(paths.binary) !== data.beforeHash
      || !/^[a-f0-9]{64}$/u.test(data.beforeStateHash) || digest(paths.state) !== data.beforeStateHash || typeof data.beforeVersion !== 'string'
      || !/^uv \d+\.\d+\.\d+(?:\s.*)?$/u.test(data.beforeVersion)
      || !Number.isInteger(data.beforeMode) || data.beforeMode < 0 || data.beforeMode > 0o777) throw new Error('Invalid uv snapshot');
    const restoredState = JSON.parse(readFileSync(paths.state, 'utf8')) as Record<string, unknown>;
    if (typeof restoredState.uv !== 'string' || restoredState.uv.trim() !== data.beforeVersion) throw new Error('uv snapshot state does not match its version record');
    if (data.phase === 'restored') throw new Error('uv snapshot was already restored');
    const currentState = existsSync(env.stateFile) ? digest(env.stateFile) : undefined;
    if (data.phase === 'prepared') {
      const knownState = !currentState || currentState === data.beforeStateHash || (!!data.afterStateHash && currentState === data.afterStateHash);
      const currentHash = existsSync(env.uv) ? digest(env.uv) : undefined;
      const knownBinary = !currentHash || currentHash === data.beforeHash || (!!data.afterHash && currentHash === data.afterHash);
      if (!knownState || !knownBinary) {
        throw new Error('Interrupted uv upgrade has unknown changes; inspect snapshot and environment manually');
      }
    } else if (data.phase === 'applied') {
      if (!data.afterHash || !data.afterVersion || !data.afterStateHash
        || (currentState && currentState !== data.afterStateHash && currentState !== data.beforeStateHash)
        || (existsSync(env.uv) && ![data.afterHash, data.beforeHash].includes(digest(env.uv)))) {
        throw new Error('uv or its environment record changed after upgrade; rollback stopped');
      }
    } else throw new Error('Invalid uv snapshot phase');
    const temporary = join(dirname(env.uv), `.uv-restore-${id}`);
    try {
      writeFileSync(temporary, readFileSync(paths.binary), { flag: 'wx', mode: data.beforeMode });
      if (digest(temporary) !== data.beforeHash) throw new Error('uv snapshot copy failed verification');
      if (process.platform !== 'win32') chmodSync(temporary, data.beforeMode);
      assertSafe(env, id);
      const priorBinary = existsSync(env.uv) ? digest(env.uv) : undefined;
      const allowedBinary = priorBinary === undefined || priorBinary === data.beforeHash || priorBinary === data.afterHash;
      const priorState = existsSync(env.stateFile) ? digest(env.stateFile) : undefined;
      if (!allowedBinary || priorState !== currentState) throw new Error('Environment changed during uv rollback');
      renameSync(temporary, env.uv);
      const stateTemporary = join(env.root, `.uv-state-restore-${id}`);
      try {
        writeFileSync(stateTemporary, readFileSync(paths.state), { flag: 'wx' });
        if (digest(stateTemporary) !== data.beforeStateHash) throw new Error('Environment state snapshot copy failed verification');
        assertSafe(env, id);
        const stateNow = existsSync(env.stateFile) ? digest(env.stateFile) : undefined;
        if (stateNow !== currentState) throw new Error('Environment state changed during uv rollback');
        renameSync(stateTemporary, env.stateFile);
      } finally { if (existsSync(stateTemporary)) unlinkSync(stateTemporary); }
      for (const key of Object.keys(env.state)) delete env.state[key];
      Object.assign(env.state, restoredState);
      data.phase = 'restored';
      saveSnapshot(paths.metadata, data);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  });
}
