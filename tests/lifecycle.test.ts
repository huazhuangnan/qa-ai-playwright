import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'bun:test';

import {
  Environment,
  browserTemporaryEnvironment,
  detectCodexDesktop,
  type RunOptions,
} from '../packages/qa-cli/cli/environment.ts';
import {
  projectInit,
  projectUninstall,
} from '../packages/qa-cli/cli/project.ts';
import {
  authStatePath,
  configuredAuthRoles,
  normalizeAuthRole,
} from '../packages/templates/typescript/tests/auth/state.ts';
import {
  OWNER,
  REPO,
  WINDOWS,
  atomicJson,
  digest,
  removeOwned,
  templateVersion,
  readMcpServerConfig,
  within,
} from '../packages/qa-cli/cli/shared.ts';
import { execute, parseArgs, preserveSharedSoftware, verifiedGlobalPackage } from '../packages/qa-cli/qa-cli.ts';

test('environment repair uses recorded configuration and rejects overriding flags', () => {
  assert.equal(parseArgs(['env', 'repair']).action, 'repair');
  assert.throws(() => parseArgs(['env', 'repair', '--skip-codex']), /Unknown option/);
});

test('management commands retain their project and object arguments', () => {
  assert.equal(parseArgs(['project', 'upgrade', 'example']).action, 'upgrade');
  assert.equal(parseArgs(['project', 'repair', 'example']).target, 'example');
  assert.equal(parseArgs(['project', 'rollback', 'example', 'snapshot']).snapshotId, 'snapshot');
  assert.equal(parseArgs(['env', 'upgrade', 'uv']).action, 'upgrade');
  assert.equal(parseArgs(['env', 'rollback', 'snapshot']).snapshotId, 'snapshot');
  assert.throws(() => parseArgs(['env', 'upgrade', 'unknown']), /requires uv/);
  assert.equal(parseArgs(['mcp', 'check', 'faker']).mcpName, 'faker');
  const skill = parseArgs(['skills', 'check', 'example', 'qa-core']);
  assert.equal(skill.skillAction, 'check');
  assert.equal(skill.target, 'example');
  assert.equal(skill.skillName, 'qa-core');
  assert.throws(() => parseArgs(['mcp', 'list', 'extra']), /Unexpected/);
});

test('environment uninstall reports preserved registrations as incomplete', async () => {
  const environment = createEnvironment();
  const original = Environment.prototype.removeSharedMcpRegistrations;
  Environment.prototype.removeSharedMcpRegistrations = () => ({
    removed: [], absent: [], preserved: [{ name: 'qa-example', reason: 'modified' }], failed: [],
  });
  try {
    assert.equal(await execute({ command: 'env', action: 'uninstall', root: environment.root }), 1);
  } finally {
    Environment.prototype.removeSharedMcpRegistrations = original;
  }
});

