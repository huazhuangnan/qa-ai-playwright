import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root resolved from this source file. */
export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Whether the current process runs on Windows. */
export const WINDOWS = process.platform === 'win32';

/** Marker written only by the local QA environment manager. */
export const OWNER = 'qa-local-environment-v1';

/** Supported project and environment stacks. */
export type Stack = 'python' | 'typescript' | 'both';

/** Skill and MCP bundle profile. */
export type SkillProfile = 'standard' | 'full';

/** Supported browser selections. */
export type Browser = 'chromium' | 'chrome' | 'msedge' | 'firefox' | 'webkit' | 'all' | 'none';

/** Default runtime versions loaded from `packages/qa-cli/runtime-versions.env`. */
export interface RuntimeSettings {
  nodeMajor: string;
  bunVersion: string;
  pnpmVersion: string;
  pythonVersion: string;
  uvVersion: string;
  playwrightCliVersion: string;
  playwrightMcpVersion: string;
  agentBrowserVersion: string;
  ccSwitchVersion: string;
}
/** Source groups used by MCP manifests. */
export type SkillSource = 'builtin' | 'external';

/** Minimum MCP configuration needed for drift checks. */
export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

const DEFAULT_SETTINGS: RuntimeSettings = {
  nodeMajor: '26',
  bunVersion: '1.4.4',
  pnpmVersion: '12.18.0',
  pythonVersion: '3.15',
  uvVersion: '0.13.7',
  playwrightCliVersion: '0.1.24',
  playwrightMcpVersion: '0.0.85',
  agentBrowserVersion: '0.42.0',
  ccSwitchVersion: '4.0.30',
};

const SETTING_KEYS: Record<keyof RuntimeSettings, string> = {
  nodeMajor: 'QA_NODE_MAJOR',
  bunVersion: 'QA_BUN_VERSION',
  pnpmVersion: 'QA_PNPM_VERSION',
  pythonVersion: 'QA_PYTHON_VERSION',
  uvVersion: 'QA_UV_VERSION',
  playwrightCliVersion: 'QA_PLAYWRIGHT_CLI_VERSION',
  playwrightMcpVersion: 'QA_PLAYWRIGHT_MCP_VERSION',
  agentBrowserVersion: 'QA_AGENT_BROWSER_VERSION',
  ccSwitchVersion: 'QA_CC_SWITCH_VERSION',
};

/**
 * Loads pinned runtime versions without requiring a dotenv dependency.
 *
 * Process environment values take precedence over repository defaults.
 */
export function loadRuntimeSettings(repo = REPO): RuntimeSettings {
  const settings = { ...DEFAULT_SETTINGS };
  const file = join(repo, 'packages/qa-cli/runtime-versions.env');
  const values = new Map<string, string>();
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/u)) {
      if (!line.startsWith('QA_')) {
        continue;
      }
      const separator = line.indexOf('=');
      if (separator > 0) {
        values.set(line.slice(0, separator), line.slice(separator + 1));
      }
    }
  }
  for (const [property, key] of Object.entries(SETTING_KEYS) as [
    keyof RuntimeSettings,
    string,
  ][]) {
    const value = process.env[key] ?? values.get(key);
    if (value) {
      settings[property] = value;
    }
  }
  return settings;
}

