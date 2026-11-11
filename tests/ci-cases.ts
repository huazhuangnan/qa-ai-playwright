import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readMcpServerConfig,
} from '../packages/qa-ai-playwright/src/cli/shared.ts';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = requiredEnvironment('QA_ROOT');
const launcher = process.platform === 'win32'
  ? [
      'powershell.exe',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(REPO, 'packages/qa-ai-playwright/src/bin/qa.ps1'),
    ]
  : ['bash', join(REPO, 'packages/qa-ai-playwright/src/bin/qa.sh')];

interface EnvironmentState {
  profile: string;
  node: string;
  bun: string;
  pnpm: string;
  python: string;
  uv: string;
  playwright_mcp: string;
  agent_browser: string;
  cc_switch: string;
  [key: string]: unknown;
}

/** Runs the public launcher and fails when the expected exit code does not match. */
function qa(
  args: string[],
  expectedStatus = 0,
): SpawnSyncReturns<Buffer> {
  const result = spawnSync(launcher[0] as string, [...launcher.slice(1), ...args], {
    cwd: REPO,
    env: process.env,
    stdio: 'inherit',
  });
  assert.equal(
    result.status,
    expectedStatus,
    `qa ${args.join(' ')} exited with ${String(result.status)}`,
  );
  return result;
}

/** Reads and parses one JSON file. */
function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** Reads a required environment value. */
function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return resolve(value);
}

/** Runs the environment installation and repeat-install verification. */
async function environmentCase(): Promise<void> {
  qa(['env', 'check', 'both', '--full']);
  const state = readJson<EnvironmentState>(join(ROOT, 'state.json'));
  const nodeMajor = process.env.QA_NODE_MAJOR;
  const pythonVersion = process.env.QA_PYTHON_VERSION;
  assert.ok(nodeMajor);
  assert.ok(pythonVersion);
  assert.ok(state.node.startsWith(`v${nodeMajor}.`));
  assert.equal(state.bun, process.env.QA_BUN_VERSION ?? '1.4.4');
  assert.equal(state.pnpm, process.env.QA_PNPM_VERSION ?? '12.18.0');
  assert.ok(state.python.startsWith(`Python ${pythonVersion}.`));
  assert.equal(
    state.uv.split(/\s+/u)[1],
    process.env.QA_UV_VERSION ?? '0.13.7',
  );
  assert.equal(state.profile, 'full');
  assert.equal(state.playwright_mcp, '0.0.85');
  assert.equal(state.agent_browser, '0.42.0');
  assert.equal(state.cc_switch, '4.0.28');

  qa(['run', 'codex', '--version']);
  qa(['run', 'bun', '--version']);
  qa(['run', 'pnpm', '--version']);
  qa(['run', 'playwright-cli', '--version']);
  qa(['run', 'agent-browser', '--version']);
  qa(['run', 'agent-browser', 'open', 'about:blank']);
  qa(['run', 'agent-browser', 'close']);
  const packageRoot = process.platform === 'win32'
    ? join(ROOT, 'tools/npm/node_modules')
    : join(ROOT, 'tools/npm/lib/node_modules');
  qa(['run', 'node', join(packageRoot, '@playwright/mcp/cli.js'), '--version']);
  qa(['run', 'codex', 'mcp', 'list', '--json']);

  const playwright = readMcpServerConfig(
    join(ROOT, 'codex/config.toml'),
    'playwright',
  );
  assert.ok(playwright.command);
  assert.ok(playwright.args?.includes('--headless'));
  assert.ok(playwright.args?.includes('--isolated'));
  assert.ok((playwright.args?.indexOf('--browser') ?? -1) >= 0);
  assert.equal(playwright.args?.[playwright.args.indexOf('--browser') + 1], 'chromium');
  assert.ok(playwright.args?.includes(join(ROOT, 'mcp-output')));
  const agentBrowser = readMcpServerConfig(
    join(ROOT, 'codex/config.toml'),
    'agent-browser',
  );
  assert.equal(agentBrowser.args?.at(-1), 'mcp');
  assert.equal(
    agentBrowser.env?.AGENT_BROWSER_SOCKET_DIR,
    join(ROOT, 'runtime/agent-browser'),
  );
  assert.ok(agentBrowser.env?.AGENT_BROWSER_EXECUTABLE_PATH);
  assert.equal(
    agentBrowser.env?.AGENT_BROWSER_CONFIG,
    join(ROOT, 'agent-browser-config.json'),
  );
  qa(['run', 'bun', 'tests/mcp-smoke.ts']);

  qa(['mcp', 'list']);
  qa(['mcp', 'add', 'playwright'], 1);
  qa(['mcp', 'add', 'faker']);
  const faker = readMcpServerConfig(
    join(ROOT, 'codex/config.toml'),
    'faker',
  );
  assert.ok(faker.command);
  assert.ok(faker.args?.some((argument) => argument.endsWith('dist/index.js')));
  const mcpLock = readJson<{ servers: Record<string, unknown> }>(
    join(ROOT, 'codex/mcp.lock.json'),
  );
  assert.ok(mcpLock.servers.faker);
  qa(['mcp', 'remove', 'faker']);
  assert.equal(
    readMcpServerConfig(join(ROOT, 'codex/config.toml'), 'faker').command,
    '',
  );

  assert.ok(!existsSync(join(ROOT, 'codex/skills/qa-core')));
  const legacy = join(ROOT, 'codex/skills/qa-python/SKILL.md');
  const lock = join(ROOT, 'codex/skills.lock.json');
  mkdirSync(dirname(legacy), { recursive: true });
  writeFileSync(legacy, 'preserve existing Skill', 'utf8');
  writeFileSync(lock, '{"schema":1,"skills":{"qa-python":{"scope":"environment"}}}', 'utf8');
  const before = readFileSync(lock);
  qa(['env', 'init', 'both', '--full']);
  qa(['env', 'check', 'both', '--full']);
  const after = readJson<EnvironmentState>(join(ROOT, 'state.json'));
  assert.equal(readFileSync(legacy, 'utf8'), 'preserve existing Skill');
  assert.deepEqual(readFileSync(lock), before);
  assert.ok(!existsSync(join(ROOT, 'codex/skills/qa-core')));
  for (const key of [
    'node',
    'python',
    'uv',
    'codex',
    'playwright_cli',
    'playwright_mcp',
    'agent_browser',
    'agent_browser_mcp',
  ]) {
    assert.deepEqual(after[key], state[key], key);
  }
  console.log(
    'Environment, Codex, Playwright CLI, MCP and repeat installation passed.',
  );
}

