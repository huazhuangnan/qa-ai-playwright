import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Fetcher } from './skill-updates.ts';
import type { UpdateConfig } from './update-check.ts';

export interface ReleaseAsset { name: string; browser_download_url: string; }
export interface ReleaseInfo { tag_name: string; assets: ReleaseAsset[]; }

function assertRelease(value: unknown): ReleaseInfo {
  if (!value || typeof value !== 'object') throw new Error('Invalid GitHub release response');
  const data = value as Record<string, unknown>;
  if (typeof data.tag_name !== 'string' || !Array.isArray(data.assets)) throw new Error('Invalid GitHub release metadata');
  const assets = data.assets.filter((item): item is ReleaseAsset => {
    if (!item || typeof item !== 'object') return false;
    const asset = item as Record<string, unknown>;
    return typeof asset.name === 'string' && typeof asset.browser_download_url === 'string';
  });
  return { tag_name: data.tag_name, assets };
}

export async function fetchLatestRelease(repository: string, fetcher: Fetcher = fetch): Promise<ReleaseInfo> {
  const response = await fetcher(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'qa-ai-playwright' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`GitHub release HTTP ${response.status}`);
  return assertRelease(await response.json());
}

function asset(release: ReleaseInfo, pattern: RegExp): ReleaseAsset {
  const found = release.assets.find((item) => pattern.test(item.name));
  if (!found) throw new Error(`Release ${release.tag_name} has no matching asset`);
  return found;
}

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function verifySums(archive: Uint8Array, sums: string, archiveName: string): void {
  const line = sums.split(/\r?\n/u).find((entry) => entry.trim().endsWith(`  ${archiveName}`) || entry.trim().endsWith(` *${archiveName}`));
  const expected = line?.trim().split(/\s+/u)[0];
  if (!expected || !/^[a-f0-9]{64}$/iu.test(expected) || expected.toLowerCase() !== sha256(archive)) {
    throw new Error(`SHA256 verification failed for ${archiveName}`);
  }
}

function runInstaller(root: string): void {
  if (process.platform === 'win32') {
    execFileSync('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', join(root, 'packages/qa-cli/bin/install.ps1'), '-Reinstall'], { stdio: 'inherit' });
  } else {
    execFileSync('bash', [join(root, 'packages/qa-cli/bin/install.sh')], { stdio: 'inherit' });
  }
}

/** Download and install the latest trusted QA Release into the user-level QA installation. */
export async function syncLatestRelease(config: UpdateConfig, fetcher: Fetcher = fetch): Promise<{ tag: string; asset: string }> {
  if (!config.qa.repository) throw new Error('QA update source is not configured');
  const release = await fetchLatestRelease(config.qa.repository, fetcher);
  const archive = asset(release, /^qa-ai-playwright-v.*\.zip$/u);
  const sumsAsset = asset(release, /^SHA256SUMS\.txt$/u);
  const [archiveResponse, sumsResponse] = await Promise.all([
    fetcher(archive.browser_download_url, { headers: { Accept: 'application/octet-stream', 'User-Agent': 'qa-ai-playwright' }, signal: AbortSignal.timeout(60000) }),
    fetcher(sumsAsset.browser_download_url, { headers: { Accept: 'text/plain', 'User-Agent': 'qa-ai-playwright' }, signal: AbortSignal.timeout(30000) }),
  ]);
  if (!archiveResponse.ok || !sumsResponse.ok) throw new Error('Failed to download QA Release assets');
  const archiveData = new Uint8Array(await archiveResponse.arrayBuffer());
  verifySums(archiveData, await sumsResponse.text(), archive.name);
  const staging = mkdtempSync(join(tmpdir(), 'qa-release-'));
  const archivePath = join(staging, archive.name);
  writeFileSync(archivePath, archiveData);
  try {
    execFileSync('tar', ['-xf', archivePath, '-C', staging], { stdio: 'inherit' });
    const extractedName = readdirSync(staging, { withFileTypes: true }).find((entry) => entry.isDirectory())?.name;
    if (!extractedName) throw new Error('Invalid extracted QA Release');
    const extracted = join(staging, extractedName);
    runInstaller(extracted);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return { tag: release.tag_name, asset: archive.name };
}

export function releaseArchiveName(version: string): string {
  return `qa-ai-playwright-v${version}.zip`;
}

