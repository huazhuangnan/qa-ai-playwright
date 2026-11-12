import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectUninstall } from '../packages/qa-cli/cli/project.ts';
import type { Environment } from '../packages/qa-cli/cli/environment.ts';
import { digest, OWNER } from '../packages/qa-cli/cli/shared.ts';

const workspaces: string[] = [];
afterEach(() => {
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true });
});

/** Creates a project marker without installing external tools. */
function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'qa-uninstall-'));
  workspaces.push(base);
  const target = join(base, 'project');
  mkdirSync(target);
  const env = { root: join(base, 'environment'), requireInitialized: () => {} } as unknown as Environment;
  const marker = join(target, '.qa-project.json');
  const state = { owner: OWNER, stack: 'typescript', target, files: {} as Record<string, string>, directories: ['node_modules'] };
  return { target, marker, state, env };
}

test('preserves dependency data and tracks edits across repeated uninstalls', async () => {
  const { target, marker, state, env } = fixture();
  const edited = join(target, 'edited.txt');
  const unchanged = join(target, 'unchanged.txt');
  writeFileSync(edited, 'original');
  writeFileSync(unchanged, 'original');
  state.files = { 'edited.txt': digest(edited), 'unchanged.txt': digest(unchanged) };
  writeFileSync(edited, 'user edit');
  mkdirSync(join(target, 'node_modules'));
  writeFileSync(join(target, 'node_modules', 'user-data.txt'), 'keep');
  writeFileSync(marker, JSON.stringify(state));

  expect(await projectUninstall(env, { target })).toBe(1);
  expect(existsSync(unchanged)).toBe(false);
  expect(readFileSync(edited, 'utf8')).toBe('user edit');
  expect(readFileSync(join(target, 'node_modules', 'user-data.txt'), 'utf8')).toBe('keep');
  const remaining = JSON.parse(readFileSync(marker, 'utf8'));
  expect(remaining.files).toEqual({ 'edited.txt': state.files['edited.txt'] });
  expect(remaining.directories).toEqual(['node_modules']);
  expect(await projectUninstall(env, { target })).toBe(1);
  expect(JSON.parse(readFileSync(marker, 'utf8')).files).toEqual(remaining.files);
  expect(readFileSync(join(target, 'node_modules', 'user-data.txt'), 'utf8')).toBe('keep');

  rmSync(join(target, 'node_modules'), { recursive: true });
  rmSync(edited);
  expect(await projectUninstall(env, { target })).toBe(0);
  expect(existsSync(marker)).toBe(false);
});

test('preserving only dependency and untracked files reports successful cleanup', async () => {
  const { target, marker, state, env } = fixture();
  mkdirSync(join(target, 'node_modules'));
  writeFileSync(join(target, 'node_modules', 'user-data.txt'), 'keep');
  writeFileSync(join(target, 'notes.txt'), 'keep');
  writeFileSync(marker, JSON.stringify(state));
  expect(await projectUninstall(env, { target })).toBe(0);
  expect(existsSync(marker)).toBe(true);
  expect(readFileSync(join(target, 'notes.txt'), 'utf8')).toBe('keep');
  expect(readFileSync(join(target, 'node_modules', 'user-data.txt'), 'utf8')).toBe('keep');
});

test('refuses traversal before deleting any project files', async () => {
  const { target, marker, state, env } = fixture();
  const safe = join(target, 'safe.txt');
  writeFileSync(safe, 'original');
  state.files = { 'safe.txt': digest(safe), '../outside.txt': 'invalid' };
  writeFileSync(marker, JSON.stringify(state));
  await expect(projectUninstall(env, { target })).rejects.toThrow('Unsafe manifest path');
  expect(readFileSync(safe, 'utf8')).toBe('original');
  expect(existsSync(marker)).toBe(true);
});