/** Loads and validates a reviewed MCP manifest. */
export function mcpManifest(
  name: string,
  sourceType: SkillSource = 'external',
  repo = REPO,
): Record<string, unknown> {
  const manifestPath = join(repo, 'packages/mcp', sourceType, `${name}.json`);
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing MCP manifest: ${manifestPath}`);
  }
  const data = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
    string,
    unknown
  >;
  if (
    data.id !== name ||
    data.scope !== 'environment' ||
    (data.source_type ?? sourceType) !== sourceType
  ) {
    throw new Error(`Invalid MCP manifest: ${manifestPath}`);
  }
  return data;
}

/** Writes JSON through a same-directory temporary file. */
export function atomicJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = join(
    dirname(path),
    `.${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`,
  );
  try {
    writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
  replaceFile(temporary, path);
}

/** Returns the SHA256 digest for one file. */
export function digest(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Reads and validates a semantic template version. */
export function templateVersion(directory: string): string {
  const file = join(directory, 'VERSION');
  if (!existsSync(file)) {
    throw new Error(`Missing template VERSION: ${directory}`);
  }
  const version = readFileSync(file, 'utf8').replace(/^\uFEFF/u, '').trim();
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(version)) {
    throw new Error(`Invalid template version: ${version}`);
  }
  return version;
}

/** Checks whether a resolved path is inside a parent path. */
export function within(path: string, parent: string): boolean {
  const child = resolve(path);
  const base = resolve(parent);
  const relation = relative(base, child);
  return (
    relation === '' ||
    (relation !== '..' &&
      !relation.startsWith(`..${sep}`) &&
      !isAbsolute(relation))
  );
}

/** Removes one owned path after proving that it is a child of its owner. */
export function removeOwned(path: string, parent: string): void {
  const metadata = lstatSafe(path);
  if (!metadata) {
    return;
  }
  if (
    metadata.isSymbolicLink() ||
    !within(path, parent) ||
    resolve(path) === resolve(parent)
  ) {
    throw new Error(`Refusing unsafe deletion: ${path}`);
  }
  rmSync(path, { recursive: true, force: true });
}

/** Downloads a URL to a file through a temporary `.part` path. */
export async function download(url: string, target: string): Promise<void> {
  mkdirSync(dirname(target), { recursive: true });
  const partial = `${target}.part`;
  console.log(`Download ${url}`);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'qa-local-cli' },
      signal: AbortSignal.timeout(300_000),
    });
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${url}`);
    }
    writeFileSync(partial, Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    rmSync(partial, { force: true });
    throw error;
  }
  replaceFile(partial, target);
}

