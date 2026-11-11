import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
import { test } from 'bun:test';

import {
  Environment,
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
import { parseArgs, uninstallExternalTools, verifiedGlobalPackage } from '../packages/qa-cli/qa-cli.ts';

const temporaryDirectories = new Set<string>();
process.once('exit', () => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** Creates a PATH directory outside the managed root with isolated tool placeholders. */
function createToolPath(base: string, names = ['bun', 'pnpm']): string {
  const bin = join(base, 'global tools');
  mkdirSync(bin, { recursive: true });
  for (const name of names) {
    const path = join(bin, WINDOWS ? `${name}.exe` : name);
    writeFileSync(path, `placeholder ${name}`);
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
  const bin = createToolPath(base, ['npm', 'bun']);
  const pnpm = join(bin, WINDOWS ? 'pnpm.exe' : 'pnpm');
  const prefix = WINDOWS ? bin : dirname(bin);
  const environment = new class extends StubEnvironment {
    override run(command: readonly (string | number)[], options: RunOptions = {}): string | undefined {
      const result = super.run(command, options);
      if (command.includes('prefix')) return prefix;
      if (command.includes('install') && command.includes('--global')) writeFileSync(pnpm, 'installed pnpm');
      if (options.capture && command[0] === this.bunBin) return '1.0.0';
      if (options.capture && command[0] === this.pnpmBin) return '9.0.0';
      return result;
    }
  }({ root: join(base, 'environment'), env: { PATH: bin } });
  environment.save();
  assert.deepEqual(await environment.ensurePackageManagers(), { bun: '1.0.0', pnpm: '9.0.0' });
  assert.deepEqual(await environment.ensurePackageManagers(), { bun: '1.0.0', pnpm: '9.0.0' });
  const installs = environment.commands.filter((command) => command.includes('install') && command.includes('--global'));
  assert.equal(installs.length, 1);
  assert.ok(installs[0]?.includes(`pnpm@${environment.pnpmVersion}`));
  assert.equal(readFileSync(pnpm, 'utf8'), 'installed pnpm');
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
});

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
test('MCP registration preserves a conflicting user configuration', () => {
  const environment = new StubEnvironment({
    root: join(createWorkspace(), 'environment'),
    env: {},
  });
  const config = join(createWorkspace(), 'user codex', 'config.toml');
  Object.defineProperty(environment, 'mcpConfig', { value: config });
  mkdirSync(dirname(config), { recursive: true });
  const root = WINDOWS ? environment.root.toLowerCase() : environment.root;
  const name = 'qa-' + createHash('sha256').update(root).digest('hex').slice(0, 16) + '-playwright';
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
  const root = WINDOWS ? environment.root.toLowerCase() : environment.root;
  const name = 'qa-' + createHash('sha256').update(root).digest('hex').slice(0, 16) + '-faker';
  const original = `[mcp_servers.${name}]\ncommand = "user-faker"\n`;
  writeFileSync(config, original);

  try {
    environment.removeOptionalMcp('faker');
  } catch {
    // Refusing to remove an unowned registration is acceptable.
  }
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
    /^QA_UV_VERSION=0\.13\.7$/mu,
  );
  assert.match(
    readFileSync(join(REPO, 'packages/qa-cli/runtime-versions.env'), 'utf8'),
    /^QA_BUN_VERSION=1\.4\.4$/mu,
  );
  assert.match(
    readFileSync(join(REPO, 'packages/qa-cli/runtime-versions.env'), 'utf8'),
    /^QA_PNPM_VERSION=12\.18\.0$/mu,
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
      join(REPO, '.agents/skills/qa-maintainer/SKILL.md'),
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
  assert.equal(manifest.version, '4.0.28');
  assert.match(manifest.commit, /^[a-f0-9]{40}$/);
  assert.equal(manifest.scope, 'environment');
  assert.equal(manifest.assets.length, 5);
  assert.match(
    readFileSync(join(REPO, 'packages/qa-cli/runtime-versions.env'), 'utf8'),
    /^QA_CC_SWITCH_VERSION=4\.0\.28$/mu,
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
    join(REPO, 'docs/skills-mcp.zh-CN.md'),
    'utf8',
  );
  assert.match(skillDocs, /\/skills/);
  assert.match(skillDocs, /\$qa-business-guide/);
  assert.match(skillDocs, /不是 `\/env`/);
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
  const environment = new StubEnvironment({
    root: join(createWorkspace(), 'environment'),
    env: {},
  });
  environment.save();
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

test('external software uninstall requires an explicit supported operation', async () => {
  const defaultArgs = parseArgs(['env', 'uninstall']);
  assert.equal(defaultArgs.includeExternal, undefined);
  const confirmed = parseArgs(['env', 'uninstall', '--include-external']);
  assert.equal(confirmed.includeExternal, true);
  assert.throws(() => parseArgs(['env', 'uninstall', '--include-external=false']), /Unknown option/);
  assert.throws(() => parseArgs(['project', 'uninstall', 'project', '--include-external']), /Unknown option/);
  assert.throws(() => parseArgs(['env', 'init', 'typescript', '--include-external']), /Unknown option/);
});

test('external uninstall requires explicit authorization and verifies npm package identity', async () => {
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
  assert.equal(await uninstallExternalTools(env, false, interaction), true);
  assert.equal(calls.length, 0);
  assert.ok(messages.some((message) => message.includes('cc-switch')));
  assert.ok(!messages.some((message) => message.includes('owned:')));
  assert.ok(messages.some((message) => message.includes('External software is preserved')));
  assert.equal(await uninstallExternalTools(env, true, interaction), false);
  assert.equal(calls.length, 0);
  assert.ok(messages.some((message) => message.includes('cross-environment usage cannot be verified')));
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
  assert.equal(await uninstallExternalTools(env, true, interaction), false);
  assert.deepEqual(calls, []);
  assert.ok(messages.some((message) => message.includes('cross-environment usage cannot be verified')));
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