const temporaryDirectories = new Set<string>();
process.once('exit', () => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** Creates a PATH directory outside the managed root with isolated tool placeholders. */
function createToolPath(
  base: string,
  names = ['bun', 'pnpm'],
  directory = 'global tools',
): string {
  const bin = join(base, directory);
  mkdirSync(bin, { recursive: true });
  for (const name of names) {
    const path = join(bin, WINDOWS ? `${name}.exe` : name);
    writeFileSync(path, `placeholder ${name}`);
    if (!WINDOWS) chmodSync(path, 0o755);
  }
  return bin;
}

/** Creates a managed environment plus placeholder managed Python. */
function createEnvironment(name = 'environment'): Environment {
  const base = createWorkspace();
  const bin = createToolPath(base);
  const environment = new Environment({
    root: join(base, name),
    env: { PATH: bin, CODEX_HOME: join(base, 'codex') },
  });
  environment.state.stack = 'both';
  environment.save();
  const python = join(environment.root, 'runtime/python/python');
  mkdirSync(join(environment.root, 'runtime/python'), { recursive: true });
  writeFileSync(python, 'test interpreter placeholder', 'utf8');
  const record = join(environment.root, 'bootstrap/python-path.txt');
  mkdirSync(join(environment.root, 'bootstrap'), { recursive: true });
  writeFileSync(record, python, 'utf8');
  mkdirSync(dirname(environment.node), { recursive: true });
  writeFileSync(environment.node, 'test node placeholder', 'utf8');
  return environment;
}
/** Creates a test workspace removed when the test exits. */
function createWorkspace(): string {
  const directory = mkdtempSync(join(tmpdir(), 'qa-lifecycle-'));
  temporaryDirectories.add(directory);
  return directory;
}

/** Captures console output until the original console methods are restored. */
function captureConsole(): { output: () => string; restore: () => void } {
  const output: string[] = [];
  const methods = ['log', 'warn', 'error'] as const;
  const originals = Object.fromEntries(
    methods.map((method) => [method, console[method]]),
  ) as Record<(typeof methods)[number], (...args: unknown[]) => void>;
  const capture = (...args: unknown[]) => {
    output.push(args.map((value) => String(value)).join(' '));
  };

  for (const method of methods) {
    console[method] = capture;
  }

  return {
    output: () => output.join('\n'),
    restore: () => {
      for (const method of methods) {
        console[method] = originals[method];
      }
    },
  };
}

class StubEnvironment extends Environment {
  readonly commands: string[][] = [];

  override run(
    command: readonly (string | number)[],
    options: RunOptions = {},
  ): string | undefined {
    const values = command.map(String);
    this.commands.push(values);
    if (!options.capture) {
      return undefined;
    }
    const executable = values[0] ?? '';
    if (executable.endsWith('python') || executable.endsWith('python.exe')) {
      return `Python ${this.pythonVersion}.0`;
    }
    if (executable.endsWith('node') || executable.endsWith('node.exe')) {
      return `v${this.nodeMajor}.13.0`;
    }
    if (executable.endsWith('uv') || executable.endsWith('uv.exe')) {
      return 'uv 0.8.0';
    }
    return '';
  }
}

test('unmanaged environment is refused without deleting user files', () => {
  const base = createWorkspace();
  const directory = join(base, 'unmanaged');
  mkdirSync(directory);
  const notes = join(directory, 'notes.txt');
  writeFileSync(notes, 'keep', 'utf8');

  assert.throws(
    () => new Environment({ root: directory, env: {} }),
    /Unmanaged environment directory/,
  );
  assert.equal(readFileSync(notes, 'utf8'), 'keep');
});

test('owned deletion cannot escape its root', () => {
  const environment = createEnvironment();
  const outside = join(environment.root, '..', 'keep.txt');
  writeFileSync(outside, 'keep', 'utf8');

  assert.throws(() => removeOwned(outside, environment.root), /unsafe deletion/i);
  assert.throws(() => removeOwned(environment.root, environment.root), /unsafe deletion/i);
  assert.equal(readFileSync(outside, 'utf8'), 'keep');
});

test('caches, browser state and credentials stay inside the environment', () => {
  const environment = createEnvironment();
  const variables = environment.variables();
  for (const key of [
    'npm_config_cache',
    'BUN_INSTALL_CACHE_DIR',
    'PNPM_HOME',
    'PIP_CACHE_DIR',
    'UV_CACHE_DIR',
    'PLAYWRIGHT_BROWSERS_PATH',
    'TEMP',
  ]) {
    const value = variables[key];
    assert.ok(value, key);
    assert.ok(within(value, environment.root), key);
  }
  assert.equal(variables.CODEX_HOME, dirname(environment.mcpConfig));
  assert.ok(
    (variables.PATH ?? '').split(delimiter).includes(dirname(environment.bunBin)),
  );
});

test('parses Windows Codex MCP TOML with mixed quoted paths', () => {
  const config = join(createWorkspace(), 'codex', 'config.toml');
  mkdirSync(dirname(config), { recursive: true });
  writeFileSync(
    config,
    `[mcp_servers.agent-browser]
command = 'D:\\qa env\\runtime\\node.exe'
args = ['D:\\qa env\\agent-browser.js', "--session", 'qa', "--args", "--disable-gpu,--no-sandbox", 'mcp']

[mcp_servers.agent-browser.env]
AGENT_BROWSER_SOCKET_DIR = 'D:\\qa env\\s'
TEMP = 'C:\\Users\\runner\\AppData\\Local\\Temp'

[[skills.config]]
path = 'C:\\Users\\runner\\skill\\SKILL.md'
`,
    'utf8',
  );

  assert.deepEqual(readMcpServerConfig(config, 'agent-browser'), {
    command: 'D:\\qa env\\runtime\\node.exe',
    args: [
      'D:\\qa env\\agent-browser.js',
      '--session',
      'qa',
      '--args',
      '--disable-gpu,--no-sandbox',
      'mcp',
    ],
    env: {
      AGENT_BROWSER_SOCKET_DIR: 'D:\\qa env\\s',
      TEMP: 'C:\\Users\\runner\\AppData\\Local\\Temp',
    },
  });
});

test('parses MCP TOML comments and brackets inside multiline arguments', () => {
  const config = join(createWorkspace(), 'config.toml');
  writeFileSync(config, `[mcp_servers."qa-playwright"]
command = 'node' # runtime
args = [
  'C:\\[qa]\\cli.js', # entry
  '--headless',
]
[mcp_servers."qa-playwright".env]
PLAYWRIGHT_BROWSERS_PATH = 'C:\\[qa]\\cache' # cache
[[skills.config]]
path = 'unrelated'
`);
  assert.deepEqual(readMcpServerConfig(config, 'qa-playwright'), {
    command: 'node',
    args: ['C:\\[qa]\\cli.js', '--headless'],
    env: { PLAYWRIGHT_BROWSERS_PATH: 'C:\\[qa]\\cache' },
  });
});

test('Node CLI runtime reads CRLF MCP settings before unrelated array tables', () => {
  const config = join(createWorkspace(), 'config.toml');
  const text = `[mcp_servers.qa]
command = 'bun'
args = ['qa-server.ts', '--root', 'qa env']
[mcp_servers.qa.env]
TEST_PATH = 'qa cache'
[[skills.config]]
path = 'unrelated'
`;
  writeFileSync(config, text.replaceAll('\n', '\r\n'));
  const moduleUrl = pathToFileURL(join(REPO, 'packages/qa-cli/cli/shared.ts')).href;
  const script = `import { readMcpServerConfig } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(readMcpServerConfig(${JSON.stringify(config)}, 'qa')));`;
  const result = spawnSync(process.env.QA_NODE_PATH || 'node', ['--experimental-strip-types', '--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    command: 'bun',
    args: ['qa-server.ts', '--root', 'qa env'],
    env: { TEST_PATH: 'qa cache' },
  });
}, 15000);
test('discovered shared tools require matching QA ownership records', () => {
  const base = createWorkspace();
  const bin = createToolPath(base, ['bun', 'pnpm']);
  const environment = new Environment({
    root: join(base, 'environment'),
    env: { PATH: bin },
  });
  const bun = join(bin, WINDOWS ? 'bun.exe' : 'bun');
  const pnpm = join(bin, WINDOWS ? 'pnpm.exe' : 'pnpm');
  environment.state.installations = {
    bun: { status: 'ready', source: 'qa', path: bun, version: '1.0.0' },
    pnpm: { status: 'ready', source: 'reused', path: pnpm, version: '9.0.0' },
  };
  const tools = environment.listDiscoveredTools();
  assert.equal(tools.find((tool) => tool.name === 'bun')?.source, 'qa');
  assert.equal(tools.find((tool) => tool.name === 'pnpm')?.source, 'unknown');

  environment.state.installations = {
    bun: { status: 'ready', source: 'qa', path: join(base, 'old bun'), version: '1.0.0' },
  };
  assert.equal(
    environment.listDiscoveredTools().find((tool) => tool.name === 'bun')?.source,
    'unknown',
  );
});
test('PATH discovery reuses existing package managers even with different versions', async () => {
  const base = createWorkspace();
  const bin = createToolPath(base, ['bun', 'pnpm', 'codex', 'playwright-cli', 'agent-browser', 'cc-switch']);
  const environment = new class extends StubEnvironment {
    override run(command: readonly (string | number)[], options: RunOptions = {}): string | undefined {
      const result = super.run(command, options);
      if (options.capture && command[0] === this.bunBin) return '1.0.0';
      if (options.capture && command[0] === this.pnpmBin) return '9.0.0';
      return result;
    }
  }({ root: join(base, 'environment'), env: { PATH: bin } });
  environment.save();
  assert.equal(environment.bunBin, join(bin, WINDOWS ? 'bun.exe' : 'bun'));
  assert.equal(environment.pnpmBin, join(bin, WINDOWS ? 'pnpm.exe' : 'pnpm'));
  assert.equal(environment.codexBin, join(bin, WINDOWS ? 'codex.exe' : 'codex'));
  assert.equal(environment.playwrightCliBin, join(bin, WINDOWS ? 'playwright-cli.exe' : 'playwright-cli'));
  assert.equal(environment.agentBrowser, join(bin, WINDOWS ? 'agent-browser.exe' : 'agent-browser'));
  assert.deepEqual(await environment.ensurePackageManagers(), { bun: '1.0.0', pnpm: '9.0.0' });
  const records = JSON.parse(readFileSync(environment.stateFile, 'utf8')).installations;
  assert.equal(records.bun.source, 'reused');
  assert.equal(records.bun.path, environment.bunBin);
  assert.equal(records.pnpm.source, 'reused');
  assert.equal(await environment.ensureCcSwitch(), 'unknown');
  assert.ok(!environment.commands.some((command) => command.includes('install')));
  for (const name of ['bun', 'pnpm', 'codex', 'playwright-cli', 'agent-browser', 'cc-switch']) {
    assert.equal(readFileSync(join(bin, WINDOWS ? `${name}.exe` : name), 'utf8'), `placeholder ${name}`);
  }
});

test('existing global browser tools keep their installed versions', async () => {
  const base = createWorkspace();
  const bin = createToolPath(base, ['playwright-cli', 'agent-browser']);
  const packages = WINDOWS ? join(bin, 'node_modules') : join(bin, '..', 'lib', 'node_modules');
  for (const [name, version] of [['@playwright/cli', '0.0.1'], ['agent-browser', '0.0.2']] as const) {
    const directory = join(packages, name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, version }));
  }
  const environment = new StubEnvironment({ root: join(base, 'environment'), env: { PATH: bin } });
  assert.equal(await environment.ensurePlaywrightCli(), '0.0.1');
  assert.equal(await environment.ensureAgentBrowser(), '0.0.2');
  assert.ok(!environment.commands.some((command) => command.includes('install')));
  assert.equal(JSON.parse(readFileSync(join(packages, '@playwright/cli/package.json'), 'utf8')).version, '0.0.1');
  assert.equal(JSON.parse(readFileSync(join(packages, 'agent-browser/package.json'), 'utf8')).version, '0.0.2');
});
test('a missing package manager is installed once using the discovered global npm', async () => {
  const base = createWorkspace();
  const bin = createToolPath(
    base,
    ['npm', 'bun'],
    WINDOWS ? 'global tools' : 'npm-prefix/bin',
  );
  const pnpm = join(bin, WINDOWS ? 'pnpm.exe' : 'pnpm');
  const prefix = WINDOWS ? bin : join(base, 'npm-prefix');
  const environment = new class extends StubEnvironment {
    override run(command: readonly (string | number)[], options: RunOptions = {}): string | undefined {
      const result = super.run(command, options);
      if (command.includes('prefix')) return prefix;
      if (command.includes('install') && command.includes('--global')) {
        writeFileSync(pnpm, 'installed pnpm');
        if (!WINDOWS) chmodSync(pnpm, 0o755);
      }
      if (options.capture && command[0] === this.bunBin) return '1.0.0';
      if (options.capture && command[0] === this.pnpmBin) return '9.0.0';
      return result;
    }
  }({ root: join(base, 'environment'), env: { PATH: bin } });
  environment.save();
  assert.deepEqual(await environment.ensurePackageManagers(), { bun: '1.0.0', pnpm: '9.0.0' });
  const installed = JSON.parse(readFileSync(environment.stateFile, 'utf8')).installations;
  assert.equal(installed.pnpm.source, 'qa');
  assert.equal(installed.pnpm.path, pnpm);
  assert.equal(installed.pnpm.version, '9.0.0');
  assert.deepEqual(await environment.ensurePackageManagers(), { bun: '1.0.0', pnpm: '9.0.0' });
  const installs = environment.commands.filter((command) => command.includes('install') && command.includes('--global'));
  assert.equal(installs.length, 1);
  assert.ok(installs[0]?.includes(`pnpm@${environment.pnpmVersion}`));
  assert.equal(readFileSync(pnpm, 'utf8'), 'installed pnpm');
  const records = JSON.parse(readFileSync(environment.stateFile, 'utf8')).installations;
  assert.equal(records.pnpm.source, 'qa');
});
test('an existing user package without its command shim is never reinstalled', async () => {
  const base = createWorkspace();
  const bin = createToolPath(base, ['npm', 'bun']);
  const prefix = WINDOWS ? bin : dirname(bin);
  const packageDir = WINDOWS
    ? join(prefix, 'node_modules', 'pnpm')
    : join(prefix, 'lib', 'node_modules', 'pnpm');
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'pnpm', version: '9.0.0' }));
  const environment = new class extends StubEnvironment {
    override run(command: readonly (string | number)[], options: RunOptions = {}): string | undefined {
      if (command.includes('prefix')) return prefix;
      if (options.capture && command[0] === this.bunBin) return '1.0.0';
      return super.run(command, options);
    }
  }({ root: join(base, 'environment'), env: { PATH: bin } });
  environment.save();
  await assert.rejects(() => environment.ensurePackageManagers(), /Global Bun or pnpm is not discoverable/);
  assert.ok(!environment.commands.some((command) => command.includes('install') && command.includes('--global')));
  assert.deepEqual(JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')), {
    name: 'pnpm',
    version: '9.0.0',
  });
});

