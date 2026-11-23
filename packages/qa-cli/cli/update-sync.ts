import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Fetcher } from './skill-updates.ts';
import type { UpdateConfig } from './update-check.ts';

export async function fetchLatestRelease(repository: string, fetcher: Fetcher = fetch, tagPrefix = 'v'): Promise<string> {
  const latest = `https://github.com/${repository}/releases/latest`;
  const response = await fetcher(latest, {
    headers: { 'User-Agent': 'qa-ai-playwright' },
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
  });
  if (![301, 302, 303, 307, 308].includes(response.status)) throw new Error(`GitHub latest release HTTP ${response.status}`);
  const location = response.headers.get('location');
  if (!location) throw new Error('Invalid GitHub release redirect');
  let url: URL;
  try { url = new URL(location, latest); } catch { throw new Error('Invalid GitHub release redirect'); }
  const prefix = `/${repository}/releases/tag/`;
  let tag: string;
  try { tag = decodeURIComponent(url.pathname.slice(prefix.length)); } catch { throw new Error('Invalid GitHub release redirect'); }
  const tagPattern = new RegExp(`^${tagPrefix.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$`, 'u');
  if (url.origin !== 'https://github.com' || url.username || url.password || !url.pathname.startsWith(prefix) || url.search || url.hash
    || !tagPattern.test(tag)) {
    throw new Error('Invalid GitHub release redirect');
  }
  return tag;
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
    execFileSync('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', join(root, 'packages/qa-cli/bin/install.ps1')], { stdio: 'inherit' });
  } else {
    execFileSync('bash', [join(root, 'packages/qa-cli/bin/install.sh')], { stdio: 'inherit' });
  }
}

/** Download and install the latest trusted QA Release into the user-level QA installation. */
export async function syncLatestRelease(config: UpdateConfig, fetcher: Fetcher = fetch): Promise<{ tag: string; asset: string }> {
  if (!config.qa.repository) throw new Error('QA update source is not configured');
  const tag = await fetchLatestRelease(config.qa.repository, fetcher);
  const archive = releaseArchiveName(tag.slice(1));
  const download = `https://github.com/${config.qa.repository}/releases/download/${encodeURIComponent(tag)}`;
  const [archiveResponse, sumsResponse] = await Promise.all([
    fetcher(`${download}/${encodeURIComponent(archive)}`, { headers: { Accept: 'application/octet-stream', 'User-Agent': 'qa-ai-playwright' }, signal: AbortSignal.timeout(60000) }),
    fetcher(`${download}/SHA256SUMS.txt`, { headers: { Accept: 'text/plain', 'User-Agent': 'qa-ai-playwright' }, signal: AbortSignal.timeout(30000) }),
  ]);
  if (!archiveResponse.ok || !sumsResponse.ok) throw new Error('Failed to download QA Release assets');
  const archiveData = new Uint8Array(await archiveResponse.arrayBuffer());
  verifySums(archiveData, await sumsResponse.text(), archive);
  const staging = mkdtempSync(join(tmpdir(), 'qa-release-'));
  const archivePath = join(staging, archive);
  writeFileSync(archivePath, archiveData);
  try {
    if (process.platform === 'linux') {
      execFileSync('unzip', ['-q', archivePath, '-d', staging], { stdio: 'inherit' });
    } else {
      execFileSync('tar', ['-xf', archivePath, '-C', staging], { stdio: 'inherit' });
    }
    const extractedName = readdirSync(staging, { withFileTypes: true }).find((entry) => entry.isDirectory())?.name;
    if (!extractedName) throw new Error('Invalid extracted QA Release');
    const extracted = join(staging, extractedName);
    runInstaller(extracted);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return { tag, asset: archive };
}

export function releaseArchiveName(version: string): string {
  return `qa-ai-playwright-v${version}.zip`;
}

