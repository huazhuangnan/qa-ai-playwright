import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseArgs } from '../packages/qa-cli/cli/arguments.ts';

test('root options preserve values and stop at run', () => {
  const parsed = parseArgs(['--root', 'C:\\QA workspace', 'run', 'tool', '--root', 'child']);
  assert.equal(parsed.root, 'C:\\QA workspace');
  assert.deepEqual(parsed.runArgs, ['tool', '--root', 'child']);
  assert.equal(parseArgs(['env', 'list', '--root=-directory']).root, '-directory');
  assert.equal(parseArgs(['--root=', 'env', 'list']).root, '');
  assert.throws(() => parseArgs(['--root']), /requires a directory/);
  assert.throws(() => parseArgs(['env', 'list', '--invalid']), /Unknown option/);
  assert.throws(() => parseArgs(['env', 'init', 'typescript', '--name', 'other']), /Unknown option/);
});

test('update source retains the existing argument contract', () => {
  assert.equal(parseArgs(['update', 'check', '--source', 'file path.json']).updateSource, 'file path.json');
  assert.equal(parseArgs(['update', 'check', '--source', '-file']).updateSource, '-file');
  assert.throws(() => parseArgs(['update', 'check', '--source=file']), /accepts --source/);
  assert.throws(() => parseArgs(['update', 'check', '--source']), /accepts --source/);
  assert.equal(parseArgs(['skills', 'check-updates', '--source', '-file']).skillSource, '-file');
  assert.throws(() => parseArgs(['skills', 'check-updates', '--source=file']), /accepts --source/);
});

test('boolean switches reject inline values', () => {
  for (const args of [
    ['env', 'init', 'typescript', '--full=false'],
    ['env', 'check', 'typescript', '--skip-codex=false'],
    ['env', 'check', 'typescript', '--skip-skills=false'],
    ['env', 'init', 'typescript', '--with-cc-switch=false'],
    ['project', 'init', 'example', '--language', 'typescript', '--with-deps=false'],
  ]) {
    assert.throws(() => parseArgs(args), /Unknown option/);
  }
});