test('an interrupted global installation is recorded without claiming ownership', async () => {
  const base = createWorkspace();
  const bin = createToolPath(
    base,
    ['npm', 'bun'],
    WINDOWS ? 'global tools' : 'npm-prefix/bin',
  );
  const prefix = WINDOWS ? bin : join(base, 'npm-prefix');
  const environment = new class extends StubEnvironment {
    override run(command: readonly (string | number)[], options: RunOptions = {}): string | undefined {
      if (command.includes('prefix')) return prefix;
      if (command.includes('install') && command.includes('--global')) throw new Error('installation interrupted');
      return super.run(command, options);
    }
  }({ root: join(base, 'environment'), env: { PATH: bin } });
  await assert.rejects(environment.ensurePackageManagers(), /installation interrupted/);
  const record = JSON.parse(readFileSync(environment.stateFile, 'utf8')).installations.pnpm;
  assert.equal(record.status, 'pending');
  assert.equal(record.source, 'unknown');
  assert.equal(record.npm_bin, bin);
});

test('failed initialization retains recovery options and blocks project use', async () => {
  const base = createWorkspace();
  const environment = new class extends StubEnvironment {
    override async ensureNode(): Promise<string> { throw new Error('node unavailable'); }
  }({ root: join(base, 'environment'), env: { PATH: '' } });
  environment.state.stack = 'typescript';
  await assert.rejects(environment.init({ stack: 'typescript', profile: 'standard', skipCodex: true, skipSkills: true }), /node unavailable/);
  const state = JSON.parse(readFileSync(environment.stateFile, 'utf8'));
  assert.equal(state.init_status, 'initializing');
  assert.equal(state.init_options.skipCcSwitch, false);
  assert.throws(() => environment.requireInitialized('typescript'), /initialization is incomplete/);
});

test('CC Switch is prepared by default and can be skipped', async () => {
  const base = createWorkspace();
  class InitEnvironment extends StubEnvironment {
    ccCalls = 0;
    override async ensureNode(): Promise<string> { return 'v22.18.0'; }
    override async ensurePackageManagers(): Promise<{ bun: string; pnpm: string }> { return { bun: '1.0.0', pnpm: '9.0.0' }; }
    override async ensureCcSwitch(): Promise<string> { this.ccCalls++; return 'unknown'; }
    override activate(): void { /* The test only checks initialization choices. */ }
  }
  const options = { stack: 'typescript' as const, profile: 'standard' as const, skipCodex: true, skipSkills: true };
  const standard = new InitEnvironment({ root: join(base, 'standard'), env: { PATH: '' } });
  await standard.init(options);
  assert.equal(standard.ccCalls, 1);
  assert.equal((standard.state.components as { cc_switch: boolean }).cc_switch, true);
  const skipped = new InitEnvironment({ root: join(base, 'skip-cc'), env: { PATH: '' } });
  await skipped.init({ ...options, skipCcSwitch: true });
  assert.equal(skipped.ccCalls, 0);
  assert.equal((skipped.state.components as { cc_switch: boolean }).cc_switch, false);
});

test('initializing another language retains both project languages', async () => {
  const base = createWorkspace();
  class LanguageEnvironment extends StubEnvironment {
    override async ensureNode(): Promise<string> { return 'v22.18.0'; }
    override async ensurePackageManagers(): Promise<{ bun: string; pnpm: string }> { return { bun: '1.0.0', pnpm: '9.0.0' }; }
    override async ensurePython(): Promise<string> { return 'python'; }
    override activate(): void { /* No shell activation is needed for this test. */ }
  }
  const environment = new LanguageEnvironment({ root: join(base, 'env'), env: { PATH: '' } });
  const options = { profile: 'standard' as const, skipCodex: true, skipSkills: true, skipCcSwitch: true };
  await environment.init({ ...options, stack: 'typescript' });
  await assert.rejects(environment.init({ ...options, stack: 'invalid' as 'python' }), /Invalid stack/);
  await environment.init({ ...options, stack: 'python' });
  assert.equal(environment.state.stack, 'both');
});

test('desktop detection distinguishes a confirmed Store app from unknown status', () => {
  assert.equal(detectCodexDesktop('win32', () => ({ status: 0, stdout: '9PLM9XGG6VKS' })), 'installed');
  assert.equal(detectCodexDesktop('win32', () => ({ status: 1, stdout: '' })), 'unknown');
  assert.equal(detectCodexDesktop('darwin', () => { throw new Error('unexpected lookup'); }), 'unknown');
});

test('full mode without Codex reuses or installs an isolated browser', async () => {
  const base = createWorkspace();
  const bin = createToolPath(base, ['playwright-cli']);
  class FullEnvironment extends StubEnvironment {
    browser?: { channel: 'chrome' | 'chromium'; path: string; scope: 'system-or-user' | 'environment' };
    override async ensureNode(): Promise<string> { return 'v22.18.0'; }
    override async ensurePackageManagers(): Promise<{ bun: string; pnpm: string }> { return { bun: '1.0.0', pnpm: '9.0.0' }; }
    override async ensurePlaywrightCli(): Promise<string> { return '0.1.24'; }
    override async ensureAgentBrowser(): Promise<string> { return '0.42.0'; }
    override findBrowser(): typeof this.browser { return this.browser; }
    override activate(): void { /* Initialization behavior is tested without activating a shell. */ }
    override run(command: readonly (string | number)[], options: RunOptions = {}): string | undefined {
      if (command.includes('install-browser')) this.browser = { channel: 'chromium', path: join(this.root, 'cache', 'browsers', 'chromium', 'chrome'), scope: 'environment' };
      return super.run(command, options);
    }
  }
  const options = { stack: 'typescript' as const, profile: 'full' as const, skipCodex: true, skipSkills: false, skipCcSwitch: true };
  const reused = new FullEnvironment({ root: join(base, 'reuse'), env: { PATH: bin } });
  reused.browser = { channel: 'chrome', path: join(base, 'existing chrome'), scope: 'system-or-user' };
  await reused.init(options);
  assert.ok(!reused.commands.some((command) => command.includes('install-browser')));
  assert.equal((reused.state.installations as Record<string, { source: string }>).chrome?.source, 'reused');
  const installed = new FullEnvironment({ root: join(base, 'install'), env: { PATH: bin } });
  await installed.init(options);
  assert.ok(installed.commands.some((command) => command.includes('install-browser') && command.includes('chromium')));
  assert.equal((installed.state.installations as Record<string, { source: string }>).chromium?.source, 'qa');
  const invalid = new FullEnvironment({ root: join(base, 'invalid'), env: { PATH: bin, QA_BROWSER_CHANNEL: 'msedge' } });
  await assert.rejects(invalid.init(options), /Requested browser channel or executable/);
  assert.ok(!invalid.commands.some((command) => command.includes('install-browser')));
});

