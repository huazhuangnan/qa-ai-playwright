import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readMcpServerConfig,
  within,
} from '../packages/qa-cli/cli/shared.ts';
import { Environment } from '../packages/qa-cli/cli/environment.ts';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = requiredEnvironment('QA_ROOT');
const CODEX_HOME = requiredEnvironment('CODEX_HOME');
const CONFIG = join(CODEX_HOME, 'config.toml');
const MCP_LOCK = join(CODEX_HOME, 'qa-ai-playwright-mcp.lock.json');
const RUNNER_TEMP = requiredEnvironment('RUNNER_TEMP');
if (!within(CODEX_HOME, RUNNER_TEMP) || CODEX_HOME === RUNNER_TEMP) {
  throw new Error('CI MCP tests require CODEX_HOME inside RUNNER_TEMP');
}
const npmConfig = requiredEnvironment('NPM_CONFIG_USERCONFIG');
if (!within(npmConfig, RUNNER_TEMP)) throw new Error('CI npm config must be inside RUNNER_TEMP');

/** Resolves the shared registration name for the current environment. */
function mcpName(name: string): string {
  const root = realpathSync(ROOT);
  const normalized = process.platform === 'win32' ? root.toLowerCase() : root;
  return `qa-${createHash('sha256').update(normalized).digest('hex').slice(0, 16)}-${name}`;
}
const launcher = process.platform === 'win32'
  ? [
      'powershell.exe',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(REPO, 'packages/qa-cli/bin/qa.ps1'),
    ]
  : ['bash', join(REPO, 'packages/qa-cli/bin/qa.sh')];

interface EnvironmentState {
  profile: string;
  node: string;
  bun: string;
  pnpm: string;
  python: string;
  uv: string;
  playwright_cli: string;
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
  const pythonVersion = process.env.QA_PYTHON_VERSION;
  assert.ok(pythonVersion);
  assert.match(state.node, /^v\d+\./);
  assert.ok(state.bun);
  assert.ok(state.pnpm);
  assert.ok(state.python.startsWith(`Python ${pythonVersion}.`));
  assert.equal(
    state.uv.split(/\s+/u)[1],
    process.env.QA_UV_VERSION ?? '0.13.7',
  );
  assert.equal(state.profile, 'full');
  assert.ok(state.playwright_cli);
  assert.ok(state.playwright_mcp);
  assert.ok(state.agent_browser);
  assert.ok(state.cc_switch);

  qa(['run', 'codex', '--version']);
  qa(['run', 'bun', '--version']);
  qa(['run', 'pnpm', '--version']);
  qa(['run', 'playwright-cli', '--version']);
  qa(['run', 'agent-browser', '--version']);
  qa(['run', 'agent-browser', 'open', 'about:blank']);
  qa(['run', 'agent-browser', 'close']);

  qa(['run', 'codex', 'mcp', 'list', '--json']);