/** Runs one generated project through real browser checks. */
async function projectCase(): Promise<void> {
  const stack = process.env.QA_TEST_STACK;
  if (!stack) {
    throw new Error('QA_TEST_STACK is required');
  }
  const browsers = process.env.QA_TEST_BROWSERS ?? 'chromium';
  const target = join(REPO, 'workspaces', `test project ${stack}`);
  const args = [
    'project',
    'init',
    target,
    '--language',
    stack,
    '--browser',
    browsers,
  ];
  if (process.platform === 'linux') {
    args.push('--with-deps');
  }
  qa(args);
  const marker = readJson<{ language_template_version: string }>(
    join(target, '.qa-project.json'),
  );
  const templateVersion = readFileSync(join(target, 'VERSION'), 'utf8').trim();
  assert.equal(marker.language_template_version, templateVersion);
  const lockName = stack === 'python' ? 'requirements.lock' : 'pnpm-lock.yaml';
  assert.ok(existsSync(join(target, lockName)), lockName);
  for (const browser of browsers === 'all'
    ? ['chromium', 'firefox', 'webkit']
    : [browsers]) {
    qa([
      'project',
      'check',
      target,
      '--browser',
      browser,
    ]);
  }
  console.log(`${stack} real project and ${browsers} browser checks passed.`);
}

/** Runs lifecycle unit tests and verifies project and environment cleanup. */
async function uninstallCase(): Promise<void> {
  qa(['run', 'bun', 'run', 'test:unit']);
  for (const stack of ['python', 'typescript']) {
    const target = join(REPO, 'workspaces', `uninstall project ${stack}`);
    mkdirSync(target, { recursive: true });
    const rules = join(target, 'AGENTS.md');
    writeFileSync(rules, 'preexisting project rules', 'utf8');
    qa([
      'project',
      'init',
      target,
      '--language',
      stack,
      '--browser',
      'none',
    ]);
    const modified = join(
      target,
      stack === 'python'
        ? 'tests/e2e/test_browser.py'
        : 'tests/e2e/browser.spec.ts',
    );
    writeFileSync(modified, stack === 'python' ? '# user test' : '// user test');
    const notes = join(target, 'user-notes.txt');
    writeFileSync(notes, 'must survive uninstall', 'utf8');
    qa(['project', 'uninstall', target]);
    assert.equal(readFileSync(notes, 'utf8'), 'must survive uninstall');
    assert.equal(readFileSync(rules, 'utf8'), 'preexisting project rules');
    assert.ok(existsSync(modified));
    assert.ok(!existsSync(join(target, stack === 'python' ? '.venv' : 'node_modules')));
    assert.ok(!existsSync(join(target, '.qa-project.json')));
  }

  const partial = join(REPO, 'workspaces/partial environment');
  mkdirSync(partial, { recursive: true });
  writeFileSync(join(partial, '.qa-managed'), 'qa-local-environment-v1');
  writeFileSync(join(partial, 'partial-download'), 'incomplete install');
  qa(['--root', partial, 'env', 'uninstall']);
  assert.ok(!existsSync(partial));

  const unmanaged = join(REPO, 'workspaces/unmanaged environment');
  mkdirSync(unmanaged, { recursive: true });
  const sentinel = join(unmanaged, 'keep.txt');
  writeFileSync(sentinel, 'not owned', 'utf8');
  qa(['--root', unmanaged, 'env', 'uninstall'], 1);
  assert.equal(readFileSync(sentinel, 'utf8'), 'not owned');
  qa(['--root', `${REPO}${process.platform === 'win32' ? '\\' : '/'}`, 'env', 'uninstall'], 1);
  console.log(
    'Project uninstall, changed files, partial install and unmanaged-directory refusal passed.',
  );
}

const cases: Record<string, () => Promise<void>> = {
  env: environmentCase,
  project: projectCase,
  uninstall: uninstallCase,
};

const selected = process.argv[2] as keyof typeof cases | undefined;
if (!selected || !cases[selected]) {
  throw new Error('Use one case: env, project or uninstall');
}
await cases[selected]();