test('CC Switch published without ownership metadata is preserved for inspection', async () => {
  const base = createWorkspace();
  const environment = new StubEnvironment({ root: join(base, 'environment'), env: { PATH: '', LOCALAPPDATA: join(base, 'user'), XDG_DATA_HOME: join(base, 'user') } });
  // macOS has a fixed home directory in the implementation; do not write there.
  if (process.platform === 'darwin') return;
  const payload = join(environment.ccSwitchDir, 'payload');
  mkdirSync(payload, { recursive: true });
  writeFileSync(join(payload, WINDOWS ? 'cc-switch.exe' : 'cc-switch.AppImage'), 'incomplete');
  writeFileSync(join(environment.ccSwitchDir, '.qa-cc-switch-pending.json'), '{}');
  await assert.rejects(environment.ensureCcSwitch(), /interrupted after publication/);
  assert.ok(existsSync(payload));
});

test('checking a fresh environment does not create its directory', () => {
  const base = createWorkspace();
  const root = join(base, 'environment with spaces');
  const environment = new Environment({
    root,
    env: { ...process.env, npm_config_cache: join(base, 'npm-cache') },
  });
  environment.check({ stack: 'both', profile: 'full', skipCodex: false, skipSkills: false });
  assert.equal(existsSync(root), false);
}, 30000);

test('PATH discovery ignores a non-executable Unix file', () => {
  if (WINDOWS) return;
  const base = createWorkspace();
  const bin = createToolPath(base, ['pnpm']);
  chmodSync(join(bin, 'pnpm'), 0o644);
  const environment = new Environment({ root: join(base, 'environment'), env: { PATH: bin } });
  assert.equal(environment.pnpmBin, '');
});
test('PATH-discovered executable runs with its version argument', () => {
  const base = createWorkspace();
  const bin = join(base, 'global tools');
  mkdirSync(bin, { recursive: true });
  const executable = join(bin, WINDOWS ? 'pnpm.cmd' : 'pnpm');
  writeFileSync(executable, WINDOWS ? '@echo off\r\necho 9.0.0\r\n' : '#!/bin/sh\nprintf "9.0.0\\n"\n');
  if (!WINDOWS) chmodSync(executable, 0o755);
  const environment = new Environment({
    root: join(base, 'environment'),
    env: { PATH: bin, ComSpec: process.env.ComSpec, SystemRoot: process.env.SystemRoot },
  });
  assert.equal(environment.pnpmBin, executable);
  assert.equal(environment.pnpm(['--version'], { capture: true }), '9.0.0');
});

test('browser test runners use the host temporary directory', () => {
  const environment = createEnvironment();
  const observed: RunOptions[] = [];
  const stub = new class extends StubEnvironment {
    override run(
      command: readonly (string | number)[],
      options: RunOptions = {},
    ): string | undefined {
      observed.push(options);
      return super.run(command, options);
    }
  }({ root: environment.root, env: {} });
  const expected = browserTemporaryEnvironment();
  stub.playwright(environment.root, 'test');
  assert.deepEqual(observed.at(-1)?.env, expected);
  assert.ok(!within(String(expected.TEMP), environment.root));
});

test('MCP registration preserves a conflicting user configuration', () => {
  const environment = new StubEnvironment({
    root: join(createWorkspace(), 'environment'),
    env: {},
  });
  const config = join(createWorkspace(), 'user codex', 'config.toml');
  Object.defineProperty(environment, 'mcpConfig', { value: config });
  mkdirSync(dirname(config), { recursive: true });
  const name = 'qa-playwright';
  const original = `[mcp_servers.${name}]\ncommand = "user-playwright"\nargs = ["--custom"]\n`;
  writeFileSync(config, original);

  assert.throws(() => environment.registerMcp(
    'playwright',
    { command: 'qa-playwright', args: ['--isolated'] },
    'external',
    '0.0.85',
  ), /already exists|conflict/i);
  assert.equal(readFileSync(config, 'utf8'), original);
  assert.ok(!environment.commands.some((command) => command.includes('add') || command.includes('remove')));
});
test('uninstall preserves an unowned user MCP registration', () => {
  const environment = new StubEnvironment({
    root: join(createWorkspace(), 'environment'),
    env: {},
  });
  environment.save();
  const config = join(createWorkspace(), 'user codex', 'config.toml');
  Object.defineProperty(environment, 'mcpConfig', { value: config });
  mkdirSync(dirname(config), { recursive: true });
  const name = 'qa-faker';
  const original = `[mcp_servers.${name}]\ncommand = "user-faker"\n`;
  writeFileSync(config, original);

  assert.throws(() => environment.removeOptionalMcp('faker'), /no matching QA installation record/);
  assert.equal(readFileSync(config, 'utf8'), original);
  assert.ok(!environment.commands.some((command) => command.includes('remove') || command.includes('uninstall')));
});
test('environment check rejects a stale uv executable', () => {
  const managed = createEnvironment();
  const environment = new StubEnvironment({
    root: managed.root,
    env: {},
  });
  mkdirSync(dirname(environment.uv), { recursive: true });
  writeFileSync(environment.uv, 'stale uv placeholder', 'utf8');
  const capture = captureConsole();
  try {
    assert.equal(
      environment.check({
        stack: 'python',
        profile: 'standard',
        skipCodex: true,
        skipSkills: true,
      }),
      1,
    );
  } finally {
    capture.restore();
  }
  assert.match(capture.output(), /"uv@0\.13\.7"/);
});

test('template version validation rejects incomplete semantic versions', () => {
  const directory = createWorkspace();
  const versionFile = join(directory, 'VERSION');
  writeFileSync(versionFile, '1.2.3\n', 'utf8');
  assert.equal(templateVersion(directory), '1.2.3');
  writeFileSync(versionFile, '1.2\n', 'utf8');
  assert.throws(() => templateVersion(directory), /Invalid template version/);
});

test('pre-release repository versions stay fixed at 0.0.1', () => {
  const packageJson = JSON.parse(
    readFileSync(join(REPO, 'package.json'), 'utf8'),
  ) as { name: string; version: string };
  assert.equal(packageJson.name, 'qa-ai-playwright');
  assert.equal(packageJson.version, '0.0.1');
  assert.match(
    readFileSync(join(REPO, 'packages/qa-cli/runtime-versions.env'), 'utf8'),
    /^QA_UV_VERSION=\d+\.\d+\.\d+$/mu,
  );
  assert.match(
    readFileSync(join(REPO, 'packages/qa-cli/runtime-versions.env'), 'utf8'),
    /^QA_BUN_VERSION=\d+\.\d+\.\d+$/mu,
  );
  assert.match(
    readFileSync(join(REPO, 'packages/qa-cli/runtime-versions.env'), 'utf8'),
    /^QA_PNPM_VERSION=\d+\.\d+\.\d+$/mu,
  );

  for (const name of readdirSync(join(REPO, 'packages/skills/builtin'))) {
    const skill = readFileSync(
      join(REPO, 'packages/skills/builtin', name, 'SKILL.md'),
      'utf8',
    );
    assert.match(skill, /^  version: "0\.0\.1"$/m, name);
  }
  assert.match(
    readFileSync(
      join(REPO, '.agents/skills/repo-maintainer/SKILL.md'),
      'utf8',
    ),
    /^  version: "0\.0\.1"$/m,
  );
  for (const stack of ['qa', 'python', 'typescript']) {
    assert.equal(
      readFileSync(join(REPO, 'packages/templates', stack, 'VERSION'), 'utf8').trim(),
      '0.0.1',
      stack,
    );
  }
});

