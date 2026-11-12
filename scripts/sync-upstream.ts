import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkVersionSource, loadUpdateConfig, resolveVersionSources } from '../packages/qa-cli/cli/update-check.ts';
import { checkSkillUpdates, loadSkillSources } from '../packages/qa-cli/cli/skill-updates.ts';

/** Validate a release asset's unique official SHA256. */
export function releaseAssetHash(assets: Array<Record<string, unknown>>, file: string): string {
  const matches = assets.filter((item) => item.name === file);
  const digest = matches.length === 1 ? matches[0]?.digest : undefined;
  const hash = typeof digest === 'string' ? /^sha256:([a-f0-9]{64})$/u.exec(digest)?.[1] : undefined;
  if (!hash) throw new Error(`Missing official SHA256 for ${file}`);
  return hash;
}

/** Reject missing or changed license identifiers before changing a Skill pin. */
export function assertSkillLicense(value: unknown, expected: string): void {
  if (!value || typeof value !== 'object' || (value as { license?: { spdx_id?: unknown } }).license?.spdx_id !== expected) {
    throw new Error(`Cannot verify upstream Skill license ${expected}`);
  }
}

/** Synchronize checked-in runtime baselines from official release metadata. */
async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, '..');
  const sources = resolveVersionSources(loadUpdateConfig());
  const results = await Promise.all([...sources, { name: 'skills-installer', type: 'npm' as const, target: 'skills', current: '1.8.1' }].map((source) => checkVersionSource(source)));
  const failed = results.filter((item) => item.status === 'error' || !item.candidate || !/^\d+\.\d+\.\d+$/u.test(item.candidate));
  if (failed.length) throw new Error(`Upstream lookup failed: ${failed.map((item) => `${item.name}: ${item.message ?? item.candidate}`).join(', ')}`);
  const versions = new Map(results.map((item) => [item.name, item.candidate!]));
  const staged = new Map<string, string>();
  const read = (path: string): string => staged.get(path) ?? readFileSync(resolve(root, path), 'utf8');
  const json = (path: string): Record<string, any> => JSON.parse(read(path)) as Record<string, any>;
  const putJson = (path: string, value: unknown): void => { staged.set(path, `${JSON.stringify(value, null, 2)}\n`); };
  const skillSources = loadSkillSources();
  const skillResults = await checkSkillUpdates(skillSources);
  if (skillResults.some((item) => item.status === 'error' || !item.candidateCommit)) throw new Error('Failed to verify all external Skill commits');
  const skillDocPath = 'packages/skills/builtin/qa-core/references/external-skills.md';
  let skillDoc = read(skillDocPath);
  for (const source of skillSources) {
    const result = skillResults.find((item) => item.name === source.name)!;
    if (!skillDoc.includes(source.commit)) throw new Error(`Missing Skill reference for ${source.name}`);
    if (result.status === 'update') {
      const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'qa-ai-playwright' };
      if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      const url = new URL(`https://api.github.com/repos/${source.repository}/license`);
      url.searchParams.set('ref', result.candidateCommit!);
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Cannot verify ${source.name} license: GitHub HTTP ${response.status}`);
      assertSkillLicense(await response.json(), source.license);
    }
    skillDoc = skillDoc.replaceAll(source.commit, result.candidateCommit!);
    source.commit = result.candidateCommit!;
  }
  const installer = versions.get('skills-installer')!;
  for (const path of [skillDocPath, 'packages/templates/python/AGENTS.md', 'packages/templates/typescript/AGENTS.md', 'tests/external-skills-ci.ts']) {
    const value = path === skillDocPath ? skillDoc : read(path);
    if (!/skills@\d+\.\d+\.\d+/u.test(value)) throw new Error(`Missing Skill installer version in ${path}`);
    staged.set(path, value.replace(/skills@\d+\.\d+\.\d+/gu, `skills@${installer}`));
  }
  putJson('packages/skills/external-sources.json', skillSources);
  let runtime = read('packages/qa-cli/runtime-versions.env');
  const setRuntime = (key: string, name: string): void => {
    const expression = new RegExp(`^${key}=[^\\r\\n]+$`, 'mu');
    if (!expression.test(runtime)) throw new Error(`Missing runtime key ${key}`);
    runtime = runtime.replace(expression, `${key}=${versions.get(name)}`);
  };
  for (const [key, name] of [
    ['QA_BUN_VERSION', 'bun'], ['QA_PNPM_VERSION', 'pnpm'], ['QA_UV_VERSION', 'uv'],
    ['QA_PLAYWRIGHT_CLI_VERSION', 'playwright-cli'], ['QA_PLAYWRIGHT_MCP_VERSION', 'playwright-mcp'],
    ['QA_AGENT_BROWSER_VERSION', 'agent-browser-mcp'], ['QA_CC_SWITCH_VERSION', 'cc-switch'],
  ]) setRuntime(key!, name!);
  staged.set('packages/qa-cli/runtime-versions.env', runtime);
  const sharedPath = 'packages/qa-cli/cli/shared.ts';
  let shared = read(sharedPath);
  for (const [key, name] of [
    ['bunVersion', 'bun'], ['pnpmVersion', 'pnpm'], ['uvVersion', 'uv'],
    ['playwrightCliVersion', 'playwright-cli'], ['playwrightMcpVersion', 'playwright-mcp'],
    ['agentBrowserVersion', 'agent-browser-mcp'], ['ccSwitchVersion', 'cc-switch'],
  ]) {
    const expression = new RegExp(`(^\\s*${key}: ')[^']+(',?$)`, 'mu');
    if (!expression.test(shared)) throw new Error(`Missing runtime default ${key}`);
    shared = shared.replace(expression, (_match, before: string, after: string) => `${before}${versions.get(name!)}${after}`);
  }
  staged.set(sharedPath, shared);
  for (const [file, name] of [['playwright', 'playwright-mcp'], ['agent-browser', 'agent-browser-mcp'], ['faker', 'faker-mcp']] as const) {
    const path = `packages/mcp/external/${file}.json`;
    const manifest = json(path);
    manifest.version = versions.get(name);
    putJson(path, manifest);
  }
  const appPath = 'packages/apps/cc-switch/manifest.json';
  const app = json(appPath);
  const previous = String(app.version);
  const version = versions.get('cc-switch')!;
  if (version !== previous) {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'qa-ai-playwright' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const get = async (url: string): Promise<any> => {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`GitHub HTTP ${response.status}: ${url}`);
      return response.json();
    };
    const release = await get(`https://api.github.com/repos/farion1231/cc-switch/releases/tags/v${version}`);
    const commit = await get(`https://api.github.com/repos/farion1231/cc-switch/commits/v${version}`);
    if (release.tag_name !== `v${version}` || !Array.isArray(release.assets) || !/^[a-f0-9]{40}$/u.test(commit.sha)) throw new Error('Invalid CC Switch release metadata');
    const docPath = 'packages/apps/cc-switch/UPSTREAM.md';
    let doc = read(docPath).replaceAll(previous, version).replaceAll(String(app.commit), commit.sha);
    for (const asset of app.assets as Array<Record<string, string>>) {
      const oldFile = asset.file!;
      const file = oldFile.replace(previous, version);
      if (file === oldFile) throw new Error(`Cannot update CC Switch asset: ${oldFile}`);
      const hash = releaseAssetHash(release.assets, file);
      doc = doc.replaceAll(oldFile, file).replaceAll(asset.sha256!, hash);
      asset.file = file;
      asset.sha256 = hash;
    }
    app.version = version;
    app.release_tag = `v${version}`;
    app.commit = commit.sha;
    app.download_base = `https://github.com/farion1231/cc-switch/releases/download/v${version}`;
    staged.set(docPath, doc);
    const referencesPath = 'docs/references.zh-CN.md';
    const references = read(referencesPath);
    const oldReference = `farion1231/cc-switch/tree/v${previous}`;
    if (!references.includes(oldReference)) throw new Error('Missing CC Switch reference');
    staged.set(referencesPath, references.replace(oldReference, `farion1231/cc-switch/tree/v${version}`));
    const historyPath = 'docs/version-history.zh-CN.md';
    const history = read(historyPath);
    const oldRow = `| cc-switch | ${previous} |`;
    if (!history.includes(oldRow)) throw new Error('Missing CC Switch current version row');
    staged.set(historyPath, history.replace(oldRow, `| cc-switch | ${version} |`));
    putJson(appPath, app);
  }
  const packagePath = 'package.json';
  const pkg = json(packagePath);
  pkg.packageManager = `pnpm@${versions.get('pnpm')}`;
  putJson(packagePath, pkg);
  for (const [path, content] of staged) {
    if (readFileSync(resolve(root, path), 'utf8') !== content) {
      writeFileSync(resolve(root, path), content, 'utf8');
      console.log(`Updated ${path}`);
    }
  }
  for (const item of results) console.log(`${item.name}: ${item.current} -> ${item.candidate}`);
  console.log('Review upstream changes, licenses, assets, and CI results before release.');
}

if (import.meta.main) main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
