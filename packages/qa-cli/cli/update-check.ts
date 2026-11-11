import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { checkSkillUpdates, loadSkillSources } from './skill-updates.ts';

/** A published package or release and the version pinned by QA. */
export interface VersionSource {
  name: string;
  type: 'npm' | 'github-release';
  target: string;
  current: string;
  tagPrefix?: string;
}

/** The comparison reports differing versions, not upgrade compatibility. */
export interface UpdateResult {
  name: string;
  status: 'current' | 'changed' | 'error' | 'unconfigured';
  current: string;
  candidate?: string;
  message?: string;
}

interface ConfigEntry {
  name: string;
  type: 'npm' | 'github-release';
  target: string;
  currentFrom: string;
  tagPrefix?: string;
}
interface UpdateConfig {
  qa: { repository: string; ref: string };
  sources: ConfigEntry[];
}

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const githubRepo = /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/u;
const npmPackage = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;

/** Read the checked-in update sources or an explicitly selected configuration. */
export function loadUpdateConfig(path?: string): UpdateConfig {
  const config = JSON.parse(readFileSync(path ?? `${srcDir}/packages/qa-cli/update-sources.json`, 'utf8').replace(/^\uFEFF/u, '')) as UpdateConfig;
  if (!config || typeof config !== 'object' || !config.qa || typeof config.qa.repository !== 'string'
    || (config.qa.repository !== '' && !githubRepo.test(config.qa.repository))
    || typeof config.qa.ref !== 'string' || /[\u0000-\u001f\u007f]/u.test(config.qa.ref)
    || !Array.isArray(config.sources)) throw new Error('Invalid update source configuration');
  const names = new Set<string>();
  for (const item of config.sources) {
    if (!item || typeof item.name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/u.test(item.name) || names.has(item.name)
      || !['npm', 'github-release'].includes(item.type) || typeof item.target !== 'string'
      || !(item.type === 'npm' ? npmPackage : githubRepo).test(item.target)
      || typeof item.currentFrom !== 'string' || !/^(?:runtime:QA_[A-Z_]+|mcp:[a-z0-9-]+|app:cc-switch)$/u.test(item.currentFrom)
      || (item.tagPrefix !== undefined && (typeof item.tagPrefix !== 'string' || !/^[a-zA-Z0-9._-]*$/u.test(item.tagPrefix)))) {
      throw new Error('Invalid update source entry');
    }
    names.add(item.name);
  }
  return config;
}

/** Resolve baselines from the same manifests used by environment installation. */
export function resolveVersionSources(config: UpdateConfig): VersionSource[] {
  const runtime = new Map(readFileSync(`${srcDir}/packages/qa-cli/runtime-versions.env`, 'utf8').split(/\r?\n/u)
    .filter((line) => /^QA_[A-Z_]+=/.test(line)).map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)] as [string, string];
    }));
  return config.sources.map((entry) => {
    const [kind, key] = entry.currentFrom.split(':');
    let current: unknown;
    if (kind === 'runtime') current = runtime.get(key!);
    else if (kind === 'mcp') current = (JSON.parse(readFileSync(`${srcDir}/packages/mcp/external/${key}.json`, 'utf8')) as { version?: unknown }).version;
    else current = (JSON.parse(readFileSync(`${srcDir}/packages/apps/cc-switch/manifest.json`, 'utf8')) as { version?: unknown }).version;
    if (typeof current !== 'string' || !current) throw new Error(`Missing baseline for ${entry.name}`);
    return { name: entry.name, type: entry.type, target: entry.target, current, tagPrefix: entry.tagPrefix };
  });
}

