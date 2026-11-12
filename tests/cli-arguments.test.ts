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
});

test('update source retains the existing argument contract', () => {
  assert.equal(parseArgs(['update', 'check', '--source', 'file path.json']).updateSource, 'file path.json');
  assert.equal(parseArgs(['update', 'check', '--source', '-file']).updateSource, '-file');
  assert.throws(() => parseArgs(['update', 'check', '--source=file']), /accepts --source/);
  assert.throws(() => parseArgs(['update', 'check', '--source']), /accepts --source/);
  assert.equal(parseArgs(['skills', 'check-updates', '--source', '-file']).skillSource, '-file');
  assert.throws(() => parseArgs(['skills', 'check-updates', '--source=file']), /accepts --source/);
});
