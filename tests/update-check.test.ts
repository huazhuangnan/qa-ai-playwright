import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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
    return new Response(null, { status: 302, headers: { location: '/example/tool/releases/tag/v1.2.3' } });
  };
  const result = await checkVersionSource(releaseSource, fetcher);
  assert.deepEqual(requests, ['https://github.com/example/tool/releases/latest']);
  assert.equal(result.name, releaseSource.name);
  assert.equal(result.current, releaseSource.current);
  assert.equal(result.status, 'current');
});

test('reports a changed GitHub release after removing its v prefix', async () => {
  const result = await checkVersionSource(releaseSource, async () => new Response(null, { status: 302, headers: { location: '/example/tool/releases/tag/v1.3.0' } }));
  assert.equal(result.status, 'changed');
  assert.equal(result.current, releaseSource.current);
  assert.equal(result.candidate, '1.3.0');
});

test('accepts non-v GitHub release prefixes', async () => {
  const result = await checkVersionSource({ ...releaseSource, tagPrefix: 'bun-v' }, async () => new Response(null, {
    status: 302,
    headers: { location: '/example/tool/releases/tag/bun-v1.4.4' },
  }));
  assert.equal(result.status, 'changed');
  assert.equal(result.candidate, '1.4.4');
});

test('checks the configured uv source using unprefixed release tags', async () => {
  const source = resolveVersionSources(loadUpdateConfig()).find((entry) => entry.name === 'uv');
  assert.ok(source);
  assert.equal(source.tagPrefix, '');
  const current = '0.13.7';
  for (const [candidate, status] of [['0.13.7', 'current'], ['0.13.9', 'changed']] as const) {
    const result = await checkVersionSource({ ...source, current }, async (input, init) => {
      assert.equal(String(input), 'https://github.com/astral-sh/uv/releases/latest');
      assert.equal(init?.redirect, 'manual');
      return new Response(null, {
        status: 302,
        headers: { location: `https://github.com/astral-sh/uv/releases/tag/${candidate}` },
      });
    });
    assert.deepEqual(result, { name: 'uv', current, candidate, status });
  }
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
    const result = await checkVersionSource(source, async () => source.type === 'github-release'
      ? new Response(null, { status: 302, headers: { location: `/example/tool/releases/tag/${String((payload as { tag_name?: string }).tag_name ?? '')}` } })
      : jsonResponse(payload));
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

test('checks installed QA versions without a root package manifest and rejects missing or invalid metadata', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qa installed update '));
  try {
    const cli = join(root, 'packages', 'qa-cli');
    cpSync(new URL('../packages/qa-cli', import.meta.url), cli, { recursive: true });
    assert.equal(existsSync(join(root, 'package.json')), false);
    const { checkQaSource: checkInstalledQa } = await import(pathToFileURL(join(cli, 'cli/update-check.ts')).href) as typeof import('../packages/qa-cli/cli/update-check.ts');
    const versionFile = join(cli, 'VERSION');
    const qa = { repository: 'example/qa', ref: '' };
    for (const current of ['1.2.3', '1.2.3-rc.1']) {
      writeFileSync(versionFile, `${current}\n`);
      for (const [candidate, status] of [[current, 'current'], ['1.3.0', 'changed']] as const) {
        const result = await checkInstalledQa(qa, async (input, init) => {
          assert.equal(String(input), 'https://github.com/example/qa/releases/latest');
          assert.equal(init?.redirect, 'manual');
          return new Response(null, { status: 302, headers: { location: `/example/qa/releases/tag/v${candidate}` } });
        });
        assert.deepEqual(result, { name: 'qa-cli-and-builtin-mcp', current, candidate, status });
      }
    }
    let requests = 0;
    for (const version of [undefined, '', '1.2', 'invalid']) {
      if (version === undefined) rmSync(versionFile);
      else writeFileSync(versionFile, version);
      const result = await checkInstalledQa(qa, async () => {
        requests += 1;
        throw new Error('Invalid local metadata reached fetch');
      });
      assert.equal(result.status, 'error');
      assert.equal(result.current, 'unknown');
      assert.match(result.message ?? '', /local QA package version/i);
    }
    assert.equal(requests, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports nonempty QA refs as unconfigured without requesting a Release', async () => {
  let requests = 0;
  const result = await checkQaSource({ repository: 'example/qa', ref: 'main' }, async () => {
    requests += 1;
    throw new Error('Unsupported ref reached fetch');
  });
  assert.equal(result.status, 'unconfigured');
  assert.equal(requests, 0);
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
