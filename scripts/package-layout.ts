import { posix } from 'node:path';

/** One source file and its path inside the user delivery archive. */
export interface PackageEntry {
  source: string;
  target: string;
}

/** Returns the delivery archive path for a repository file. */
export function packageTarget(source: string): string | undefined {
  const normalized = source.replaceAll('\\', '/');
  if (normalized.startsWith('.github/') || normalized.startsWith('.agents/')) {
    return undefined;
  }
  if (
    normalized.startsWith('apps/') ||
    normalized.startsWith('scripts/') ||
    normalized.startsWith('tests/')
  ) {
    return undefined;
  }
  if (normalized === 'AGENTS.md') return undefined;
  if (
    normalized === 'package.json' ||
    normalized === 'pnpm-lock.yaml' ||
    normalized === 'tsconfig.json'
  ) {
    return undefined;
  }
  if (normalized.startsWith('docs/')) {
    return normalized.startsWith('docs/users/') || normalized.startsWith('docs/releases/')
      ? normalized
      : undefined;
  }
  return normalized === 'README.md' || normalized.startsWith('packages/')
    ? normalized
    : undefined;
}

/** Builds unique delivery entries from repository files. */
export function packageEntries(files: readonly string[]): PackageEntry[] {
  const targets = new Set<string>();
  const entries: PackageEntry[] = [];
  for (const source of files) {
    const target = packageTarget(source);
    if (!target) continue;
    if (targets.has(target)) throw new Error(`Duplicate package path: ${target}`);
    targets.add(target);
    entries.push({ source, target });
  }
  return entries;
}

/** Rejects local Markdown links whose targets are absent from the delivery archive. */
export function assertPackageLinks(
  entries: readonly PackageEntry[],
  read: (source: string) => string,
): void {
  const sources = new Set(entries.map((entry) => entry.source));
  const missing: string[] = [];
  for (const entry of entries) {
    if (!entry.source.toLowerCase().endsWith('.md')) continue;
    for (const match of read(entry.source).matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)) {
      const rawTarget = (match[1] ?? '').trim().replace(/^<|>$/gu, '');
      if (!rawTarget || rawTarget.startsWith('#') || /^[a-z][a-z\d+.-]*:/iu.test(rawTarget)) {
        continue;
      }
      const path = rawTarget.split(/[?#]/u, 1)[0];
      if (!path) continue;
      const target = path.startsWith('/')
        ? posix.normalize(path.slice(1))
        : posix.normalize(posix.join(posix.dirname(entry.source), path));
      if (!sources.has(target)) {
        missing.push(`${entry.source} -> ${rawTarget}`);
      }
    }
  }
  if (missing.length) {
    throw new Error(`Missing package link targets:\n${missing.join('\n')}`);
  }
}
