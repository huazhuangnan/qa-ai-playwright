import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'bun:test';

import {
  assertPackageLinks,
  packageEntries,
  packageTarget,
} from '../scripts/package-layout.ts';
import { REPO } from '../packages/qa-cli/cli/shared.ts';

test('package layout keeps QA rules and excludes repository governance', () => {
  assert.equal(packageTarget('AGENTS.md'), undefined);
  assert.equal(
    packageTarget('packages/templates/typescript/AGENTS.md'),
    'packages/templates/typescript/AGENTS.md',
  );
  assert.equal(packageTarget('docs/maintainers/release.zh-CN.md'), undefined);
  assert.equal(packageTarget('docs/users/environment.zh-CN.md'), 'docs/users/environment.zh-CN.md');
});

test('user delivery contains resolvable local Markdown links', () => {
  const entries = packageEntries(listRepositoryFiles());
  assert.ok(entries.some((entry) => entry.source === 'README.md'));
  assert.ok(entries.some((entry) => entry.source === 'packages/templates/python/AGENTS.md'));
  assert.ok(entries.some((entry) => entry.source === 'packages/templates/typescript/AGENTS.md'));
  assertPackageLinks(entries, (source) => readFileSync(join(REPO, source), 'utf8'));
});

test('builtin QA workflow exposes two skills with resolvable references', () => {
  const builtin = join(REPO, 'packages/skills/builtin');
  assert.deepEqual(readdirSync(builtin).sort(), ['qa-core', 'qa-setup']);

  const entries = packageEntries(listRepositoryFiles()).filter(({ source }) =>
    source.startsWith('packages/skills/builtin/qa-core/'),
  );
  assert.ok(entries.some(({ source }) => source.endsWith('/references/api-testing.md')));
  assert.ok(entries.some(({ source }) => source.endsWith('/references/automation/python.md')));
  assert.ok(entries.some(({ source }) => source.endsWith('/references/automation/typescript.md')));
  assertPackageLinks(entries, (source) => readFileSync(join(REPO, source), 'utf8'));
});

test('docs expose separate reader indexes and keep maintainer pages out of the package', () => {
  const entries = packageEntries(listRepositoryFiles());
  assert.ok(entries.some(({ source }) => source === 'docs/users/README.md'));
  assert.ok(!entries.some(({ source }) => source === 'docs/maintainers/README.md'));

  const root = readFileSync(join(REPO, 'README.md'), 'utf8');
  const rootLines = root.split(/\r?\n/u);
  assert.equal(rootLines[0], '# QA + AI + Playwright');
  assert.equal(rootLines[1], '');
  assert.equal(rootLines[2], '[QA 使用文档](docs/users/README.md) | [QA 维护文档](https://github.com/huazhuangnan/qa-ai-playwright/blob/main/docs/maintainers/README.md)');
  assert.equal(root.match(/\[QA 维护文档\]/gu)?.length, 1);

  const userIndex = readFileSync(join(REPO, 'docs/users/README.md'), 'utf8');
  const maintainerIndex = readFileSync(join(REPO, 'docs/maintainers/README.md'), 'utf8');
  const userIndexLines = userIndex.split(/\r?\n/u);
  const maintainerIndexLines = maintainerIndex.split(/\r?\n/u);
  assert.equal(userIndexLines[0], '# QA 使用文档');
  assert.match(userIndexLines[2] ?? '', /^\[使用文档\]\(README\.md\) \| \[维护文档\]/u);
  assert.equal(userIndex.match(/\[维护文档\]/gu)?.length, 1);
  assert.equal(maintainerIndexLines[0], '# QA 维护文档');
  assert.equal(maintainerIndexLines[2], '[使用文档](../users/README.md) | [维护文档](README.md)');
  assert.equal(maintainerIndex.match(/\[维护文档\]/gu)?.length, 1);
  for (const file of readdirSync(join(REPO, 'docs/users')).filter((name) => name.endsWith('.md') && name !== 'README.md')) {
    const content = readFileSync(join(REPO, 'docs/users', file), 'utf8');
    const lines = content.split(/\r?\n/u);
    assert.match(lines[0] ?? '', /^# /u, file);
    assert.equal(lines[1], '', file);
    assert.match(lines[2] ?? '', /^\[使用文档\]\(README\.md\) \| \[维护文档\]/u, file);
    assert.equal(content.match(/\[维护文档\]/gu)?.length, 1, file);
  }
  for (const file of readdirSync(join(REPO, 'docs/maintainers')).filter((name) => name.endsWith('.md') && name !== 'README.md')) {
    const content = readFileSync(join(REPO, 'docs/maintainers', file), 'utf8');
    const lines = content.split(/\r?\n/u);
    assert.match(lines[0] ?? '', /^# /u, file);
    assert.equal(lines[1], '', file);
    assert.equal(lines[2], '[使用文档](../users/README.md) | [维护文档](README.md)', file);
    assert.equal(content.match(/\[维护文档\]/gu)?.length, 1, file);
  }
});

/** Lists tracked and untracked source files while excluding ignored artifacts. */
function listRepositoryFiles(): string[] {
  return execFileSync(
    'git',
    ['-C', REPO, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'buffer' },
  ).toString('utf8').split('\0').filter((file) => file && existsSync(join(REPO, file)));
}
