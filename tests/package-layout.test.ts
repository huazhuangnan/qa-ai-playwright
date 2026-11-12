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

/** Lists tracked and untracked source files while excluding ignored artifacts. */
function listRepositoryFiles(): string[] {
  return execFileSync(
    'git',
    ['-C', REPO, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'buffer' },
  ).toString('utf8').split('\0').filter((file) => file && existsSync(join(REPO, file)));
}