test('workspace keeps the CLI package and example projects in separate roots', () => {
  const workspace = REPO;
  assert.ok(existsSync(join(REPO, 'packages/qa-cli/bin/qa.sh')));
  assert.ok(existsSync(join(REPO, 'apps/qa-ticket-app/package.json')));
  assert.ok(existsSync(join(REPO, 'apps/qa-ticket-app-suite-typescript/package.json')));
  assert.ok(existsSync(join(REPO, 'apps/qa-ticket-app-suite-python/requirements.in')));
  assert.ok(existsSync(join(REPO, 'apps/qa-ticket-app/docs/qa/generated/test-cases.md')));
  assert.equal(REPO, workspace);
});

test('QA skills keep token-aware references and documented behavior cases', () => {
  const core = readFileSync(
    join(REPO, 'packages/skills/builtin/qa-core/SKILL.md'),
    'utf8',
  );
  const setup = readFileSync(
    join(REPO, 'packages/skills/builtin/qa-setup/SKILL.md'),
    'utf8',
  );
  assert.ok(core.length < 4000, 'qa-core entry must stay compact');
  assert.ok(setup.length < 4000, 'qa-setup entry must stay compact');
  assert.doesNotMatch(setup, /\.qa-env/);

  for (const relativePath of [
    'packages/skills/builtin/qa-core/references/business-guide.md',
    'packages/skills/builtin/qa-core/references/test-design.md',
    'packages/skills/builtin/qa-core/references/api-testing.md',
    'packages/skills/builtin/qa-core/references/web-testing.md',
    'packages/skills/builtin/qa-core/references/triage.md',
    'packages/skills/builtin/qa-core/references/documents.md',
    'packages/skills/builtin/qa-core/references/generated-code-quality.md',
    'packages/skills/builtin/qa-core/references/link-routing.md',
    'packages/skills/builtin/qa-core/references/project-discovery.md',
    'packages/skills/builtin/qa-core/references/test-design/universal-baseline.md',
    'packages/skills/builtin/qa-core/references/test-design/feature-patterns.md',
    'packages/skills/builtin/qa-core/references/automation/typescript.md',
    'packages/skills/builtin/qa-core/references/automation/typescript-recipes.md',
    'packages/skills/builtin/qa-core/references/automation/python.md',
    'packages/skills/builtin/qa-core/references/automation/python-recipes.md',
    'docs/users/test-design.zh-CN.md',
  ]) {
    assert.ok(existsSync(join(REPO, relativePath)), relativePath);
  }
  assert.deepEqual(
    readdirSync(join(REPO, 'packages/skills/builtin')).sort(),
    ['qa-core', 'qa-setup'],
  );

  const scenarios = JSON.parse(
    readFileSync(join(REPO, 'tests/skill-cases/scenarios.json'), 'utf8'),
  ) as { cases: Array<{ id: string }> };
  const scenarioIds = new Set(scenarios.cases.map(({ id }) => id));
  for (const id of [
    'scenario-catalog-requires-judgment',
    'maintainable-generated-flow',
    'source-driven-auto-test',
    'performance-vitals-boundary',
  ]) {
    assert.ok(scenarioIds.has(id), id);
  }

  assert.match(
    readFileSync(join(REPO, 'packages/skills/builtin/qa-core/references/test-design.md'), 'utf8'),
    /默认输出 5 至 10 个高价值场景/,
  );
  assert.match(
    readFileSync(join(REPO, 'packages/templates/qa/generated/test-cases.md'), 'utf8'),
    /资料依据 \/ 适用理由/,
  );
});

test('both language templates keep real environment files ignored', () => {
  for (const stack of ['python', 'typescript']) {
    const template = join(REPO, 'packages/templates', stack);
    assert.ok(existsSync(join(template, '.env.example')));
    assert.ok(!existsSync(join(template, '.env')));
    assert.ok(!existsSync(join(template, '.env.dev')));
    assert.ok(!existsSync(join(template, '.env.stg')));
    const ignoreFile = readFileSync(join(template, '.gitignore'), 'utf8');
    assert.match(ignoreFile, /\.env/);
    assert.match(ignoreFile, /!\.env\.\*\.example/);
    assert.match(ignoreFile, /playwright\/\.auth/);
    assert.match(readFileSync(join(template, '.env.example'), 'utf8'), /QA_ENV=dev/);
    assert.match(readFileSync(join(template, '.env.dev.example'), 'utf8'), /UI_BASE_URL=/);
    assert.match(readFileSync(join(template, '.env.dev.example'), 'utf8'), /API_BASE_URL=/);
    assert.match(readFileSync(join(template, '.env.dev.example'), 'utf8'), /QA_AUTH_ROLES=/);
    assert.match(readFileSync(join(template, '.env.stg.example'), 'utf8'), /UI_BASE_URL=/);
    assert.match(readFileSync(join(template, '.env.stg.example'), 'utf8'), /API_BASE_URL=/);
    assert.match(readFileSync(join(template, '.env.stg.example'), 'utf8'), /QA_AUTH_ROLES=/);
    assert.doesNotMatch(readFileSync(join(template, '.env.dev.example'), 'utf8'), /\bBASE_URL\b/);
    assert.doesNotMatch(readFileSync(join(template, '.env.stg.example'), 'utf8'), /\bBASE_URL\b/);
  }
  assert.ok(existsSync(join(REPO, 'packages/templates/python/conftest.py')));
});

test('language templates are versioned with lock and fixture support', () => {
  for (const stack of ['python', 'typescript']) {
    const template = join(REPO, 'packages/templates', stack);
    assert.match(readFileSync(join(template, 'VERSION'), 'utf8').trim(), /^\d+\.\d+\.\d+$/);
    assert.ok(existsSync(join(template, 'CHANGELOG.md')));
  }

  const packageJson = JSON.parse(
    readFileSync(join(REPO, 'packages/templates/typescript/package.json'), 'utf8'),
  ) as {
    engines: { node: string };
    devDependencies: Record<string, string>;
  };
  assert.equal(packageJson.engines.node, '>=22');
  assert.ok(!Object.values(packageJson.devDependencies).includes('latest'));
  const playwrightConfig = readFileSync(
    join(REPO, 'packages/templates/typescript/playwright.config.ts'),
    'utf8',
  );
  assert.match(playwrightConfig, /failOnFlakyTests/);
  assert.match(playwrightConfig, /QA_AUTH_STATE/);
  assert.match(playwrightConfig, /auth-setup/);
  assert.match(playwrightConfig, /dependencies: \['auth-setup'\]/);
  assert.match(playwrightConfig, /UI_BASE_URL/);
  assert.match(playwrightConfig, /API_BASE_URL/);
  assert.doesNotMatch(playwrightConfig, /\bBASE_URL\b/);
  assert.match(playwrightConfig, /PLAYWRIGHT_WEB_SERVER_COMMAND/);
  assert.ok(existsSync(join(REPO, 'packages/templates/typescript/scripts/check_lock.ts')));
  assert.ok(existsSync(join(REPO, 'packages/templates/typescript/pnpm-lock.yaml')));
  assert.ok(existsSync(join(REPO, 'packages/templates/typescript/tests/fixtures/qa.ts')));
  assert.ok(existsSync(join(REPO, 'packages/templates/typescript/tests/auth.setup.ts')));
  assert.ok(existsSync(join(REPO, 'packages/templates/typescript/tests/auth/state.ts')));
  assert.ok(existsSync(join(REPO, 'packages/templates/python/requirements.in')));
  assert.ok(existsSync(join(REPO, 'packages/templates/python/scripts/check_lock.py')));
  assert.ok(existsSync(join(REPO, 'packages/templates/python/scripts/auth_state.py')));
  assert.ok(existsSync(join(REPO, 'packages/templates/python/tests/fixtures/qa.py')));
  assert.ok(existsSync(join(REPO, 'packages/templates/python/tests/fixtures/auth.py')));
});

test('auth role helpers isolate state paths and role names', () => {
  assert.deepEqual(
    configuredAuthRoles({ QA_AUTH_ROLES: 'admin,user,admin' }),
    ['admin', 'user'],
  );
  assert.equal(
    authStatePath('admin', {}, '/project'),
    resolve('/project', 'playwright/.auth/admin.json'),
  );
  assert.throws(() => normalizeAuthRole('../admin'), /Invalid QA auth role/);
});

