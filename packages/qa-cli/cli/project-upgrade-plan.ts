import { lstatSync, readdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Environment } from './environment.ts';
import { projectMarker } from './project.ts';
import { digest, templateVersion } from './shared.ts';

/** A file's relationship to its recorded baseline and the delivered template. */
export type ProjectUpgradeStatus = 'unchanged' | 'update' | 'modified' | 'missing' | 'new' | 'removed' | 'unknown';

/** Hashes are omitted when the corresponding file or trustworthy baseline is absent. */
export interface ProjectUpgradeEntry {
  path: string;
  status: ProjectUpgradeStatus;
  recordedHash?: string;
  currentHash?: string;
  templateHash?: string;
}

/** A read-only comparison; entries do not authorize any subsequent write. */
export interface ProjectUpgradePlan {
  target: string;
  stack: 'python' | 'typescript';
  recordedVersions: { language?: string; qa?: string };
  templateVersions: { language: string; qa: string };
  entries: ProjectUpgradeEntry[];
}

/** Check the boundary and each existing descendant without following links. */
function rejectLinks(path: string, boundary = path): void {
  const absolute = resolve(path);
  const root = resolve(boundary);
  const segments = relative(root, absolute);
  if (segments === '..' || segments.startsWith(`..${sep}`) || isAbsolute(segments)) throw new Error(`Unsafe path: ${path}`);
  let current = root;
  for (const component of ['', ...segments.split(sep).filter(Boolean)]) {
    current = join(current, component);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error(`Linked path is unsupported: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}

/** Require a portable, unambiguous project-relative file name. */
function safeRelative(path: string): string {
  if (!path || isAbsolute(path) || path.includes('\\') || path.includes(':') || path.includes('\0')
    || path.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe project path: ${path}`);
  }
  return path;
}

/** Read a regular file hash without following symlinks. */
function fileHash(path: string, boundary: string): string | undefined {
  rejectLinks(path, boundary);
  try {
    const stat = lstatSync(path);
    if (!stat.isFile()) throw new Error(`Expected regular file: ${path}`);
    return digest(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Enumerate template files using the same language and docs/qa mapping as project initialization. */
function collectTemplate(root: string, prefix: string, result: Map<string, string>): void {
  rejectLinks(root);
  if (!lstatSync(root).isDirectory()) throw new Error(`Expected template directory: ${root}`);
  const visit = (directory: string, parts: string[]): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const next = [...parts, entry.name];
      rejectLinks(path, root);
      if (entry.isDirectory()) visit(path, next);
      else if (entry.isFile()) {
        const name = safeRelative([...prefix.split('/').filter(Boolean), ...next].join('/'));
        if (result.has(name)) throw new Error(`Duplicate template path: ${name}`);
        result.set(name, path);
      } else throw new Error(`Unsupported template entry: ${path}`);
    }
  };
  visit(root, []);
}

/** Compare recorded project ownership against current files and delivered templates without writing. */
export function projectUpgradePlan(env: Environment, targetInput: string): ProjectUpgradePlan {
  const requested = resolve(targetInput);
  rejectLinks(requested);
  rejectLinks(join(requested, '.qa-project.json'), requested);
  const { target, state } = projectMarker(requested);
  if (state.stack !== 'python' && state.stack !== 'typescript') throw new Error('Invalid project stack');
  env.requireInitialized(state.stack);
  if (!state.files || typeof state.files !== 'object' || Array.isArray(state.files)) throw new Error('Invalid project file records');
  const languageRoot = join(env.repo, 'packages/templates', state.stack);
  const qaRoot = join(env.repo, 'packages/templates/qa');
  const templates = new Map<string, string>();
  collectTemplate(languageRoot, '', templates);
  collectTemplate(qaRoot, 'docs/qa', templates);
  const names = new Set([...Object.keys(state.files).map(safeRelative), ...templates.keys()]);
  const entries: ProjectUpgradeEntry[] = [];
  for (const name of [...names].sort()) {
    const path = join(target, ...name.split('/'));
    const relativePath = relative(target, path);
    if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) throw new Error(`Unsafe project path: ${name}`);
    const raw = state.files[name];
    const recordedHash = typeof raw === 'string' && /^[a-f0-9]{64}$/u.test(raw) ? raw : undefined;
    const currentHash = fileHash(path, target);
    const source = templates.get(name);
    const templateHash = source ? fileHash(source, env.repo) : undefined;
    let status: ProjectUpgradeStatus;
    if (raw !== undefined && !recordedHash) status = 'unknown';
    else if (!recordedHash) status = currentHash ? 'unknown' : 'new';
    else if (!templateHash) status = currentHash && currentHash !== recordedHash ? 'modified' : 'removed';
    else if (!currentHash) status = 'missing';
    else if (currentHash !== recordedHash) status = 'modified';
    else status = currentHash === templateHash ? 'unchanged' : 'update';
    entries.push({ path: name, status, recordedHash, currentHash, templateHash });
  }
  // VERSION files were enumerated and checked for links before reading them.
  return { target, stack: state.stack, recordedVersions: { language: state.language_template_version, qa: state.qa_template_version },
    templateVersions: { language: templateVersion(languageRoot), qa: templateVersion(qaRoot) }, entries };
}