  const playwright = readMcpServerConfig(
    CONFIG,
    mcpName('playwright'),
  );
  assert.ok(playwright.command);
  assert.ok(playwright.args?.[0]);
  qa(['run', 'node', playwright.args[0], '--version']);
  assert.ok(playwright.args?.includes('--headless'));
  assert.ok(playwright.args?.includes('--isolated'));
  assert.ok((playwright.args?.indexOf('--browser') ?? -1) >= 0);
  assert.equal(playwright.args?.[playwright.args.indexOf('--browser') + 1], 'chromium');
  assert.ok(playwright.args?.includes(join(ROOT, 'mcp-output')));
  const agentBrowser = readMcpServerConfig(
    CONFIG,
    mcpName('agent-browser'),
  );
  assert.equal(agentBrowser.args?.at(-1), 'mcp');
  assert.equal(agentBrowser.args?.[1], '--session');
  assert.equal(agentBrowser.args?.[2], 'qa');
  assert.equal(
    agentBrowser.env?.AGENT_BROWSER_SOCKET_DIR,
    join(ROOT, 's'),
  );
  assert.ok(join(ROOT, 's', 'qa.sock').length <= 103);
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
    CONFIG,
    mcpName('faker'),
  );
  assert.ok(faker.command);
  assert.ok(faker.args?.some((arg) => arg.endsWith(join('faker-mcp-server', 'dist', 'index.js'))));
  const mcpLock = readJson<{ servers: Record<string, unknown> }>(
    MCP_LOCK,
  );
  assert.ok(mcpLock.servers[mcpName('faker')]);
  qa(['mcp', 'remove', 'faker']);
  assert.deepEqual(readMcpServerConfig(CONFIG, mcpName('faker')), {});
  const updatedMcpLock = readJson<{ servers: Record<string, unknown> }>(
    MCP_LOCK,
  );
  assert.equal(updatedMcpLock.servers[mcpName('faker')], undefined);

  assert.ok(!existsSync(join(ROOT, 'codex/skills/qa-core')));
  const legacy = join(ROOT, 'codex/skills/qa-python/SKILL.md');
  const lock = join(ROOT, 'codex/skills.lock.json');
  mkdirSync(dirname(legacy), { recursive: true });
  writeFileSync(legacy, 'preserve existing Skill', 'utf8');
  writeFileSync(lock, '{"schema":1,"skills":{"qa-python":{"scope":"environment"}}}', 'utf8');
  const before = readFileSync(lock);
  const repeat = spawnSync(launcher[0] as string, [...launcher.slice(1), 'env', 'init', 'both', '--full'], {
    cwd: REPO,
    env: process.env,
    encoding: 'utf8',
  });
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.doesNotMatch(repeat.stdout, /Installing missing global tool|Downloading CC Switch|Installing CC Switch into shared user directory/);
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
    qa(['project', 'uninstall', target], 1);
    assert.equal(readFileSync(notes, 'utf8'), 'must survive uninstall');
    assert.equal(readFileSync(rules, 'utf8'), 'preexisting project rules');
    assert.ok(existsSync(modified));
    assert.ok(existsSync(join(target, stack === 'python' ? '.venv' : 'node_modules')));
    assert.ok(existsSync(join(target, '.qa-project.json')));
  }

  const partial = join(REPO, 'workspaces/partial environment');
  mkdirSync(partial, { recursive: true });
  writeFileSync(join(partial, '.qa-managed'), 'qa-local-environment-v1');
  writeFileSync(join(partial, 'partial-download'), 'incomplete install');
  qa(['--root', partial, 'env', 'uninstall']);
  assert.equal(readFileSync(join(partial, 'partial-download'), 'utf8'), 'incomplete install');

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

/** Verifies environment uninstall removes only this root's MCP registrations. */
async function sharedUninstallCase(): Promise<void> {
  const environment = new Environment({ root: ROOT, env: process.env });
  const tools = [environment.bunBin, environment.pnpmBin, environment.codexBin, environment.playwrightCliBin, environment.agentBrowser];
  for (const tool of tools) assert.ok(tool && existsSync(tool), `missing global tool: ${tool}`);
  const names = ['qa', 'playwright', 'agent-browser'].map(mcpName);
  for (const name of names) assert.ok(readMcpServerConfig(CONFIG, name).command, name);
  const userRegistration = '\n[mcp_servers.user_owned]\ncommand = "user-command"\nargs = ["--keep"]\n';
  writeFileSync(CONFIG, readFileSync(CONFIG, 'utf8') + userRegistration);
  const userFile = join(ROOT, 'user-preserved.txt');
  writeFileSync(userFile, 'preserve environment files');
  qa(['env', 'uninstall']);
  assert.equal(readFileSync(userFile, 'utf8'), 'preserve environment files');
  for (const name of names) assert.deepEqual(readMcpServerConfig(CONFIG, name), {}, name);
  assert.deepEqual(readMcpServerConfig(CONFIG, 'user_owned'), { command: 'user-command', args: ['--keep'] });
  const lock = readJson<{ servers: Record<string, unknown> }>(MCP_LOCK);
  for (const name of names) assert.equal(lock.servers[name], undefined, name);
  for (const tool of tools) assert.ok(existsSync(tool), `global tool removed: ${tool}`);
}
const cases: Record<string, () => Promise<void>> = {
  env: environmentCase,
  project: projectCase,
  uninstall: uninstallCase,
  'shared-uninstall': sharedUninstallCase,
};

const selected = process.argv[2] as keyof typeof cases | undefined;
if (!selected || !cases[selected]) {
  throw new Error('Use one case: env, project, uninstall or shared-uninstall');
}
await cases[selected]();