test('Codex CLI manifest records its npm source and executable', () => {
  const manifest = JSON.parse(readFileSync(join(REPO, 'packages/apps/codex/manifest.json'), 'utf8')) as Record<string, unknown>;
  assert.equal(manifest.id, 'codex');
  assert.equal(manifest.package, '@openai/codex');
  assert.equal(manifest.executable, 'codex');
  assert.equal(manifest.version_policy, 'installed-or-latest');
});
test('CC Switch manifest keeps a pinned release and verified portable assets', () => {
  const manifest = JSON.parse(
    readFileSync(join(REPO, 'packages/apps/cc-switch/manifest.json'), 'utf8'),
  ) as {
    commit: string;
    version: string;
    scope: string;
    assets: { platform: string; arch: string; sha256: string }[];
  };
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/u);
  assert.match(manifest.commit, /^[a-f0-9]{40}$/);
  assert.equal(manifest.scope, 'environment');
  assert.equal(manifest.assets.length, 5);
  assert.match(
    readFileSync(join(REPO, 'packages/qa-cli/runtime-versions.env'), 'utf8'),
    new RegExp(`^QA_CC_SWITCH_VERSION=${manifest.version.replaceAll('.', '\\.')}$`, 'mu'),
  );
  for (const asset of manifest.assets) {
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  }
});

test('generated documentation excludes directory introduction files', () => {
  for (const relativePath of [
    'README.md',
    'generated/README.md',
    'inputs/README.md',
    'tasks/README.md',
  ]) {
    assert.ok(
      !existsSync(join(REPO, 'packages/templates/qa', relativePath)),
      relativePath,
    );
  }
  const inputIndex = readFileSync(
    join(REPO, 'packages/templates/qa/inputs/input-index.md'),
    'utf8',
  );
  assert.match(inputIndex, /环境变量登记/);
  assert.match(inputIndex, /UI_BASE_URL/);
  assert.match(inputIndex, /API_BASE_URL/);
  const skillDocs = readFileSync(
    join(REPO, 'docs/users/skills-mcp.zh-CN.md'),
    'utf8',
  );
  assert.match(skillDocs, /`\/skills`/);
  assert.match(skillDocs, /\$qa-core/);
  assert.match(skillDocs, /根据任务读取需要的参考/);
});

test('generated CI workflows expose safety and API gates', () => {
  for (const stack of ['python', 'typescript']) {
    const workflow = readFileSync(
      join(REPO, 'packages/templates', stack, '.github/workflows/qa.yml'),
      'utf8',
    );
    assert.match(workflow, /permissions:/);
    assert.match(workflow, /concurrency:/);
    assert.match(workflow, /timeout-minutes:/);
    assert.match(workflow, /workflow_dispatch:/);
    assert.doesNotMatch(workflow, /schedule:/);
    assert.match(workflow, /quick:/);
    assert.match(workflow, /full:/);
    assert.match(workflow, /QA_UI_BASE_URL/);
    assert.match(workflow, /QA_API_BASE_URL/);
    assert.match(workflow, /QA_AUTH_ROLES/);
    assert.match(workflow, /secrets\.QA_AUTH_ADMIN_PASSWORD/);
    assert.match(workflow, /environment:/);
    assert.match(workflow, /REQUIRE_API_TESTS/);
    assert.match(workflow, /check(?::|_)lock/);
  }
  const typescriptWorkflow = readFileSync(
    join(REPO, 'packages/templates/typescript/.github/workflows/qa.yml'),
    'utf8',
  );
  assert.match(typescriptWorkflow, /pnpm\/action-setup@v4/);
  assert.match(typescriptWorkflow, /actions\/setup-node@v7/);
  assert.match(typescriptWorkflow, /oven-sh\/setup-bun@v2/);
  assert.match(typescriptWorkflow, /pnpm install --frozen-lockfile/);
  assert.match(
    readFileSync(
      join(REPO, 'packages/templates/python/.github/workflows/qa.yml'),
      'utf8',
    ),
    /actions\/setup-python@v6/,
  );
  assert.match(
    readFileSync(
      join(REPO, 'packages/templates/python/.github/workflows/qa.yml'),
      'utf8',
    ),
    /auth_state\.py/,
  );
  assert.match(
    readFileSync(
      join(REPO, 'packages/templates/python/.github/workflows/qa.yml'),
      'utf8',
    ),
    /pip install --require-hashes -r requirements\.lock/u,
  );
});

test('repository and template workflows pin runner images', () => {
  const rootWorkflows = join(REPO, '.github/workflows');
  const workflowFiles = [
    ...readdirSync(rootWorkflows)
      .filter((name) => name.endsWith('.yml'))
      .map((name) => join(rootWorkflows, name)),
    join(REPO, 'packages/templates/typescript/.github/workflows/qa.yml'),
    join(REPO, 'packages/templates/python/.github/workflows/qa.yml'),
  ];
  for (const file of workflowFiles) {
    const workflow = readFileSync(file, 'utf8');
    assert.doesNotMatch(
      workflow,
      /\b(?:ubuntu|windows|macos)-latest\b/u,
      file,
    );
    assert.doesNotMatch(workflow, /ubuntu:latest/u, file);
  }
});

test('project uninstall preserves user changes and initialized documentation', async () => {
  const base = createWorkspace();
  const environment = new StubEnvironment({
    root: join(base, 'environment'),
    env: { PATH: createToolPath(base) },
  });
  environment.state.stack = 'python';
  environment.save();
  assert.ok(existsSync(environment.marker));
  const python = join(environment.root, 'runtime/python/python');
  mkdirSync(join(environment.root, 'runtime/python'), { recursive: true });
  writeFileSync(python, 'test interpreter placeholder', 'utf8');
  mkdirSync(join(environment.root, 'bootstrap'), { recursive: true });
  writeFileSync(
    join(environment.root, 'bootstrap/python-path.txt'),
    python,
    'utf8',
  );
  mkdirSync(join(environment.node, '..'), { recursive: true });
  writeFileSync(environment.node, 'test node placeholder', 'utf8');
  for (const executable of [environment.bunBin, environment.pnpmBin]) {
    mkdirSync(join(executable, '..'), { recursive: true });
    writeFileSync(executable, 'test package manager placeholder', 'utf8');
  }
  assert.ok(existsSync(environment.node));

  const target = join(base, 'project with spaces');
  mkdirSync(target);
  const existing = join(target, 'AGENTS.md');
  writeFileSync(existing, 'existing rules', 'utf8');
  const args = {
    target,
    stack: 'python' as const,
    browser: 'none' as const,
    withDeps: false,
  };
  await projectInit(environment, args);
  assert.ok(environment.commands.some((command) =>
    command.includes('compile') &&
    command.includes('--universal') &&
    command.includes('--generate-hashes')
  ));
  for (const relativePath of [
    'docs/qa/generated/business-understanding.md',
    'docs/qa/generated/test-plan.md',
    'docs/qa/tasks/ai-task.md',
    'docs/qa/inputs/input-index.md',
    'docs/qa/inputs/requirements.md',
    'docs/qa/generated/test-cases.md',
    '.env.example',
    '.env.dev.example',
    '.env.stg.example',
  ]) {
    assert.ok(existsSync(join(target, relativePath)), relativePath);
  }
  assert.ok(!existsSync(join(target, '.env')));
  const marker = JSON.parse(
    readFileSync(join(target, '.qa-project.json'), 'utf8'),
  ) as {
    qa_template_version: string;
    language_template_version: string;
  };
  assert.equal(
    marker.qa_template_version,
    readFileSync(join(REPO, 'packages/templates/qa/VERSION'), 'utf8').trim(),
  );
  assert.equal(
    marker.language_template_version,
    readFileSync(join(REPO, 'packages/templates/python/VERSION'), 'utf8').trim(),
  );
  assert.ok(existsSync(join(target, 'requirements.in')));
  assert.ok(existsSync(join(target, 'scripts/check_lock.py')));
  const plan = join(target, 'docs/qa/generated/test-plan.md');
  writeFileSync(plan, 'QA filled this plan', 'utf8');
  await projectInit(environment, args);
  assert.equal(readFileSync(plan, 'utf8'), 'QA filled this plan');
  assert.equal(readFileSync(existing, 'utf8'), 'existing rules');

  const modified = join(target, 'tests/e2e/test_browser.py');
  writeFileSync(modified, '# user test', 'utf8');
  mkdirSync(join(target, '.venv'));
  writeFileSync(join(target, '.venv/owned.txt'), 'dependency', 'utf8');
  writeFileSync(join(target, 'requirements.lock'), 'generated lock', 'utf8');
  writeFileSync(join(target, 'requirements.lock.meta.json'), '{}', 'utf8');
  const custom = join(target, 'my-notes.md');
  writeFileSync(custom, 'retain', 'utf8');
  await projectUninstall(environment, { target });
  assert.equal(readFileSync(join(target, '.venv/owned.txt'), 'utf8'), 'dependency');
  assert.ok(existsSync(join(target, '.qa-project.json')));
  assert.ok(!existsSync(join(target, 'requirements.in')));
  assert.ok(existsSync(join(target, 'requirements.lock')));
  assert.ok(existsSync(join(target, 'requirements.lock.meta.json')));
  assert.equal(readFileSync(modified, 'utf8'), '# user test');
  assert.equal(readFileSync(existing, 'utf8'), 'existing rules');
  assert.ok(existsSync(custom));
  assert.equal(readFileSync(plan, 'utf8'), 'QA filled this plan');
  assert.ok(!existsSync(join(target, 'docs/qa/tasks/ai-task.md')));
});

