import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import type { Environment } from './environment.ts';
import { projectMarker } from './project.ts';
import { rejectLinks, type ProjectUpgradePlan } from './project-upgrade-plan.ts';
import { digest, within } from './shared.ts';

interface SnapshotFile { path: string; before?: string; beforeHash?: string; beforeMode?: number; afterHash: string }
interface Snapshot {
  schema: 1;
  target: string;
  marker: string;
  markerMode: number;
  markerHashes: string[];
  files: SnapshotFile[];
}

/** Hash binary data and generated JSON without depending on filesystem state. */
function hash(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }

function snapshotDirectory(env: Environment, target: string): string {
  const directory = join(env.root, 'project-snapshots', hash(target));
  rejectLinks(directory, env.root);
  return directory;
}

function projectPath(target: string, name: string): string {
  if (!name || isAbsolute(name) || name.includes('\\') || name.includes(':') || name.includes('\0')
    || name.split('/').some((part) => !part || part === '.' || part === '..') || name === '.qa-project.json') {
    throw new Error(`Unsafe snapshot path: ${name}`);
  }
  const path = join(target, ...name.split('/'));
  const rel = relative(target, path);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Unsafe snapshot path: ${name}`);
  rejectLinks(path, target);
  return path;
}

/** Save a content-addressed snapshot before changing any project file. */
export function saveProjectSnapshot(env: Environment, plan: ProjectUpgradePlan): string {
  const { target, markerPath, state } = projectMarker(plan.target);
  const beforeMarker = readFileSync(markerPath);
  if (hash(beforeMarker) !== plan.markerHash) throw new Error('Project record changed after planning; retry');
  const nextState = structuredClone(state);
  const markerHashes = [hash(beforeMarker)];
  const files: SnapshotFile[] = [];
  for (const entry of plan.entries) {
    if (!['update', 'missing', 'new', 'adopt'].includes(entry.status)) continue;
    const path = projectPath(target, entry.path);
    const before = existsSync(path) ? readFileSync(path) : undefined;
    if ((before ? hash(before) : undefined) !== entry.currentHash || !entry.templateHash) throw new Error(`Project or template changed before snapshot: ${entry.path}`);
    files.push({ path: entry.path, ...(before ? { before: before.toString('base64'), beforeHash: hash(before), beforeMode: lstatSync(path).mode & 0o777 } : {}), afterHash: entry.templateHash });
    nextState.files[entry.path] = entry.templateHash;
    markerHashes.push(hash(`${JSON.stringify(nextState, null, 2)}\n`));
  }
  for (const entry of plan.entries) if (entry.status === 'removed' && !entry.currentHash) delete nextState.files[entry.path];
  nextState.language_template_version = plan.templateVersions.language;
  nextState.qa_template_version = plan.templateVersions.qa;
  markerHashes.push(hash(`${JSON.stringify(nextState, null, 2)}\n`));
  const snapshot: Snapshot = { schema: 1, target, marker: beforeMarker.toString('base64'), markerMode: lstatSync(markerPath).mode & 0o777, markerHashes, files };
  const content = `${JSON.stringify(snapshot)}\n`;
  const id = hash(content);
  const directory = snapshotDirectory(env, target);
  mkdirSync(directory, { recursive: true });
  rejectLinks(directory, env.root);
  const path = join(directory, `${id}.json`);
  rejectLinks(path, env.root);
  try { writeFileSync(path, content, { flag: 'wx' }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || digest(path) !== id) throw error;
  }
  console.log(`Project snapshot: ${id}`);
  return id;
}

/** List available content-addressed snapshots for an initialized project. */
export function projectSnapshots(env: Environment, targetInput: string): string[] {
  const { target, state } = projectMarker(targetInput);
  env.requireInitialized(state.stack);
  const directory = snapshotDirectory(env, target);
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => /^[a-f0-9]{64}\.json$/u.test(name)).map((name) => name.slice(0, -5)).sort();
}

/** Roll back a completed or interrupted upgrade when no affected content changed. */
export function projectRollback(env: Environment, targetInput: string, id: string): number {
  if (!/^[a-f0-9]{64}$/u.test(id)) throw new Error('Invalid project snapshot identifier');
  const { target, markerPath, state } = projectMarker(targetInput);
  env.requireInitialized(state.stack);
  const realTarget = realpathSync(target);
  const realEnvironment = realpathSync(env.root);
  if (within(realTarget, realEnvironment) || within(realEnvironment, realTarget)) throw new Error('Project overlaps environment');
  const path = join(snapshotDirectory(env, target), `${id}.json`);
  rejectLinks(path, env.root);
  if (!existsSync(path) || !lstatSync(path).isFile()) throw new Error('Project snapshot is missing or corrupted');
  const content = readFileSync(path);
  if (hash(content) !== id) throw new Error('Project snapshot is missing or corrupted');
  const snapshot = JSON.parse(content.toString('utf8')) as Snapshot;
  if (snapshot.schema !== 1 || snapshot.target !== target || typeof snapshot.marker !== 'string'
    || !Number.isInteger(snapshot.markerMode) || snapshot.markerMode < 0 || snapshot.markerMode > 0o777
    || !Array.isArray(snapshot.files) || !Array.isArray(snapshot.markerHashes)
    || !snapshot.markerHashes.every((item) => typeof item === 'string' && /^[a-f0-9]{64}$/u.test(item))) throw new Error('Invalid project snapshot');
  const originalMarker = Buffer.from(snapshot.marker, 'base64');
  const originalState = JSON.parse(originalMarker.toString('utf8')) as { owner?: unknown; target?: unknown };
  if (originalState.owner !== state.owner || originalState.target !== target || !snapshot.markerHashes.includes(hash(originalMarker))) throw new Error('Invalid snapshot ownership');
  const initialMarkerHash = digest(markerPath);
  if (!snapshot.markerHashes.includes(initialMarkerHash)) throw new Error('Project record changed after the snapshot');
  const names = new Set<string>();
  for (const file of snapshot.files) {
    if (!file || typeof file.path !== 'string' || names.has(file.path) || typeof file.afterHash !== 'string'
      || !/^[a-f0-9]{64}$/u.test(file.afterHash) || (file.before === undefined && (file.beforeHash !== undefined || file.beforeMode !== undefined))
      || (file.before !== undefined && (typeof file.before !== 'string' || typeof file.beforeHash !== 'string'
      || !Number.isInteger(file.beforeMode) || file.beforeMode! < 0 || file.beforeMode! > 0o777
      || !/^[a-f0-9]{64}$/u.test(file.beforeHash) || hash(Buffer.from(file.before, 'base64')) !== file.beforeHash))) throw new Error('Invalid project snapshot entry');
    names.add(file.path);
    const output = projectPath(target, file.path);
    if (existsSync(output) && !lstatSync(output).isFile()) throw new Error(`Project file is not regular: ${file.path}`);
    const current = existsSync(output) ? digest(output) : undefined;
    if (current !== file.beforeHash && current !== file.afterHash) throw new Error(`Project file changed after the snapshot: ${file.path}`);
  }
  for (const file of snapshot.files) {
    const output = projectPath(target, file.path);
    const current = existsSync(output) ? digest(output) : undefined;
    if (current === file.beforeHash) continue;
    if (current !== file.afterHash || digest(markerPath) !== initialMarkerHash) throw new Error(`Project changed during rollback: ${file.path}`);
    if (file.before === undefined) unlinkSync(output);
    else {
      const temporary = join(dirname(output), `.qa-rollback-${randomUUID()}`);
      try {
        writeFileSync(temporary, Buffer.from(file.before, 'base64'), { flag: 'wx' });
        chmodSync(temporary, file.beforeMode!);
        if (digest(output) !== file.afterHash) throw new Error(`Project changed during rollback: ${file.path}`);
        renameSync(temporary, output);
      } finally { if (existsSync(temporary)) unlinkSync(temporary); }
    }
  }
  if (digest(markerPath) !== initialMarkerHash) throw new Error('Project record changed during rollback');
  const temporary = join(dirname(markerPath), `.qa-rollback-${randomUUID()}`);
  try {
    writeFileSync(temporary, originalMarker, { flag: 'wx' });
    chmodSync(temporary, snapshot.markerMode);
    renameSync(temporary, markerPath);
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  console.log(`Rolled back project snapshot: ${id}`);
  return 0;
}
