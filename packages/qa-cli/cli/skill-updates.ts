import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The callable fetch interface needed by update checks. */
export type Fetcher = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>;

/** A GitHub directory and its reviewed installation baseline. */
export interface SkillSource {
  name: string;
  repository: string;
  ref: string;
  path: string;
  commit: string;
  license: string;
}

/** A comparison of directory history, not an installed-version check. */
export interface SkillUpdateResult {
  name: string;
  status: 'current' | 'update' | 'error';
  installedCommit: string;
  candidateCommit?: string;
  message?: string;
}

/** Validate untrusted source configuration before forming network requests. */
export function validateSources(value: unknown): SkillSource[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Source list must be a non-empty array');
  const names = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid Skill source');
    const source = item as Record<string, unknown>;
    if (typeof source.name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/u.test(source.name) || names.has(source.name)
      || typeof source.repository !== 'string' || !/^[\w.-]+\/[\w.-]+$/u.test(source.repository)
      || source.repository.split('/').some((part) => part === '.' || part === '..')
      || typeof source.ref !== 'string' || source.ref.length > 255 || /[\u0000-\u001f\u007f]/u.test(source.ref)
      || typeof source.path !== 'string' || !source.path || source.path.split('/').some((part) => !part || part === '.' || part === '..')
      || /[\u0000-\u001f\u007f]/u.test(source.path)
      || typeof source.commit !== 'string' || !/^[a-f0-9]{40}$/u.test(source.commit)
      || typeof source.license !== 'string' || !source.license.trim()) {
      throw new Error('Invalid Skill source fields');
    }
    names.add(source.name);
    return source as unknown as SkillSource;
  });
}

/** Read a custom source list or the source list distributed with QA. */
export function loadSkillSources(path?: string): SkillSource[] {
  const file = path ?? fileURLToPath(new URL('../../skills/external-sources.json', import.meta.url));
  return validateSources(JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/u, '')) as unknown);
}

/** Query the latest commit affecting the entire Skill directory. */
async function directoryCommit(source: SkillSource, ref: string, fetcher: Fetcher): Promise<string> {
  const url = new URL(`https://api.github.com/repos/${source.repository}/commits`);
  url.searchParams.set('path', source.path);
  url.searchParams.set('per_page', '1');
  if (ref) url.searchParams.set('sha', ref);
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'qa-ai-playwright' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetcher(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
  const data: unknown = await response.json();
  const sha = Array.isArray(data) && data[0] && typeof data[0] === 'object' ? (data[0] as { sha?: unknown }).sha : undefined;
  if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/u.test(sha)) throw new Error('GitHub returned no valid directory commit');
  return sha;
}

/** Compare each pinned directory history with its configured upstream branch. */
export async function checkSkillUpdates(sources: SkillSource[], fetcher: Fetcher = fetch): Promise<SkillUpdateResult[]> {
  const results: SkillUpdateResult[] = [];
  for (const source of sources) {
    try {
      const baseline = await directoryCommit(source, source.commit, fetcher);
      const candidate = await directoryCommit(source, source.ref, fetcher);
      results.push({ name: source.name, installedCommit: source.commit, candidateCommit: candidate, status: baseline === candidate ? 'current' : 'update' });
    } catch (error) {
      results.push({ name: source.name, installedCommit: source.commit, status: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
  return results;
}