test('manifest traversal is refused during uninstall', async () => {
  const base = createWorkspace();
  const environment = createEnvironment();
  const target = join(base, 'project');
  mkdirSync(target);
  const outside = join(base, 'keep.txt');
  writeFileSync(outside, 'keep', 'utf8');
  atomicJson(join(target, '.qa-project.json'), {
    owner: OWNER,
    target,
    stack: 'python',
    files: { '../keep.txt': digest(outside) },
    directories: [],
  });
  await assert.rejects(
    () => projectUninstall(environment, { target }),
    /Unsafe manifest path/,
  );
  assert.equal(readFileSync(outside, 'utf8'), 'keep');
});

test('project paths cannot traverse linked intermediate directories', async () => {
  const base = createWorkspace();
  const environment = createEnvironment();
  const target = join(base, 'project');
  const outside = join(base, 'outside');
  mkdirSync(target);
  mkdirSync(outside);
  symlinkSync(outside, join(target, 'docs'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(
    () => projectInit(environment, { target, stack: 'python', browser: 'none', withDeps: false }),
    /Unsafe project path/,
  );
  assert.ok(!existsSync(join(outside, 'qa')));

  const sentinel = join(outside, 'sentinel.md');
  writeFileSync(sentinel, 'preserve', 'utf8');
  const local = join(target, 'local.txt');
  writeFileSync(local, 'preserve local', 'utf8');
  atomicJson(join(target, '.qa-project.json'), {
    owner: OWNER, target, stack: 'python',
    files: { 'local.txt': digest(local), 'docs/sentinel.md': digest(sentinel) },
    directories: [],
  });
  await assert.rejects(() => projectUninstall(environment, { target }), /Unsafe manifest path/);
  assert.equal(readFileSync(sentinel, 'utf8'), 'preserve');
  assert.equal(readFileSync(local, 'utf8'), 'preserve local');
});

test('project initialization preserves unmanaged and modified Python locks', async () => {
  for (const mode of ['unmanaged', 'modified'] as const) {
    const base = createWorkspace();
    const managed = createEnvironment();
    const environment = new StubEnvironment({ root: managed.root, env: managed.environment });
    const target = join(base, mode);
    mkdirSync(target);
    const source = join(target, 'requirements.in');
    const lock = join(target, 'requirements.lock');
    const metadata = join(target, 'requirements.lock.meta.json');
    writeFileSync(source, 'pytest==1.0\n', 'utf8');
    writeFileSync(lock, 'original lock', 'utf8');
    if (mode === 'modified') {
      atomicJson(metadata, { schema: 1, requirements_in_sha256: 'outdated' });
      atomicJson(join(target, '.qa-project.json'), {
        owner: OWNER, target, stack: 'python', files: {}, directories: [],
        requirements_lock_sha256: digest(lock),
        requirements_lock_meta_sha256: digest(metadata),
      });
      writeFileSync(lock, 'user modified lock', 'utf8');
    }
    const before = readFileSync(lock, 'utf8');
    await assert.rejects(
      () => projectInit(environment, { target, stack: 'python', browser: 'none', withDeps: false }),
      /unmanaged or modified/,
    );
    assert.equal(readFileSync(lock, 'utf8'), before);
    assert.ok(!environment.commands.some((command) => command.includes('compile')));
  }
});

test('project cannot overlap the environment root', async () => {
  const environment = createEnvironment();
  await assert.rejects(
    () =>
      projectInit(environment, {
        target: join(environment.root, 'project'),
        stack: 'python',
        browser: 'none',
        withDeps: false,
      }),
    /Project must be separate from environment root/,
  );
});

test('project cannot reach the environment through a linked ancestor', async () => {
  const base = createWorkspace();
  const environment = createEnvironment();
  const alias = join(base, 'environment-link');
  symlinkSync(environment.root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const target = join(alias, 'project');
  await assert.rejects(
    () => projectInit(environment, { target, stack: 'python', browser: 'none', withDeps: false }),
    /Project must be separate/,
  );
  assert.ok(!existsSync(join(environment.root, 'project')));

  mkdirSync(target);
  atomicJson(join(target, '.qa-project.json'), {
    owner: OWNER, target, stack: 'python', files: {}, directories: [],
  });
  await assert.rejects(() => projectUninstall(environment, { target }), /Project overlaps environment/);
  assert.ok(existsSync(join(target, '.qa-project.json')));
});

test('project initialization refuses linked dependency directories', async () => {
  for (const [stack, dependency] of [
    ['python', '.venv'],
    ['typescript', 'node_modules'],
  ] as const) {
    const base = createWorkspace();
    const environment = new StubEnvironment({
      root: join(base, 'environment'),
      env: { PATH: createToolPath(base) },
    });
    environment.save();
    const python = join(environment.root, 'runtime/python/python');
    mkdirSync(join(environment.root, 'runtime/python'), { recursive: true });
    writeFileSync(python, 'test interpreter placeholder', 'utf8');
    mkdirSync(join(environment.root, 'bootstrap'), { recursive: true });
    writeFileSync(join(environment.root, 'bootstrap/python-path.txt'), python, 'utf8');
    environment.state.stack = stack;
    environment.save();
    mkdirSync(join(environment.node, '..'), { recursive: true });
    writeFileSync(environment.node, 'test node placeholder', 'utf8');
    for (const executable of [environment.bunBin, environment.pnpmBin]) {
      mkdirSync(join(executable, '..'), { recursive: true });
      writeFileSync(executable, 'test package manager placeholder', 'utf8');
    }
    if (stack === 'typescript') {
      writeFileSync(environment.node, 'test node placeholder', 'utf8');
    }
    const target = join(base, `linked-${stack}`);
    const outside = join(base, `outside-${stack}`);
    mkdirSync(target);
    mkdirSync(outside);
    symlinkSync(outside, join(target, dependency), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(
      () =>
        projectInit(environment, {
          target,
          stack,
          browser: 'none',
          withDeps: false,
        }),
      /Linked or escaping dependency directory/,
    );
    assert.equal(environment.commands.length, 0);
  }
});

test('--root is accepted in options and remains untouched after run', () => {
  const parsed = parseArgs([
    'env',
    'check',
    'both',
    '--root',
    'path with spaces',
  ]);
  assert.equal(parsed.root, 'path with spaces');
  assert.equal(parsed.action, 'check');
  assert.equal(
    parseArgs(['env', 'init', 'typescript', '--full']).full,
    true,
  );
  const project = parseArgs([
    'project',
    'init',
    'qa-project',
    '--language',
    'typescript',
  ]);
  assert.equal(project.target, 'qa-project');
  assert.equal(project.language, 'typescript');
  assert.equal(
    parseArgs([
      'project',
      'init',
      'qa-project',
      '--语言',
      'python',
    ]).language,
    'python',
  );
  assert.equal(parseArgs(['project', 'plan', 'qa-project']).action, 'plan');
  assert.throws(() => parseArgs(['env', 'plan']), /requires/);
  assert.throws(() => parseArgs(['project', 'plan', 'qa-project', '--browser', 'chromium']), /Unknown option/);
  assert.equal(parseArgs([]).command, 'help');
  assert.throws(
    () => parseArgs(['env', 'init']),
    /requires python, typescript, or both/,
  );
  assert.throws(
    () => parseArgs(['project', 'init', 'qa-project']),
    /requires --language/,
  );
  const run = parseArgs([
    'run',
    'python',
    'app.py',
    '--root',
    'application-root',
  ]);
  assert.deepEqual(run.runArgs?.slice(-2), ['--root', 'application-root']);
  const mcpAdd = parseArgs(['mcp', 'add', 'faker']);
  assert.equal(mcpAdd.command, 'mcp');
  assert.equal(mcpAdd.mcpAction, 'add');
  assert.equal(mcpAdd.mcpName, 'faker');
  assert.equal(parseArgs(['mcp', 'list']).mcpAction, 'list');
  assert.throws(
    () => parseArgs(['mcp', 'add']),
    /requires a server name/,
  );
  assert.throws(
    () => parseArgs(['mcp', 'install', 'faker']),
    /requires add, remove, or list/,
  );
});

test('environment uninstall has no user-installed software override', async () => {
  assert.equal(parseArgs(['env', 'uninstall']).action, 'uninstall');
  assert.throws(() => parseArgs(['env', 'uninstall', '--include-external']), /Unknown option/);
  assert.throws(() => parseArgs(['project', 'uninstall', 'project', '--include-external']), /Unknown option/);
  assert.throws(() => parseArgs(['env', 'init', 'typescript', '--include-external']), /Unknown option/);
});

test('shared software cleanup preserves user-installed tools without invoking npm', async () => {
  const base = createWorkspace();
  const prefix = join(base, 'global');
  const packageDir = process.platform === 'win32'
    ? join(prefix, 'node_modules', '@playwright', 'cli')
    : join(prefix, 'lib', 'node_modules', '@playwright', 'cli');
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: '@playwright/cli' }));
  const executable = join(packageDir, 'cli.js');
  writeFileSync(executable, '');
  const calls: string[][] = [];
  const messages: string[] = [];
  const env = {
    root: join(base, 'qa-root'),
    mcpConfig: join(base, 'codex', 'config.toml'),
    playwrightCliPackage: packageDir,
    agentBrowserPackage: '',
    listDiscoveredTools: () => [
      { name: 'playwright-cli', path: executable, scope: 'system-or-user', source: 'unknown' },
      { name: 'cc-switch', path: join(base, 'unknown'), scope: 'system-or-user', source: 'unknown' },
      { name: 'owned', path: base, scope: 'system-or-user', source: 'qa' },
    ],
    npm: (args: string[]) => { calls.push(args); return prefix; },
  } as unknown as Environment;
  const interaction = { log: (message: string) => messages.push(message) };
  assert.equal(await preserveSharedSoftware(env, interaction), true);
  assert.equal(calls.length, 0);
  assert.ok(messages.some((message) => message.includes('cc-switch')));
  assert.ok(messages.some((message) => message.includes('QA-managed owned')));
  assert.ok(messages.some((message) => message.includes('user-installed playwright-cli')));
  assert.ok(messages.some((message) => message.includes('requires QA ownership evidence')));
  assert.ok(existsSync(executable));
});

test('external npm package validation rejects linked packages and package roots outside the prefix', () => {
  const base = createWorkspace();
  const prefix = join(base, 'global');
  const externalRoot = join(base, 'external');
  const externalPackage = join(externalRoot, '@playwright', 'cli');
  mkdirSync(externalPackage, { recursive: true });
  writeFileSync(join(externalPackage, 'package.json'), JSON.stringify({ name: '@playwright/cli' }));
  const executable = join(externalPackage, 'cli.js');
  writeFileSync(executable, '');
  const packageRoot = process.platform === 'win32'
    ? join(prefix, 'node_modules')
    : join(prefix, 'lib', 'node_modules');
  const packageDir = join(packageRoot, '@playwright', 'cli');
  mkdirSync(dirname(packageRoot), { recursive: true });
  symlinkSync(externalRoot, packageRoot, process.platform === 'win32' ? 'junction' : 'dir');
  const tool = { name: 'playwright-cli', path: executable, scope: 'system-or-user' as const, source: 'unknown' as const };
  assert.equal(verifiedGlobalPackage(tool, '@playwright/cli', packageDir, prefix), false);

  // A package link is also rejected when the package root itself stays in the prefix.
  rmSync(packageRoot);
  mkdirSync(dirname(packageDir), { recursive: true });
  const internalPackage = join(packageRoot, 'linked-target');
  mkdirSync(internalPackage);
  writeFileSync(join(internalPackage, 'package.json'), JSON.stringify({ name: '@playwright/cli' }));
  const internalExecutable = join(internalPackage, 'cli.js');
  writeFileSync(internalExecutable, '');
  symlinkSync(internalPackage, packageDir, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(verifiedGlobalPackage({ ...tool, path: internalExecutable }, '@playwright/cli', packageDir, prefix), false);
});

test('external npm package validation accepts an executable inside its package', () => {
  const base = createWorkspace();
  const prefix = join(base, 'global');
  const packageDir = process.platform === 'win32'
    ? join(prefix, 'node_modules', '@playwright', 'cli')
    : join(prefix, 'lib', 'node_modules', '@playwright', 'cli');
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: '@playwright/cli' }));
  const executable = join(packageDir, 'cli.js');
  writeFileSync(executable, '');
  assert.equal(
    verifiedGlobalPackage(
      { name: 'playwright-cli', path: executable, scope: 'system-or-user', source: 'unknown' },
      '@playwright/cli',
      packageDir,
      prefix,
    ),
    true,
  );
});