/** Compare a pinned npm package or GitHub release to its published candidate. */
export async function checkVersionSource(source: VersionSource, fetcher: typeof fetch = fetch): Promise<UpdateResult> {
  try {
    if (!source.name || !source.current || !(source.type === 'npm' ? npmPackage : githubRepo).test(source.target)
      || !['npm', 'github-release'].includes(source.type)) throw new Error('Invalid source');
    const github = source.type === 'github-release';
    const url = github ? `https://api.github.com/repos/${source.target}/releases/latest` : `https://registry.npmjs.org/${encodeURIComponent(source.target)}/latest`;
    const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'qa-ai-playwright' };
    if (github && process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const response = await fetcher(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: unknown = await response.json();
    const candidate = data && typeof data === 'object' ? (data as Record<string, unknown>)[github ? 'tag_name' : 'version'] : undefined;
    if (typeof candidate !== 'string' || !candidate.trim()) throw new Error('Missing published version');
    const prefix = source.tagPrefix ?? 'v';
    const normalized = prefix && candidate.startsWith(prefix) ? candidate.slice(prefix.length) : candidate;
    if (!normalized) throw new Error('Missing published version');
    return { name: source.name, current: source.current, candidate: normalized, status: normalized === source.current ? 'current' : 'changed' };
  } catch (error) {
    return { name: source.name, current: source.current, status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/** Compare the local source checkout with a configured GitHub branch without fetching or writing. */
export async function checkQaSource(qa: UpdateConfig['qa'], fetcher: typeof fetch = fetch): Promise<UpdateResult> {
  if (!qa.repository) return { name: 'qa-cli-and-builtin-mcp', status: 'unconfigured', current: 'unknown', message: 'Set qa.repository in update-sources.json' };
  let current: string;
  let dirty: boolean;
  try {
    current = execFileSync('git', ['-C', srcDir, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 5000 }).trim();
    dirty = Boolean(execFileSync('git', ['-C', srcDir, 'status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8', timeout: 5000 }).trim());
    if (!/^[a-f0-9]{40}$/u.test(current)) throw new Error('Invalid local commit');
  } catch {
    return { name: 'qa-cli-and-builtin-mcp', status: 'unconfigured', current: 'unknown', message: 'Local Git checkout or commit unavailable' };
  }
  try {
    const url = new URL(`https://api.github.com/repos/${qa.repository}/commits`);
    url.searchParams.set('per_page', '1');
    if (qa.ref) url.searchParams.set('sha', qa.ref);
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'qa-ai-playwright' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const response = await fetcher(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    const body: unknown = await response.json();
    const candidate = Array.isArray(body) && body[0] && typeof body[0] === 'object' ? (body[0] as { sha?: unknown }).sha : undefined;
    if (typeof candidate !== 'string' || !/^[a-f0-9]{40}$/u.test(candidate)) throw new Error('Invalid GitHub commit');
    return { name: 'qa-cli-and-builtin-mcp', current, candidate, status: current === candidate ? 'current' : 'changed', message: dirty ? 'Working tree has local changes' : undefined };
  } catch (error) {
    return { name: 'qa-cli-and-builtin-mcp', current, status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/** Inspect configured QA, release, npm and Skill baselines without changing them. */
export async function checkAllUpdates(config: UpdateConfig, fetcher: typeof fetch = fetch): Promise<UpdateResult[]> {
  const results = [await checkQaSource(config.qa, fetcher)];
  const sources = resolveVersionSources(config);
  for (const source of sources) results.push(await checkVersionSource(source, fetcher));
  const runtime = readFileSync(`${srcDir}/packages/qa-cli/runtime-versions.env`, 'utf8');
  for (const [name, key] of [['playwright-mcp', 'QA_PLAYWRIGHT_MCP_VERSION'], ['agent-browser-mcp', 'QA_AGENT_BROWSER_VERSION']] as const) {
    const source = sources.find((entry) => entry.name === name);
    if (!source) continue;
    const expected = runtime.match(new RegExp(`^${key}=([^\\r\\n]+)$`, 'm'))?.[1];
    results.push({ name: `${name}-baseline-consistency`, status: !expected ? 'error' : expected === source.current ? 'current' : 'changed', current: source.current, candidate: expected, message: expected ? 'MCP manifest versus runtime defaults' : 'Runtime baseline missing' });
  }
  for (const skill of await checkSkillUpdates(loadSkillSources(), fetcher)) {
    results.push({ name: `skill:${skill.name}`, status: skill.status === 'update' ? 'changed' : skill.status, current: skill.installedCommit, candidate: skill.candidateCommit, message: skill.message });
  }
  results.push({ name: 'node-and-python', status: 'unconfigured', current: 'policy', message: 'Major/minor support policy requires separate version selection' });
  return results;
}
