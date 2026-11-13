import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { digest, REPO } from './shared.ts';

interface SkillRecord {
  scope: 'project';
  source: string;
  version: string;
  files: Record<string, string>;
}
type SkillLock = Record<string, SkillRecord>;

/** An installed Skill's ownership and integrity relative to the QA lock. */
export interface BuiltinSkillStatus {
  name: string;
  status: 'missing' | 'installed' | 'modified' | 'unmanaged';
  version?: string;
}

function validName(name: string): boolean { return /^qa-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name); }

function validRelative(path: string): boolean {
  return !!path && path.split('/').every((part) => !!part && part !== '.' && part !== '..'
    && !/[\\<>:"|?*\u0000-\u001f]/u.test(part) && !/[. ]$/u.test(part)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part));
}

/** Reject links before reading, writing or deleting a managed path. */
function safePath(root: string, relative: string): string {
  const parts = relative.split('/');
  if (!validRelative(relative)) throw new Error(`Invalid Skill path: ${relative}`);
  let path = root;
  for (const part of parts) {
    path = join(path, part);
    try {
      if (lstatSync(path).isSymbolicLink()) throw new Error(`Skill path is a link: ${path}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return path;
}

function projectRoot(project: string): string {
  const root = resolve(project);
  if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) throw new Error(`Invalid project directory: ${root}`);
  return realpathSync(root);
}

function readLock(root: string): SkillLock {
  const path = safePath(root, '.agents/qa-skills-lock.json');
  if (!existsSync(path)) return {};
  const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid Skill lock');
  for (const [name, item] of Object.entries(data)) {
    const record = item as SkillRecord;
    if (!validName(name) || !record || record.scope !== 'project' || record.source !== `packages/skills/builtin/${name}`
      || typeof record.version !== 'string' || !record.files || typeof record.files !== 'object' || Array.isArray(record.files)
      || Object.entries(record.files).some(([file, hash]) => !validRelative(file) || typeof hash !== 'string' || !/^[a-f0-9]{64}$/u.test(hash))) {
      throw new Error(`Invalid Skill lock record: ${name}`);
    }
  }
  return data as SkillLock;
}

function withGuard<T>(root: string, action: () => T, recovery = false): T {
  const agents = safePath(root, '.agents');
  if (!existsSync(agents)) mkdirSync(agents);
  const guard = safePath(root, '.agents/.qa-skills.guard');
  mkdirSync(guard);
  const owner = join(guard, 'owner.json');
  try {
    writeFileSync(owner, JSON.stringify({ pid: process.pid }), { flag: 'wx' });
    if (!recovery && existsSync(safePath(root, '.agents/.qa-skills-recovery.json'))) throw new Error('Pending Skill recovery; run skills recover first');
    return action();
  } finally {
    if (existsSync(owner)) unlinkSync(owner);
    rmdirSync(guard);
  }
}

function collect(root: string, path = ''): string[] {
  const directory = path ? safePath(root, path) : root;
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = path ? `${path}/${entry.name}` : entry.name;
    const absolute = safePath(root, relative);
    if (entry.isDirectory()) files.push(...collect(root, relative));
    else if (entry.isFile() && lstatSync(absolute).isFile()) files.push(relative);
    else throw new Error(`Unsupported Skill entry: ${absolute}`);
  }
  return files.sort();
}

function sourceDirectory(name: string, repo: string): string {
  if (!validName(name)) throw new Error(`Invalid Skill name: ${name}`);
  const source = safePath(resolve(repo), `packages/skills/builtin/${name}`);
  if (!existsSync(source) || !lstatSync(source).isDirectory() || !existsSync(safePath(source, 'SKILL.md'))) throw new Error(`Unknown builtin Skill: ${name}`);
  return source;
}

function sourceVersion(source: string, name: string): string {
  const version = readFileSync(join(source, 'SKILL.md'), 'utf8').match(/^\s+version:\s*["']?([^"'\s]+)["']?\s*$/mu)?.[1];
  if (!version) throw new Error(`Missing Skill version: ${name}`);
  return version;
}

function status(root: string, name: string, record?: SkillRecord): BuiltinSkillStatus {
  const dir = safePath(root, `.agents/skills/${name}`);
  if (!record) return { name, status: existsSync(dir) ? 'unmanaged' : 'missing' };
  let modified = false;
  for (const [file, hash] of Object.entries(record.files)) {
    try {
      const path = safePath(dir, file);
      if (!existsSync(path) || !lstatSync(path).isFile() || digest(path) !== hash) modified = true;
    } catch { modified = true; }
  }
  return { name, status: modified ? 'modified' : 'installed', version: record.version };
}

/** List builtin Skills and their project ownership and integrity status. */
export function listBuiltinSkills(project: string, repo = REPO): BuiltinSkillStatus[] {
  const root = projectRoot(project);
  const lock = readLock(root);
  const directory = safePath(resolve(repo), 'packages/skills/builtin');
  const names = new Set([...readdirSync(directory).filter(validName), ...Object.keys(lock)]);
  return [...names].sort().map((name) => status(root, name, lock[name]));
}

/** Install an absent builtin Skill without taking ownership of existing files. */
export function installBuiltinSkill(project: string, name: string, repo = REPO): void {
  const root = projectRoot(project);
  const source = sourceDirectory(name, repo);
  withGuard(root, () => {
    const lock = readLock(root);
    const current = status(root, name, lock[name]);
    if (current.status === 'installed') return;
    if (current.status !== 'missing' || lock[name]) throw new Error(`Skill ${name} is ${current.status}; existing files are preserved`);
    const skills = safePath(root, '.agents/skills');
    if (!existsSync(skills)) mkdirSync(skills);
    const target = safePath(root, `.agents/skills/${name}`);
    const files = collect(source);
    const version = sourceVersion(source, name);
    if (!files.includes('SKILL.md')) throw new Error(`Missing SKILL.md: ${name}`);
    const changes: FileChange[] = [];
    const hashes: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const file of files) {
      const contents = readFileSync(safePath(source, file));
      hashes[file] = createHash('sha256').update(contents).digest('hex');
      changes.push({ path: safePath(target, file), after: contents });
    }
    lock[name] = { scope: 'project', source: `packages/skills/builtin/${name}`, version, files: hashes };
    const lockPath = safePath(root, '.agents/qa-skills-lock.json');
    changes.push({ path: lockPath, before: existsSync(lockPath) ? readFileSync(lockPath) : undefined, after: Buffer.from(`${JSON.stringify(lock, null, 2)}\n`) });
    let created = false;
    try {
      applyChanges(root, changes, () => { mkdirSync(target); created = true; });
    } catch (error) {
      if (created) { try { rmdirSync(target); } catch { /* Preserve any remaining content. */ } }
      throw new Error(`Skill installation failed at ${target}: ${String(error)}`);
    }
  });
}

interface FileChange { path: string; before?: Buffer; after?: Buffer; beforeMode?: number; afterMode?: number }

function replaceFile(path: string, contents: Buffer, create: boolean, mode?: number): void {
  const temporary = join(dirname(path), `.qa-skill-${process.pid}-${Math.random().toString(16).slice(2)}.tmp`);
  try {
    writeFileSync(temporary, contents, { flag: 'wx' });
    if (mode !== undefined) chmodSync(temporary, mode);
    if (create) linkSync(temporary, path);
    else {
      // Windows cannot atomically rename over an existing file.
      if (process.platform === 'win32' && existsSync(path)) unlinkSync(path);
      renameSync(temporary, path);
    }
  } finally {
    try { if (existsSync(temporary)) unlinkSync(temporary); } catch { /* Preserve the temporary file on cleanup failure. */ }
  }
}

/** Restore only paths still containing the content written by this operation. */
function restoreChanges(changes: FileChange[]): string[] {
  const failures: string[] = [];
  for (const change of [...changes].reverse()) {
    try {
      if (existsSync(change.path) && !lstatSync(change.path).isFile()) { failures.push(change.path); continue; }
      const current = existsSync(change.path) ? readFileSync(change.path) : undefined;
      if ((current === undefined) !== (change.after === undefined) || (current && change.after && !current.equals(change.after))) {
        failures.push(change.path);
        continue;
      }
      if (change.before === undefined) { if (current !== undefined) unlinkSync(change.path); }
      else replaceFile(change.path, change.before, current === undefined, change.beforeMode);
    } catch { failures.push(change.path); }
  }
  return failures;
}

interface RecoveryEntry { path: string; before: string | null; after: string | null; beforeMode?: number; afterMode?: number }

/** Validate that a recovery record can touch only project-owned Skill paths. */
function recoveryPath(root: string, path: string): string {
  if (path !== '.agents/qa-skills-lock.json' && !/^\.agents\/qa-skill-snapshots\/[a-f0-9]{64}\.json$/u.test(path)) {
    const parts = path.split('/');
    if (parts.length < 4 || parts[0] !== '.agents' || parts[1] !== 'skills' || !validName(parts[2] ?? '')) throw new Error(`Invalid Skill recovery path: ${path}`);
  }
  return safePath(root, path);
}

function recoveryBytes(value: unknown): Buffer | undefined {
  if (value === null) return undefined;
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) throw new Error('Invalid Skill recovery data');
  return Buffer.from(value, 'base64');
}

function recoveryMode(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 0o777) throw new Error('Invalid Skill recovery mode');
  return value;
}

function applyChanges(root: string, changes: FileChange[], prepare?: () => void): void {
  if (!changes.length) return;
  for (const change of changes) {
    if (change.before !== undefined && change.beforeMode === undefined) change.beforeMode = lstatSync(change.path).mode & 0o777;
    if (change.after !== undefined && change.afterMode === undefined && change.beforeMode !== undefined) change.afterMode = change.beforeMode;
  }
  const journal = safePath(root, '.agents/.qa-skills-recovery.json');
  const entries: RecoveryEntry[] = changes.map((change) => {
    const path = relative(root, change.path).split('\\').join('/');
    if (isAbsolute(path)) throw new Error('Invalid Skill recovery path');
    recoveryPath(root, path);
    return { path, before: change.before?.toString('base64') ?? null, after: change.after?.toString('base64') ?? null, beforeMode: change.beforeMode, afterMode: change.afterMode };
  });
  const temporaryJournal = join(dirname(journal), `.qa-skills-journal-${process.pid}-${Math.random().toString(16).slice(2)}.tmp`);
  try {
    writeFileSync(temporaryJournal, JSON.stringify({ schema: 1, entries }), { flag: 'wx' });
    linkSync(temporaryJournal, journal);
  } finally {
    if (existsSync(temporaryJournal)) unlinkSync(temporaryJournal);
  }
  const applied: FileChange[] = [];
  try {
    prepare?.();
    for (const change of changes) {
      if (change.before !== undefined && (!existsSync(change.path) || !lstatSync(change.path).isFile()
        || !readFileSync(change.path).equals(change.before)
        || (process.platform !== 'win32' && change.beforeMode !== undefined && (lstatSync(change.path).mode & 0o777) !== change.beforeMode))) throw new Error(`File changed during Skill operation: ${change.path}`);
      if (change.after === undefined) unlinkSync(change.path);
      else {
        mkdirSync(dirname(change.path), { recursive: true });
        replaceFile(change.path, change.after, change.before === undefined, change.afterMode);
      }
      applied.push(change);
    }
    unlinkSync(journal);
  } catch (error) {
    const failures = restoreChanges(applied);
    if (!failures.length && existsSync(journal)) unlinkSync(journal);
    throw new Error(`Skill operation failed: ${String(error)}${failures.length ? `; could not restore: ${failures.join(', ')}` : '; changes restored'}`);
  }
}

/** Recover interrupted Skill upgrade or repair without overwriting later edits. */
export function recoverBuiltinSkills(project: string): { restored: string[] } {
  const root = projectRoot(project);
  const guard = safePath(root, '.agents/.qa-skills.guard');
  if (existsSync(guard)) {
    const owner = safePath(root, '.agents/.qa-skills.guard/owner.json');
    let pid: unknown;
    try { pid = (JSON.parse(readFileSync(owner, 'utf8')) as { pid?: unknown }).pid; } catch { throw new Error('Cannot verify Skill guard owner; preserve it for inspection'); }
    if (!Number.isInteger(pid) || (pid as number) <= 0) throw new Error('Cannot verify Skill guard owner; preserve it for inspection');
    try { process.kill(pid as number, 0); throw new Error('Skill operation is still active'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    unlinkSync(owner);
    rmdirSync(guard);
  }
  return withGuard(root, () => {
    const journal = safePath(root, '.agents/.qa-skills-recovery.json');
    if (!existsSync(journal)) return { restored: [] };
    const data: unknown = JSON.parse(readFileSync(journal, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data) || (data as { schema?: unknown }).schema !== 1 || !Array.isArray((data as { entries?: unknown }).entries)) throw new Error('Invalid Skill recovery record');
    const entries = (data as { entries: unknown[] }).entries.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid Skill recovery entry');
      const entry = item as Record<string, unknown>;
      if (typeof entry.path !== 'string') throw new Error('Invalid Skill recovery path');
      const beforeMode = recoveryMode(entry.beforeMode);
      const afterMode = recoveryMode(entry.afterMode);
      return { path: recoveryPath(root, entry.path), before: recoveryBytes(entry.before), after: recoveryBytes(entry.after), beforeMode, afterMode };
    });
    if (new Set(entries.map((entry) => entry.path)).size !== entries.length) throw new Error('Duplicate Skill recovery path');
    const restored: string[] = [];
    for (const change of entries) {
      const current = existsSync(change.path) && lstatSync(change.path).isFile() ? readFileSync(change.path) : undefined;
      if (existsSync(change.path) && current === undefined) throw new Error(`Cannot recover changed path: ${change.path}`);
      const same = (a?: Buffer, b?: Buffer): boolean => a === undefined ? b === undefined : b !== undefined && a.equals(b);
      if (!same(current, change.before) && !same(current, change.after)) throw new Error(`Cannot recover changed path: ${change.path}`);
    }
    for (const change of [...entries].reverse()) {
      const current = existsSync(change.path) ? readFileSync(change.path) : undefined;
      if ((current === undefined && change.before === undefined) || (current && change.before && current.equals(change.before))) continue;
      if (change.before === undefined) unlinkSync(change.path);
      else { mkdirSync(dirname(change.path), { recursive: true }); replaceFile(change.path, change.before, current === undefined, change.beforeMode); }
      restored.push(change.path);
    }
    unlinkSync(journal);
    return { restored };
  }, true);
}

/** Restore missing managed files only when the current source matches the lock. */
export function repairBuiltinSkill(project: string, name: string, repo = REPO): { repaired: string[]; modified: string[] } {
  const root = projectRoot(project);
  const source = sourceDirectory(name, repo);
  return withGuard(root, () => {
    const record = readLock(root)[name];
    if (!record) throw new Error(`No QA ownership record for Skill ${name}`);
    const base = safePath(root, `.agents/skills/${name}`);
    const changes: FileChange[] = [];
    const repaired: string[] = [];
    const modified: string[] = [];
    for (const [file, hash] of Object.entries(record.files)) {
      const target = safePath(base, file);
      if (existsSync(target)) {
        if (!lstatSync(target).isFile() || digest(target) !== hash) modified.push(file);
        continue;
      }
      const original = safePath(source, file);
      if (!existsSync(original) || !lstatSync(original).isFile() || digest(original) !== hash) throw new Error(`Cannot repair ${file}: source differs from installation record`);
      changes.push({ path: target, after: readFileSync(original) });
      repaired.push(file);
    }
    applyChanges(root, changes);
    return { repaired, modified };
  });
}

/** Synchronize a repository-managed Skill with the current builtin source. */
export function upgradeBuiltinSkill(project: string, name: string, repo = REPO): { updated: string[]; snapshot?: string } {
  const root = projectRoot(project);
  const source = sourceDirectory(name, repo);
  return withGuard(root, () => {
    const lock = readLock(root);
    const record = lock[name];
    if (!record) throw new Error(`No QA ownership record for Skill ${name}`);
    const base = safePath(root, `.agents/skills/${name}`);
    const sourceFiles = collect(source);
    const targetFiles = existsSync(base) ? collect(base) : [];
    const sourceSet = new Set(sourceFiles);
    const newFiles: Record<string, string> = Object.create(null) as Record<string, string>;
    const changes: FileChange[] = [];
    for (const file of sourceFiles) {
      const target = safePath(base, file);
      const original = safePath(source, file);
      const after = readFileSync(original);
      newFiles[file] = digest(original);
      if (existsSync(target) && !lstatSync(target).isFile()) throw new Error(`Cannot upgrade over non-file path: ${file}`);
      const before = existsSync(target) ? readFileSync(target) : undefined;
      if (!before || !before.equals(after)) changes.push({ path: target, before, after });
    }
    for (const file of targetFiles) {
      if (!sourceSet.has(file)) {
        const target = safePath(base, file);
        changes.push({ path: target, before: readFileSync(target) });
      }
    }
    const version = sourceVersion(source, name);
    lock[name] = { ...record, version, files: newFiles };
    const lockPath = safePath(root, '.agents/qa-skills-lock.json');
    const updated = changes.map((change) => change.path);
    changes.push({ path: lockPath, before: readFileSync(lockPath), after: Buffer.from(`${JSON.stringify(lock, null, 2)}\n`) });
    if (!updated.length && record.version === version && Object.keys(record.files).length === sourceFiles.length
      && sourceFiles.every((file) => record.files[file] === newFiles[file])) return { updated };
    const snapshotData = Buffer.from(JSON.stringify({ schema: 1, name, entries: changes.map((change) => ({
      path: relative(root, change.path).split('\\').join('/'), before: change.before?.toString('base64') ?? null, after: change.after?.toString('base64') ?? null, beforeMode: change.before === undefined ? undefined : lstatSync(change.path).mode & 0o777,
    })) }));
    const snapshot = createHash('sha256').update(snapshotData).digest('hex');
    const snapshotPath = safePath(root, `.agents/qa-skill-snapshots/${snapshot}.json`);
    if (existsSync(snapshotPath)) {
      if (!lstatSync(snapshotPath).isFile() || !readFileSync(snapshotPath).equals(snapshotData)) throw new Error('Skill snapshot conflict');
    } else changes.push({ path: snapshotPath, after: snapshotData });
    applyChanges(root, changes);
    return { updated, snapshot };
  });
}

/** List content-addressed Skill upgrade snapshots. */
export function listBuiltinSkillSnapshots(project: string): string[] {
  const root = projectRoot(project);
  const directory = safePath(root, '.agents/qa-skill-snapshots');
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => /^[a-f0-9]{64}\.json$/u.test(name)).map((name) => name.slice(0, -5)).sort();
}

/** Restore an upgrade only while its complete managed state remains unchanged. */
export function rollbackBuiltinSkill(project: string, snapshot: string): { restored: string[] } {
  const root = projectRoot(project);
  if (!/^[a-f0-9]{64}$/u.test(snapshot)) throw new Error('Invalid Skill snapshot identifier');
  return withGuard(root, () => {
    const path = safePath(root, `.agents/qa-skill-snapshots/${snapshot}.json`);
    const bytes = readFileSync(path);
    if (createHash('sha256').update(bytes).digest('hex') !== snapshot) throw new Error('Invalid Skill snapshot digest');
    const data: unknown = JSON.parse(bytes.toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid Skill snapshot');
    const value = data as { schema?: unknown; name?: unknown; entries?: unknown };
    if (value.schema !== 1 || typeof value.name !== 'string' || !validName(value.name) || !Array.isArray(value.entries)) throw new Error('Invalid Skill snapshot');
    const name = value.name;
    const entries = value.entries.map((item: unknown) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid Skill snapshot entry');
      const entry = item as Record<string, unknown>;
      if (typeof entry.path !== 'string' || (entry.path !== '.agents/qa-skills-lock.json' && !entry.path.startsWith(`.agents/skills/${name}/`))) throw new Error('Invalid Skill snapshot path');
      return { path: recoveryPath(root, entry.path), before: recoveryBytes(entry.before), after: recoveryBytes(entry.after), beforeMode: recoveryMode(entry.beforeMode) };
    });
    if (new Set(entries.map((entry) => entry.path)).size !== entries.length || !entries.some((entry) => entry.path === safePath(root, '.agents/qa-skills-lock.json'))) throw new Error('Invalid Skill snapshot entries');
    const lock = readLock(root);
    if (!lock[name] || status(root, name, lock[name]).status !== 'installed') throw new Error('Cannot rollback modified or missing Skill');
    for (const entry of entries) {
      const current = existsSync(entry.path) && lstatSync(entry.path).isFile() ? readFileSync(entry.path) : undefined;
      if (existsSync(entry.path) && current === undefined || (current === undefined) !== (entry.after === undefined) || (current && entry.after && !current.equals(entry.after))) throw new Error(`Cannot rollback changed path: ${entry.path}`);
    }
    const changes = entries.map((entry) => ({ path: entry.path, before: entry.after, after: entry.before, beforeMode: entry.after === undefined ? undefined : entry.beforeMode, afterMode: entry.beforeMode }));
    applyChanges(root, changes);
    return { restored: changes.map((change) => change.path) };
  });
}

/** Remove unchanged managed files while preserving modifications and unknown files. */
export function uninstallBuiltinSkill(project: string, name: string, repo = REPO): { removed: string[]; preserved: string[] } {
  const root = projectRoot(project);
  if (!validName(name)) throw new Error(`Invalid Skill name: ${name}`);
  void repo;
  return withGuard(root, () => {
    const lock = readLock(root);
    const record = lock[name];
    if (!record) throw new Error(`No QA ownership record for Skill ${name}`);
    const base = safePath(root, `.agents/skills/${name}`);
    const removed: string[] = [];
    const preserved: string[] = [];
    const changes: FileChange[] = [];
    for (const [file, hash] of Object.entries(record.files)) {
      try {
        const path = safePath(base, file);
        if (!existsSync(path)) { delete record.files[file]; continue; }
        if (!lstatSync(path).isFile() || digest(path) !== hash) { preserved.push(file); continue; }
        changes.push({ path, before: readFileSync(path) });
        delete record.files[file];
        removed.push(file);
      } catch { preserved.push(file); }
    }
    if (Object.keys(record.files).length === 0) delete lock[name];
    const lockPath = safePath(root, '.agents/qa-skills-lock.json');
    changes.push({ path: lockPath, before: readFileSync(lockPath), after: Buffer.from(`${JSON.stringify(lock, null, 2)}\n`) });
    applyChanges(root, changes);
    // Empty directories can be removed without affecting untracked project files.
    const directories = new Set(removed.flatMap((file) => {
      const parts = file.split('/'); parts.pop();
      const result: string[] = [];
      while (parts.length) { result.push(parts.join('/')); parts.pop(); }
      return result;
    }));
    for (const directory of [...directories].sort((a, b) => b.split('/').length - a.split('/').length)) {
      try { rmdirSync(safePath(base, directory)); } catch { /* Preserve nonempty or changed directories. */ }
    }
    try { rmdirSync(base); } catch { /* Preserve nonempty or absent Skill directories. */ }
    return { removed, preserved };
  });
}
