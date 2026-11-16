import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchLatestRelease, releaseArchiveName } from '../packages/qa-cli/cli/update-sync.ts';

test('fetches and validates the latest QA release metadata', async () => {
  const release = await fetchLatestRelease('example/qa', async (input) => {
    assert.equal(String(input), 'https://api.github.com/repos/example/qa/releases/latest');
    return new Response(JSON.stringify({
      tag_name: 'v0.0.2',
      assets: [{ name: 'qa-ai-playwright-v0.0.2.zip', browser_download_url: 'https://example.test/qa.zip' }],
    }), { status: 200 });
  });
  assert.equal(release.tag_name, 'v0.0.2');
  assert.equal(release.assets[0]?.name, 'qa-ai-playwright-v0.0.2.zip');
});

test('uses the release archive naming convention', () => {
  assert.equal(releaseArchiveName('0.0.2'), 'qa-ai-playwright-v0.0.2.zip');
});

test('rejects invalid release responses', async () => {
  await assert.rejects(
    fetchLatestRelease('example/qa', async () => new Response('{}', { status: 200 })),
    /Invalid GitHub release metadata/,
  );
});