/** Replaces a file while retaining recoverable copies if a rename fails. */
function replaceFile(temporary: string, target: string): void {
  const backup = `${temporary}.backup`;
  let hasBackup = false;
  try {
    if (existsSync(target)) {
      renameSync(target, backup);
      hasBackup = true;
    }
    renameSync(temporary, target);
    hasBackup = false;
  } catch (error) {
    if (hasBackup && existsSync(backup) && !existsSync(target)) {
      try {
        renameSync(backup, target);
        hasBackup = false;
      } catch {
        // Keep both the old backup and new temporary file for manual recovery.
      }
    }
    if (hasBackup) {
      throw new Error(
        `Unable to replace ${target}; recovery files preserved: ${backup}, ${temporary}`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    if (!hasBackup) {
      rmSync(temporary, { force: true });
      rmSync(backup, { force: true });
    }
  }
}

/** Fetches and parses one JSON document. */
export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'qa-local-cli' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${url}`);
  }
  return (await response.json()) as T;
}

/** Extracts a reviewed archive after rejecting traversal members. */
export function extractArchive(
  archive: string,
  target: string,
  stripComponents = 0,
): void {
  mkdirSync(target, { recursive: true });
  const gzip = archive.endsWith('.tar.gz');
  const listing = spawnSync(
    'tar',
    [gzip ? '-tzf' : '-tf', archive],
    { encoding: 'utf8' },
  );
  if (listing.status !== 0) {
    throw new Error(listing.stderr || `Unable to list archive: ${archive}`);
  }
  for (const entry of listing.stdout.split(/\r?\n/u).filter(Boolean)) {
    const normalized = entry.replaceAll('\\', '/');
    if (
      normalized.startsWith('/') ||
      normalized.split('/').includes('..') ||
      /^[A-Za-z]:/u.test(normalized)
    ) {
      throw new Error(`Unsafe archive member: ${entry}`);
    }
  }
  const args = [gzip ? '-xzf' : '-xf', archive, '-C', target];
  if (stripComponents > 0) {
    args.push(`--strip-components=${stripComponents}`);
  }
  const extraction = spawnSync('tar', args, { stdio: 'inherit' });
  if (extraction.status !== 0) {
    throw new Error(`Unable to extract archive: ${archive}`);
  }
}

/** Returns process paths in a stable, human-readable form. */
export function displayPath(path: string): string {
  return resolve(path);
}

/**
 * Reads the subset of TOML needed to compare generated MCP server settings.
 *
 * This intentionally supports the simple table and scalar forms emitted by
 * `codex mcp add`. Unsupported input is treated as missing configuration.
 */
export function readMcpServerConfig(
  configPath: string,
  name: string,
): McpServerConfig {
  if (!existsSync(configPath)) {
    return {};
  }
  const result: McpServerConfig = {};
  let section = '';
  const lines = readFileSync(configPath, 'utf8').split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = stripTomlComment(lines[index] ?? '').trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const table = line.match(/^\[(\[?)([^\]]+)\]\]?$/u);
    if (table) {
      section = table[1] ? '' : (table[2] ?? '').split('.').map((part) => part.trim().replace(/^['"]|['"]$/g, '')).join('.');
      continue;
    }
    if (section !== `mcp_servers.${name}` && section !== `mcp_servers.${name}.env`) {
      continue;
    }
    const assignment = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/u);
    if (!assignment) {
      continue;
    }
    const key = assignment[1] ?? '';
    let raw = assignment[2] ?? '';
    if (raw.startsWith('[') && parseTomlScalar(raw) === undefined) {
      while (index + 1 < lines.length) {
        index += 1;
        raw += `\n${stripTomlComment(lines[index] ?? '')}`;
        if (parseTomlScalar(raw) !== undefined) {
          break;
        }
      }
    }
    const value = parseTomlScalar(raw);
    if (section.endsWith('.env')) {
      if (typeof value !== 'string') return {};
      result.env ??= {};
      result.env[key] = value;
    } else if (key === 'env') {
      // Inline environment tables are not part of the supported Codex output.
      return {};
    } else if (key === 'command') {
      if (typeof value !== 'string') return {};
      result.command = value;
    } else if (key === 'args') {
      if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return {};
      result.args = value;
    }
  }
  return result;
}

/** Removes comments outside quoted TOML strings. */
function stripTomlComment(line: string): string {
  let quote = '';
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) { escaped = false; continue; }
    if (quote === '"' && character === '\\') { escaped = true; continue; }
    if (quote && character === quote) { quote = ''; continue; }
    if (!quote && (character === '"' || character === "'")) quote = character;
    else if (!quote && character === '#') return line.slice(0, index);
  }
  return line;
}

function parseTomlScalar(raw: string): unknown {
  const value = raw.replace(/,\s*\]$/u, ']').trim();
  if (value.startsWith('[') && value.endsWith(']')) {
    return parseTomlArray(value.slice(1, -1));
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

/** Parses the simple comma-separated arrays emitted by Codex MCP config. */
function parseTomlArray(raw: string): unknown[] | undefined {
  const values: string[] = [];
  let current = '';
  let quote: 'single' | 'double' | undefined;
  let escaped = false;
  for (const character of raw) {
    if (quote === 'double' && escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (quote === 'double' && character === '\\') {
      current += character;
      escaped = true;
      continue;
    }
    if (!quote && character === "'") {
      quote = 'single';
      current += character;
    } else if (!quote && character === '"') {
      quote = 'double';
      current += character;
    } else if (quote === 'single' && character === "'") {
      quote = undefined;
      current += character;
    } else if (quote === 'double' && character === '"') {
      quote = undefined;
      current += character;
    } else {
      current += character;
    }
    if (!quote && character === ',') {
      current = current.slice(0, -1).trim();
      if (current) values.push(current);
      current = '';
    }
  }
  if (quote || escaped) return undefined;
  if (current.trim()) values.push(current.trim());
  const parsed = values.map((value) => parseTomlScalar(value));
  return parsed.every((value) => value !== undefined) ? parsed : undefined;
}
function lstatSafe(path: string): ReturnType<typeof lstatSync> | undefined {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
}
