import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parseArgs } from '../packages/qa-cli/qa-cli.ts';

import { checkSkillUpdates, loadSkillSources, validateSources } from '../packages/qa-cli/cli/skill-updates.ts';
import type { Fetcher } from '../packages/qa-cli/cli/skill-updates.ts';

const pinned = 'a'.repeat(40);
const originalDirectoryCommit = 'b'.repeat(40);
const updatedDirectoryCommit = 'c'.repeat(40);
const source = {
  name: 'example-skill',
  repository: 'example/skills',
  ref: 'main',
  path: 'skills/example-skill',
  commit: pinned,
  license: 'MIT',
};

/** Builds a GitHub response without accessing the network. */
function commitsResponse(sha: string): Response {
  return new Response(JSON.stringify([{ sha }]), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('reports current when the directory has the same last commit at the pinned and tracked refs', async () => {
  const requests: URL[] = [];
  const fetcher: Fetcher = async (input) => {
    requests.push(new URL(input instanceof Request ? input.url : String(input)));
    return commitsResponse(originalDirectoryCommit);
  };

  const results = await checkSkillUpdates(validateSources([source]), fetcher);

  assert.equal(results.length, 1);
  assert.equal(results[0]!.name, source.name);
  assert.equal(results[0]!.status, 'current');
  assert.equal(results[0]!.installedCommit, pinned);
  assert.equal(requests.length, 2);
  assert.deepEqual(new Set(requests.map((url) => url.searchParams.get('sha'))), new Set([pinned, 'main']));
  for (const url of requests) {
    assert.equal(url.origin, 'https://api.github.com');
    assert.equal(url.pathname, '/repos/example/skills/commits');
    assert.equal(url.searchParams.get('path'), source.path);
    assert.equal(url.searchParams.get('per_page'), '1');
  }
});

test('reports an update only when the tracked directory commit differs', async () => {
  const fetcher: Fetcher = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    return commitsResponse(url.searchParams.get('sha') === pinned ? originalDirectoryCommit : updatedDirectoryCommit);
  };

  const [resultValue] = await checkSkillUpdates(validateSources([source]), fetcher);

  const result = resultValue!;
  assert.equal(result.name, source.name);
  assert.equal(result.status, 'update');
  assert.equal(result.installedCommit, pinned);
  assert.equal(result.candidateCommit, updatedDirectoryCommit);
});

test('reports a failed source without suppressing another source', async () => {
  const second = { ...source, name: 'other-skill', path: 'skills/other-skill' };
  const fetcher: Fetcher = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.searchParams.get('path') === source.path) {
      return new Response('rate limited', { status: 403 });
    }
    return commitsResponse(originalDirectoryCommit);
  };

  const results = await checkSkillUpdates(validateSources([source, second]), fetcher);
  const failed = results.find((result) => result.name === source.name);
  const succeeded = results.find((result) => result.name === second.name);

  assert.equal(results.length, 2);
  assert.equal(failed?.status, 'error');
  assert.equal(failed?.installedCommit, pinned);
  assert.ok(failed?.message);
  assert.equal(succeeded?.status, 'current');
});

test('reports network failures and invalid GitHub responses as errors', async () => {
  for (const fetcher of [
    async () => { throw new Error('network unavailable'); },
    async () => new Response('not JSON', { status: 200 }),
    async () => new Response('[]', { status: 200 }),
    async () => new Response(JSON.stringify([{ sha: 'invalid' }]), { status: 200 }),
  ] satisfies Array<Fetcher>) {
    const [resultValue] = await checkSkillUpdates(validateSources([source]), fetcher);
    const result = resultValue!;
    assert.equal(result.status, 'error');
    assert.equal(result.installedCommit, pinned);
    assert.ok(result.message);
  }
});

test('accepts valid source data and rejects malformed sources', () => {
  assert.deepEqual(validateSources([source]), [source]);
  assert.equal(validateSources([{ ...source, ref: '' }])[0]!.ref, '');
  for (const invalid of [
    null,
    {},
    [null],
    [{ ...source, name: '' }],
    [{ ...source, repository: 'https://github.com/example/skills' }],
    [{ ...source, repository: 'example' }],
    [{ ...source, path: '' }],
    [{ ...source, commit: 'abc123' }],
    [{ ...source, commit: 'g'.repeat(40) }],
    [{ ...source, license: '' }],
  ]) {
    assert.throws(() => validateSources(invalid));
  }
});


test('default source manifest matches the documented fixed installation commands', () => {
  const entries = loadSkillSources();
  const reference = readFileSync(new URL('../packages/skills/builtin/qa-core/references/external-skills.md', import.meta.url), 'utf8');
  const commands = [...reference.matchAll(/`bunx skills@1\.8\.1 add https:\/\/github\.com\/([^/]+\/[^/]+)\/tree\/([a-f0-9]{40})\/([^ ]+) --skill ([a-z0-9-]+) --agent codex --copy --yes` \| ([^|]+) \|/gu)];
  assert.equal(commands.length, entries.length);
  for (const item of entries) {
    assert.ok(commands.some((match) => match[1] === item.repository && match[2] === item.commit && match[3] === item.path && match[4] === item.name && match[5]?.trim() === item.license), item.name);
  }
});

test('default branch query omits sha and custom source arguments are validated', async () => {
  const refs: Array<string | null> = [];
  const fetcher: Fetcher = async (input) => {
    refs.push(new URL(input instanceof Request ? input.url : String(input)).searchParams.get('sha'));
    return commitsResponse(originalDirectoryCommit);
  };
  await checkSkillUpdates(validateSources([{ ...source, ref: '' }]), fetcher);
  assert.deepEqual(refs, [pinned, null]);
  assert.equal(parseArgs(['skills', 'check-updates', '--source', 'sources.json']).skillSource, 'sources.json');
  assert.throws(() => parseArgs(['skills', 'check-updates', '--source']));
  assert.throws(() => parseArgs(['skills', 'check-updates', '--unexpected']));
});
