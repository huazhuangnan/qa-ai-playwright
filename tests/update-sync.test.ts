import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fetchLatestRelease, releaseArchiveName, syncLatestRelease } from '../packages/qa-cli/cli/update-sync.ts';

test('resolves the latest release redirect', async () => {
  const tag = await fetchLatestRelease('example/qa', async (input, init) => {
    assert.equal(String(input), 'https://github.com/example/qa/releases/latest');
    assert.equal(init?.redirect, 'manual');
    return new Response(null, { status: 302, headers: { location: '/example/qa/releases/tag/v0.0.2' } });
  });
  assert.equal(tag, 'v0.0.2');
  assert.equal(releaseArchiveName(tag.slice(1)), 'qa-ai-playwright-v0.0.2.zip');
});

test('rejects invalid release redirects', async () => {
  for (const location of [null, 'https://evil.test/example/qa/releases/tag/v1.0.0',
    '/example/other/releases/tag/v1.0.0', '/example/qa/releases/tag/invalid',
    '/example/qa/releases/tag/v1.0.0?other=1']) {
    await assert.rejects(fetchLatestRelease('example/qa', async () => new Response(null, {
      status: 302, headers: location ? { location } : {},
    })), /Invalid GitHub release redirect/);
  }
  await assert.rejects(fetchLatestRelease('example/qa', async () => new Response(null, { status: 404 })), /HTTP 404/);
});

test('downloads both assets from the resolved tag and reports missing assets', async () => {
  const requests: string[] = [];
  await assert.rejects(syncLatestRelease({ qa: { repository: 'example/qa', ref: '' }, sources: [] }, async (input) => {
    const url = String(input);
    requests.push(url);
    return url.endsWith('/latest')
      ? new Response(null, { status: 302, headers: { location: '/example/qa/releases/tag/v1.2.3' } })
      : new Response(null, { status: 404 });
  }), /Failed to download QA Release assets/);
  assert.deepEqual(requests.slice(1).sort(), [
    'https://github.com/example/qa/releases/download/v1.2.3/SHA256SUMS.txt',
    'https://github.com/example/qa/releases/download/v1.2.3/qa-ai-playwright-v1.2.3.zip',
  ]);
});

test('rejects an archive that does not match the checksum', async () => {
  await assert.rejects(syncLatestRelease({ qa: { repository: 'example/qa', ref: '' }, sources: [] }, async (input) => {
    const url = String(input);
    if (url.endsWith('/latest')) return new Response(null, { status: 302, headers: { location: '/example/qa/releases/tag/v1.2.3' } });
    if (url.endsWith('/SHA256SUMS.txt')) return new Response(`${'0'.repeat(64)}  qa-ai-playwright-v1.2.3.zip`);
    return new Response('archive');
  }), /SHA256 verification failed/);
});

test('runs the release installer without forcing a reinstall', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-sync-test-'));
  const previous = process.env.QA_SYNC_TEST_ARGS;
  const argsFile = join(root, 'args.txt');
  process.env.QA_SYNC_TEST_ARGS = argsFile;
  try {
    const bin = join(root, 'release', 'packages', 'qa-cli', 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'install.ps1'), 'Set-Content -LiteralPath $env:QA_SYNC_TEST_ARGS -Value $args.Count\n');
    writeFileSync(join(bin, 'install.sh'), 'printf "%s" "$#" > "$QA_SYNC_TEST_ARGS"\n');
    const archivePath = join(root, 'release.zip');
    execFileSync('tar', ['-acf', archivePath, '-C', root, 'release']);
    const archive = readFileSync(archivePath);
    const hash = createHash('sha256').update(archive).digest('hex');
    const result = await syncLatestRelease({ qa: { repository: 'example/qa', ref: '' }, sources: [] }, async (input) => {
      const url = String(input);
      if (url.endsWith('/latest')) return new Response(null, { status: 302, headers: { location: '/example/qa/releases/tag/v1.2.3' } });
      if (url.endsWith('/SHA256SUMS.txt')) return new Response(`${hash}  qa-ai-playwright-v1.2.3.zip`);
      return new Response(new Uint8Array(archive));
    });
    assert.equal(result.tag, 'v1.2.3');
    assert.equal(readFileSync(argsFile, 'utf8').trim(), '0');
  } finally {
    if (previous === undefined) delete process.env.QA_SYNC_TEST_ARGS;
    else process.env.QA_SYNC_TEST_ARGS = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
