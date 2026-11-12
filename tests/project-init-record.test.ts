import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Environment } from '../packages/qa-cli/cli/environment.ts';
import { projectInit } from '../packages/qa-cli/cli/project.ts';

const workspaces: string[] = [];
afterEach(() => {
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true });
});

/** Build a minimal repository and a controllable TypeScript environment. */
function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'qa-init-record-'));
  workspaces.push(base);
  const repo = join(base, 'repo');
  for (const name of ['typescript', 'qa']) {
    const directory = join(repo, 'packages', 'templates', name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'VERSION'), '0.0.1\n');
  }
  const target = join(base, 'project');
  const calls: string[][] = [];
  let failure: 'pnpm' | 'playwright' | undefined;
  const env = {
    root: join(base, 'env'), repo, node: 'node',
    requireInitialized: () => {},
    pnpm: () => { if (failure === 'pnpm') throw new Error('dependency installation failed'); },
    run: (args: string[]) => { calls.push(args); },
    playwright: () => { if (failure === 'playwright') throw new Error('project checks failed'); },
  } as unknown as Environment;
  const marker = join(target, '.qa-project.json');
  const read = () => JSON.parse(readFileSync(marker, 'utf8')) as Record<string, unknown>;
  return { target, marker, env, calls, read, fail: (step: 'pnpm' | 'playwright') => { failure = step; }, resume: () => { failure = undefined; } };
}

test('only successful initialization updates the requested browser options', async () => {
  const f = fixture();
  await projectInit(f.env, { target: f.target, stack: 'typescript', browser: 'firefox', withDeps: true });
  expect(f.read().last_successful_init).toEqual({ browser: 'firefox', browser_system_dependencies_requested: true });
  expect(f.calls.some((args) => args.includes('--with-deps') && args.includes('firefox'))).toBe(true);

  f.fail('pnpm');
  await expect(projectInit(f.env, { target: f.target, stack: 'typescript', browser: 'webkit', withDeps: false })).rejects.toThrow('dependency installation failed');
  expect(f.read().last_successful_init).toEqual({ browser: 'firefox', browser_system_dependencies_requested: true });

  f.fail('playwright');
  await expect(projectInit(f.env, { target: f.target, stack: 'typescript', browser: 'webkit', withDeps: false })).rejects.toThrow('project checks failed');
  expect(f.read().last_successful_init).toEqual({ browser: 'firefox', browser_system_dependencies_requested: true });

  f.resume();
  await projectInit(f.env, { target: f.target, stack: 'typescript', browser: 'none', withDeps: true });
  expect(f.read().last_successful_init).toEqual({ browser: 'none', browser_system_dependencies_requested: false });
});

test('legacy project marker gains the record after successful initialization', async () => {
  const f = fixture();
  await projectInit(f.env, { target: f.target, stack: 'typescript', browser: 'none', withDeps: false });
  const legacy = f.read();
  delete legacy.last_successful_init;
  writeFileSync(f.marker, JSON.stringify(legacy));
  await projectInit(f.env, { target: f.target, stack: 'typescript', withDeps: false });
  expect(f.read().last_successful_init).toEqual({ browser: 'chromium', browser_system_dependencies_requested: false });
});
