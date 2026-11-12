import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { checkQaSource, checkVersionSource, loadUpdateConfig, resolveVersionSources } from '../packages/qa-cli/cli/update-check.ts';
import { parseArgs } from '../packages/qa-cli/qa-cli.ts';
import type { Fetcher } from '../packages/qa-cli/cli/skill-updates.ts';

const npmSource = { name: 'playwright-mcp', type: 'npm' as const, target: '@playwright/mcp', current: '0.0.85' };
const releaseSource = { name: 'example', type: 'github-release' as const, target: 'example/tool', current: '1.2.3' };

/** Return a JSON response without contacting an upstream service. */
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

test('checks the encoded npm package latest endpoint and reports the current version', async () => {
  const requests: string[] = [];
  const fetcher: Fetcher = async (input) => {
    requests.push(input instanceof Request ? input.url : String(input));
    return jsonResponse({ version: '0.0.85' });
  };
  const result = await checkVersionSource(npmSource, fetcher);
  assert.deepEqual(requests, ['https://registry.npmjs.org/%40playwright%2Fmcp/latest']);
  assert.equal(result.name, npmSource.name);
  assert.equal(result.current, npmSource.current);
  assert.equal(result.status, 'current');
});

test('reports an npm candidate when its version changes', async () => {
  const result = await checkVersionSource(npmSource, async () => jsonResponse({ version: '0.0.86' }));
  assert.equal(result.status, 'changed');
  assert.equal(result.current, npmSource.current);
  assert.equal(result.candidate, '0.0.86');
});

test('checks the GitHub latest release and compares its tag without the v prefix', async () => {
  const requests: string[] = [];
  const fetcher: Fetcher = async (input) => {
    requests.push(input instanceof Request ? input.url : String(input));
    return jsonResponse({ tag_name: 'v1.2.3' });
  };
  const result = await checkVersionSource(releaseSource, fetcher);
  assert.deepEqual(requests, ['https://api.github.com/repos/example/tool/releases/latest']);
  assert.equal(result.name, releaseSource.name);
  assert.equal(result.current, releaseSource.current);
  assert.equal(result.status, 'current');
});

test('reports a changed GitHub release after removing its v prefix', async () => {
  const result = await checkVersionSource(releaseSource, async () => jsonResponse({ tag_name: 'v1.3.0' }));
  assert.equal(result.status, 'changed');
  assert.equal(result.current, releaseSource.current);
  assert.equal(result.candidate, '1.3.0');
});

test('reports HTTP, network and malformed JSON failures as errors', async () => {
  const fetchers: Array<Fetcher> = [
    async () => jsonResponse({ message: 'rate limited' }, 403),
    async () => { throw new Error('network unavailable'); },
    async () => new Response('{', { status: 200 }),
  ];
  for (const fetcher of fetchers) {
    const result = await checkVersionSource(npmSource, fetcher);
    assert.equal(result.name, npmSource.name);
    assert.equal(result.current, npmSource.current);
    assert.equal(result.status, 'error');
    assert.ok(result.message);
  }
});

test('reports missing or empty versions and release tags as errors', async () => {
  for (const [source, payload] of [
    [npmSource, {}],
    [npmSource, { version: '' }],
    [releaseSource, {}],
    [releaseSource, { tag_name: '' }],
    [releaseSource, { tag_name: 'v' }],
  ] as const) {
    const result = await checkVersionSource(source, async () => jsonResponse(payload));
    assert.equal(result.status, 'error');
    assert.ok(result.message);
  }
});

test('rejects unsafe source targets before issuing a request', async () => {
  const sources = [
    { ...npmSource, target: '../other' },
    { ...npmSource, target: 'https://evil.example/package' },
    { ...releaseSource, target: '../other' },
    { ...releaseSource, target: 'example/tool?redirect=https://evil.example' },
    { ...releaseSource, target: 'example/tool/extra' },
  ];
  let requests = 0;
  const fetcher: Fetcher = async () => {
    requests += 1;
    throw new Error('unsafe source reached fetch');
  };
  for (const source of sources) {
    const result = await checkVersionSource(source, fetcher);
    assert.equal(result.status, 'error');
    assert.ok(result.message);
  }
  assert.equal(requests, 0);
});

test('uses unconfigured status for QA source until a repository is explicitly set', async () => {
  const result = await checkQaSource({ repository: '', ref: '' });
  assert.equal(result.status, 'unconfigured');
  assert.match(result.message ?? '', /qa\.repository/u);
});

test('loads the default source configuration and repository baselines', () => {
  const config = loadUpdateConfig();
  const sources = resolveVersionSources(config);
  assert.ok(sources.some((source) => source.name === 'playwright-mcp' && source.current));
  assert.ok(sources.some((source) => source.name === 'faker-mcp' && source.current));
  assert.ok(sources.some((source) => source.name === 'cc-switch' && source.current));
  assert.equal(parseArgs(['update', 'check', '--source', 'sources.json']).updateSource, 'sources.json');
  assert.throws(() => parseArgs(['update', 'check', '--source']));
});