test('external uninstall preserves all software when another root owns an MCP lock', async () => {
  const base = createWorkspace();
  const prefix = join(base, 'global');
  const packageDir = process.platform === 'win32'
    ? join(prefix, 'node_modules', '@playwright', 'cli')
    : join(prefix, 'lib', 'node_modules', '@playwright', 'cli');
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: '@playwright/cli' }));
  const executable = join(packageDir, 'cli.js');
  writeFileSync(executable, '');
  const configDir = join(base, 'codex');
  mkdirSync(configDir);
  const root = join(base, 'qa-root');
  const lockPath = join(configDir, 'qa-ai-playwright-mcp.lock.json');
  writeFileSync(lockPath, JSON.stringify({ servers: { other: { root: join(base, 'other-root') } } }));
  const calls: string[][] = [];
  const messages: string[] = [];
  const env = {
    root,
    mcpConfig: join(configDir, 'config.toml'),
    playwrightCliPackage: packageDir,
    agentBrowserPackage: '',
    listDiscoveredTools: () => [
      { name: 'playwright-cli', path: executable, scope: 'system-or-user', source: 'unknown' },
      { name: 'cc-switch', path: join(base, 'cc-switch'), scope: 'system-or-user', source: 'unknown' },
    ],
    npm: (args: string[]) => { calls.push(args); return prefix; },
  } as unknown as Environment;
  const interaction = { log: (message: string) => messages.push(message) };
  assert.equal(await preserveSharedSoftware(env, interaction), true);
  assert.deepEqual(calls, []);
  assert.ok(messages.some((message) => message.includes('requires QA ownership evidence')));
  assert.ok(existsSync(executable));
  assert.ok(existsSync(lockPath));
});
test('project commands require an initialized matching environment', async () => {
  const base = createWorkspace();
  const environment = new Environment({
    root: join(base, 'environment'),
    env: {},
  });
  const target = join(base, 'project');
  mkdirSync(target);
  await assert.rejects(
    () =>
      projectInit(environment, {
        target,
        stack: 'typescript',
        browser: 'none',
        withDeps: false,
      }),
    /Environment is not initialized/,
  );
  environment.state.stack = 'python';
  environment.save();
  assert.throws(
    () => environment.requireInitialized('typescript'),
    /initialized for python, not typescript/,
  );
});
