import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  accessSync,
  constants,
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { findSystemBrowser, type SelectedBrowser } from './browser-discovery.ts';

import {
  OWNER,
  REPO,
  WINDOWS,
  atomicJson,
  digest,
  download,
  extractArchive,
  loadRuntimeSettings,
  mcpManifest,
  readMcpServerConfig,
  removeOwned,
  within,
  type McpServerConfig,
  type SkillProfile,
  type SkillSource,
  type Stack,
} from './shared.ts';

/** Keeps Agent Browser socket paths below Unix domain socket limits. */
const AGENT_BROWSER_SOCKET_DIR = 's';
const AGENT_BROWSER_SESSION = 'qa';
const AGENT_BROWSER_LAUNCH_ARGS = WINDOWS
  ? '--disable-gpu,--disable-software-rasterizer,--no-sandbox'
  : undefined;

/** Uses the host temporary directory for Chromium's own short-lived files. */
function agentBrowserTempEnvironment(): NodeJS.ProcessEnv {
  const temp = WINDOWS
    ? join(
        process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
        'Temp',
      )
    : '/tmp';
  return { TEMP: temp, TMP: temp, TMPDIR: temp };
}

/** One installed tool found without running it or modifying its state. */
export interface DiscoveredTool {
  name: string;
  path: string;
  scope: 'environment' | 'system-or-user';
  source: 'qa' | 'unknown';
  version?: string;
}

/** Result of removing this environment's shared MCP registrations. */
export interface SharedMcpRemovalResult {
  removed: string[];
  absent: string[];
  preserved: { name: string; reason: string }[];
  failed: { name: string; reason: string }[];
}

/** Read-only status of an optional MCP's registration, ownership, and shared package. */
export interface OptionalMcpStatus {
  name: string;
  serverName: string;
  registration: 'present' | 'absent' | 'unknown';
  ownership: 'owned' | 'modified' | 'unowned' | 'none';
  package: { name: string; status: 'available' | 'missing' | 'broken' | 'unknown'; version?: string; path?: string };
}
/** Options used to create an isolated environment manager. */
export interface EnvironmentOptions {
  root: string;
  repo?: string;
  env?: NodeJS.ProcessEnv;
}
/** Options accepted by `env init`. */
export interface EnvironmentInitOptions {
  stack: Stack;
  profile: SkillProfile;
  skipCodex: boolean;
  skipSkills: boolean;
  withCcSwitch?: boolean;
}

/** Options accepted by `env check`. */
export interface EnvironmentCheckOptions {
  stack: Stack;
  profile: SkillProfile;
  skipCodex: boolean;
  skipSkills: boolean;
  withCcSwitch?: boolean;
}

/** Options for one child process invocation. */
export interface RunOptions {
  cwd?: string;
  capture?: boolean;
  env?: NodeJS.ProcessEnv;
  windowsVerbatimArguments?: boolean;
}

interface CcSwitchAsset {
  platform: 'win32' | 'darwin' | 'linux';
  arch: 'x64' | 'arm64' | 'universal';
  file: string;
  format: 'zip' | 'appimage';
  sha256: string;
}

interface CcSwitchManifest {
  id: string;
  version: string;
  release_tag: string;
  source_type: string;
  scope: string;
  download_base: string;
  install_directory: string;
  assets: CcSwitchAsset[];
}

type State = Record<string, unknown>;

/**
 * Manages one environment-local QA installation.
 *
 * All runtime, dependency, Skill, MCP and credential state remains below
 * {@link Environment.root}. The class does not update global configuration.
 */
export class Environment {
  private checking = false;
  readonly root: string;
  readonly repo: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly stateFile: string;
  readonly marker: string;
  readonly state: State;
  readonly nodeMajor: string;
  readonly bunVersion: string;
  readonly pnpmVersion: string;
  readonly pythonVersion: string;
  readonly uvVersion: string;
  readonly playwrightCliVersion: string;
  readonly playwrightMcpVersion: string;
  readonly agentBrowserVersion: string;
  readonly ccSwitchVersion: string;
  readonly uv: string;
  readonly nodeDir: string;
  readonly node: string;
  readonly npmPrefix: string;
  readonly npmBin: string;
  readonly ccSwitchDir: string;
  readonly ccSwitchManifest: string;
  readonly mcpConfig: string;

  /**
   * Creates an environment manager after validating ownership boundaries.
   *
   * @param options - Root, repository and optional process environment.
   */
  constructor(options: EnvironmentOptions) {
    this.repo = resolve(options.repo ?? REPO);
    this.environment = options.env ?? process.env;
    const rawRoot = resolve(options.root);
    if (existsSync(rawRoot) && lstatSync(rawRoot).isSymbolicLink()) {
      throw new Error('Environment root must not be a symlink');
    }
    this.root = existsSync(rawRoot) ? realpathSync(rawRoot) : rawRoot;

    if (
      this.root === resolve(this.root, '..') ||
      this.root === resolve(this.environment.PWD ?? process.cwd()) ||
      within(this.repo, this.root)
    ) {
      throw new Error('Use a dedicated child directory for the environment');
    }

    this.marker = join(this.root, '.qa-managed');
    if (
      existsSync(this.root) &&
      readdirSync(this.root).length > 0 &&
      (!existsSync(this.marker) ||
        readFileSync(this.marker, 'utf8').trim() !== OWNER)
    ) {
      throw new Error(`Unmanaged environment directory: ${this.root}`);
    }

    this.stateFile = join(this.root, 'state.json');
    this.state = this.readJson(this.stateFile) ?? {};

    const settings = loadRuntimeSettings(this.repo);
    this.nodeMajor =
      this.environment.QA_NODE_MAJOR ?? settings.nodeMajor;
    this.bunVersion =
      this.environment.QA_BUN_VERSION ?? settings.bunVersion;
    this.pnpmVersion =
      this.environment.QA_PNPM_VERSION ?? settings.pnpmVersion;
    this.pythonVersion =
      this.environment.QA_PYTHON_VERSION ?? settings.pythonVersion;
    this.uvVersion =
      this.environment.QA_UV_VERSION ?? settings.uvVersion;
    this.playwrightCliVersion =
      this.environment.QA_PLAYWRIGHT_CLI_VERSION ??
      settings.playwrightCliVersion;
    this.playwrightMcpVersion =
      this.environment.QA_PLAYWRIGHT_MCP_VERSION ??
      settings.playwrightMcpVersion;
    this.agentBrowserVersion =
      this.environment.QA_AGENT_BROWSER_VERSION ??
      settings.agentBrowserVersion;
    this.ccSwitchVersion =
      this.environment.QA_CC_SWITCH_VERSION ??
      settings.ccSwitchVersion;

    if (!/^3\.(12|13|14|15)$/.test(this.pythonVersion)) {
      throw new Error('Unsupported stable QA_PYTHON_VERSION');
    }

    this.uv = join(this.root, 'bootstrap', WINDOWS ? 'uv.exe' : 'uv');
    const configuredNode = this.environment.QA_NODE_PATH;
    this.node = configuredNode
      ? resolve(configuredNode)
      : (this.globalTool('node') ?? join(this.root, 'runtime', 'node', WINDOWS ? 'node.exe' : 'bin/node'));
    this.nodeDir = WINDOWS ? dirname(this.node) : dirname(dirname(this.node));
    this.npmPrefix = join(this.root, 'tools', 'npm');
    this.npmBin = WINDOWS ? this.npmPrefix : join(this.npmPrefix, 'bin');
    const userData = process.platform === 'win32'
      ? (this.environment.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'))
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support')
        : (this.environment.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'));
    this.ccSwitchDir = join(userData, 'qa-ai-playwright', 'cc-switch');
    this.ccSwitchManifest = join(
      this.repo,
      'packages/apps/cc-switch/manifest.json',
    );
    this.mcpConfig = join(resolve(this.environment.CODEX_HOME || join(homedir(), '.codex')), 'config.toml');
  }

  /** Finds an executable in the user's PATH or the recorded npm global bin. */
  private globalTool(name: string): string | undefined {
    const recorded = typeof this.state.global_npm_bin === 'string' ? this.state.global_npm_bin : '';
    const paths = [...(this.environment.PATH ?? '').split(delimiter), recorded];
    const extensions = WINDOWS ? ['.exe', '.cmd', '.bat', ''] : [''];
    for (const directory of paths.filter(Boolean)) {
      for (const extension of extensions) {
        const candidate = join(directory.replace(/^"|"$/g, ''), `${name}${extension}`);
        if (within(resolve(candidate), this.root)) continue;
        try {
          if (!lstatSync(candidate).isFile() && !lstatSync(candidate).isSymbolicLink()) continue;
          accessSync(candidate, WINDOWS ? constants.F_OK : constants.X_OK);
          return candidate;
        } catch {
          // Continue searching when an entry is missing or cannot be executed.
        }
      }
    }
    return undefined;
  }

  /** Runs global executables and Windows command shims. */
  private runGlobal(executable: string, args: readonly (string | number)[], options?: RunOptions): string | undefined {
    if (WINDOWS && /\.(cmd|bat)$/i.test(executable)) {
      const parts = [executable, ...args.map(String)];
      if (parts.some(part => /["%\r\n]/.test(part))) {
        throw new Error('Windows command arguments contain unsupported characters');
      }
      const command = parts.map(part => `"${part}"`).join(' ');
      return this.run([this.environment.ComSpec ?? 'cmd.exe', '/d', '/s', '/c', `"${command}"`], {
        ...options,
        windowsVerbatimArguments: true,
      });
    }
    return this.run([executable, ...args], options);
  }

  /** Finds an npm package in the selected global prefix or beside its executable. */
  private globalPackage(name: string, executable?: string): string {
    const bin = typeof this.state.global_npm_bin === 'string' ? this.state.global_npm_bin : '';
    const bases = [bin, executable ? dirname(executable) : ''].filter(Boolean);
    for (const base of bases) {
      const candidates = WINDOWS
        ? [join(base, 'node_modules', name)]
        : [join(base, '..', 'lib', 'node_modules', name), join(base, '..', 'node_modules', name)];
      for (const candidate of candidates) {
        if (existsSync(join(candidate, 'package.json')) && !within(resolve(candidate), this.root)) return resolve(candidate);
      }
    }
    return '';
  }

  get playwrightCliBin(): string { return this.globalTool('playwright-cli') ?? ''; }
  get agentBrowser(): string { return this.globalTool('agent-browser') ?? ''; }
  get playwrightCliPackage(): string { return this.globalPackage('@playwright/cli', this.playwrightCliBin); }
  get playwrightMcpPackage(): string { return this.globalPackage('@playwright/mcp', this.globalTool('playwright-mcp')); }
  get agentBrowserPackage(): string { return this.globalPackage('agent-browser', this.agentBrowser); }
  /** Runs npm using user-level cache and temporary paths rather than QA-local paths. */
  private globalNpm(args: readonly string[], capture = false): string | undefined {
    const npm = this.globalTool('npm');
    const options: RunOptions = {
      capture,
      env: {
        npm_config_prefix: undefined,
        NPM_CONFIG_PREFIX: undefined,
        npm_config_cache: this.environment.npm_config_cache,
        TEMP: this.environment.TEMP,
        TMP: this.environment.TMP,
        TMPDIR: this.environment.TMPDIR,
        PATH: this.environment.PATH,
      },
    };
    return npm ? this.runGlobal(npm, args, options) : this.npm(args, options);
  }

  /** Reads npm's configured global prefix without the QA-local prefix override. */
  private discoverGlobalNpmBin(): string | undefined {
    const prefix = this.globalNpm(['config', 'get', 'prefix'], true)?.trim();
    if (!prefix || within(resolve(prefix), this.root)) return undefined;
    const bin = WINDOWS ? prefix : join(prefix, 'bin');
    this.state.global_npm_bin = bin;
    return bin;
  }

  /** Persist an observation without assuming shared tools can safely be removed. */
  private recordInstallation(name: string, observation: Record<string, unknown>): void {
    const records = this.objectValue(this.state.installations);
    const previous = this.objectValue(records[name]);
    const source = observation.source === 'reused' && previous.status === 'pending'
      ? 'unknown' : observation.source === 'reused' && previous.source === 'qa'
      && previous.status === 'ready' && previous.path === observation.path
      && (previous.version === observation.version || previous.version === 'unknown') ? 'qa' : observation.source;
    records[name] = { ...(source === 'qa' ? previous : {}), ...observation, source };
    this.state.installations = records;
    this.save();
  }

  /** Installs a missing tool using npm's user or system global prefix. */
  private installGlobal(packageSpec: string, executableName?: string, packageName?: string): void {
    const args = ['install', '--global', packageSpec];
    if (!this.discoverGlobalNpmBin()) {
      throw new Error('npm global prefix resolves inside the QA environment; configure a system or user global prefix');
    }
    const packageBase = packageName ?? packageSpec.match(/^(@[^/]+\/[^@]+|[^@]+)/u)?.[0];
    const tool = executableName ?? packageBase?.split('/').at(-1);
    if (!tool) throw new Error(`Cannot determine executable for ${packageSpec}`);
    if (this.globalTool(tool) || (packageName && this.globalPackage(packageName, this.globalTool(tool)))) return;
    this.recordInstallation(packageBase ?? tool, { status: 'pending', source: 'unknown', scope: 'system-or-user', package: packageBase, requested: packageSpec, npm_bin: this.state.global_npm_bin });
    console.log(`Installing missing global tool: npm ${args.join(' ')}`);
    this.globalNpm(args);
    const path = this.globalTool(tool) ?? (packageBase ? this.globalPackage(packageBase) : '');
    const packagePath = packageBase ? this.globalPackage(packageBase, path) : '';
    const version = this.globalPackageVersion(packagePath);
    const globalBin = String(this.state.global_npm_bin);
    const installedAtPrefix = Boolean(path && (within(resolve(path), resolve(globalBin)) || (packagePath && path === packagePath)));
    this.recordInstallation(packageBase ?? tool, { status: path ? 'ready' : 'pending', source: installedAtPrefix ? 'qa' : 'unknown', scope: 'system-or-user', package: packageBase, path, package_path: packagePath, version: version ?? 'unknown', requested: packageSpec });
  }

  get bunBin(): string { return this.globalTool('bun') ?? ''; }
  /** Resolves the actual Bun executable when npm exposes a Windows command shim. */
  get bunExecutable(): string {
    const bun = this.bunBin;
    if (!WINDOWS || !/\.(cmd|bat)$/i.test(bun)) return bun;
    const executable = this.bun(['-p', 'process.execPath'], { capture: true })?.trim();
    if (!executable || !existsSync(executable) || !/\.exe$/i.test(executable)) {
      throw new Error('Unable to resolve the Bun executable from its command shim');
    }
    return executable;
  }
  get pnpmBin(): string { return this.globalTool('pnpm') ?? ''; }
  /** Loads the reviewed Codex CLI source and executable identity. */
  private codexManifest(): { package: string; executable: string } {
    const manifest = this.readJson(join(this.repo, 'packages/apps/codex/manifest.json'));
    if (manifest?.id !== 'codex' || manifest.source_type !== 'external'
      || manifest.package !== '@openai/codex' || manifest.executable !== 'codex') {
      throw new Error('Invalid Codex CLI manifest');
    }
    return { package: manifest.package, executable: manifest.executable };
  }

  get codexBin(): string { return this.globalTool(this.codexManifest().executable) ?? ''; }
  /**
   * Returns the managed Python interpreter path.
   *
   * @returns Existing managed interpreter.
   */
  python(): string {
    const record = join(this.root, 'bootstrap', 'python-path.txt');
    if (!existsSync(record)) {
      throw new Error('Run qa env init python first');
    }
    const python = readFileSync(record, 'utf8').replace(/^\uFEFF/u, '').trim();
    if (!within(python, this.root) || !existsSync(python)) {
      throw new Error('Invalid managed Python record');
    }
    return python;
  }

  /**
   * Verifies that the environment was initialized for the requested language.
   *
   * @param requiredStack - Language required by the project command.
   */
  requireInitialized(requiredStack?: Stack): void {
    const initializedStack = this.state.stack;
    if (this.state.init_status === 'initializing') {
      throw new Error('Environment initialization is incomplete. Run qa env repair or rerun the original env init command');
    }
    if (this.state.init_status === 'uninstalled') {
      throw new Error('Environment was uninstalled. Run qa env repair or rerun the original env init command');
    }
    if (
      !existsSync(this.marker)
      || !existsSync(this.stateFile)
      || !['python', 'typescript', 'both'].includes(String(initializedStack))
    ) {
      throw new Error(
        `Environment is not initialized at ${this.root}. Run: qa env init ${requiredStack ?? 'typescript'}`,
      );
    }
    if (
      requiredStack
      && requiredStack !== 'both'
      && initializedStack !== 'both'
      && initializedStack !== requiredStack
    ) {
      throw new Error(
        `Environment is initialized for ${String(initializedStack)}, not ${requiredStack}. Run: qa env init ${requiredStack}`,
      );
    }
    if (!existsSync(this.node)) {
      throw new Error('Node is missing. Set QA_NODE_PATH to a usable Node executable');
    }
    if (!existsSync(this.bunBin) || !existsSync(this.pnpmBin)) {
      throw new Error(
        'Global Bun or pnpm is missing. Re-run: qa env init <language>',
      );
    }
    if (
      (requiredStack === 'python' || requiredStack === 'both')
      && !existsSync(join(this.root, 'bootstrap', 'python-path.txt'))
    ) {
      throw new Error('Managed Python is missing. Re-run: qa env init python');
    }
  }

  /**
   * Saves the ownership marker and current state atomically.
   */
  save(): void {
    mkdirSync(this.root, { recursive: true });
    writeFileSync(this.marker, OWNER, 'utf8');
    atomicJson(this.stateFile, this.state);
  }

  /**
   * Builds the local process environment used by every child command.
   *
   * @returns Environment-local paths and pinned runtime settings.
   */
  variables(): NodeJS.ProcessEnv {
    const python = this.pythonPath();
    const values: NodeJS.ProcessEnv = {
      QA_ROOT: this.root,
      QA_REPO: this.repo,
      QA_NODE_MAJOR: this.nodeMajor,
      QA_BUN_VERSION: this.bunVersion,
      QA_PNPM_VERSION: this.pnpmVersion,
      QA_PYTHON_VERSION: this.pythonVersion,
      QA_PLAYWRIGHT_CLI_VERSION: this.playwrightCliVersion,
      QA_PLAYWRIGHT_MCP_VERSION: this.playwrightMcpVersion,
      QA_AGENT_BROWSER_VERSION: this.agentBrowserVersion,
      QA_CC_SWITCH_VERSION: this.ccSwitchVersion,
      PYTHONUTF8: '1',
      UV_CACHE_DIR: join(this.root, 'cache/uv'),
      UV_PYTHON_INSTALL_DIR: join(this.root, 'runtime/python'),
      UV_PYTHON_BIN_DIR: join(this.root, 'bin'),
      npm_config_cache: join(this.root, 'cache/npm'),
      npm_config_prefix: this.npmPrefix,
      npm_config_fetch_timeout: '120000',
      npm_config_fetch_retries: '2',
      BUN_INSTALL_CACHE_DIR: join(this.root, 'cache/bun'),
      PNPM_HOME: join(this.root, 'tools/pnpm'),
      UV_HTTP_TIMEOUT: '120',
      PIP_CACHE_DIR: join(this.root, 'cache/pip'),
      XDG_CACHE_HOME: join(this.root, 'cache/xdg'),
      TEMP: join(this.root, 'tmp'),
      TMP: join(this.root, 'tmp'),
      TMPDIR: join(this.root, 'tmp'),
      PLAYWRIGHT_BROWSERS_PATH: join(this.root, 'cache/browsers'),
      CODEX_HOME: dirname(this.mcpConfig),
      QA_NODE_PATH: this.node,
      AGENT_BROWSER_SOCKET_DIR: join(this.root, AGENT_BROWSER_SOCKET_DIR),
      AGENT_BROWSER_SCREENSHOT_DIR: join(
        this.root,
        'agent-browser-output',
      ),
      AGENT_BROWSER_DOWNLOAD_PATH: join(
        this.root,
        'agent-browser-downloads',
      ),
      AGENT_BROWSER_FLOWS_DIR: join(this.root, 'agent-browser-flows'),
      AGENT_BROWSER_CONFIG: join(
        this.root,
        'agent-browser-config.json',
      ),
    };

    const pathParts = [...new Set([
      dirname(this.node),
      ...(this.bunBin ? [dirname(this.bunBin)] : []),
      this.npmBin,
      join(this.root, 'bin'),
      ...(python ? [dirname(python)] : []),
      this.environment.PATH ?? '',
    ].filter(Boolean))];
    values.PATH = pathParts.join(WINDOWS ? ';' : ':');

    const browser = this.findBrowser();
    if (browser) {
      values.AGENT_BROWSER_EXECUTABLE_PATH = browser.path;
    }
    if (this.environment.QA_BROWSER_CHANNEL !== undefined) values.QA_BROWSER_CHANNEL = this.environment.QA_BROWSER_CHANNEL;
    else if (browser) values.QA_BROWSER_CHANNEL = browser.channel === 'chromium' ? '' : browser.channel;
    if (this.environment.QA_BROWSER_EXECUTABLE_PATH !== undefined) values.QA_BROWSER_EXECUTABLE_PATH = this.environment.QA_BROWSER_EXECUTABLE_PATH;
    else if (browser) values.QA_BROWSER_EXECUTABLE_PATH = browser.scope === 'environment' ? '' : browser.path;
    return values;
  }

  /**
   * Runs one command with environment-local variables.
   *
   * @param command - Executable and arguments.
   * @param options - Working directory and output capture mode.
   * @returns Captured standard output when requested.
   */
  run(
    command: readonly (string | number)[],
    options: RunOptions = {},
  ): string | undefined {
    const args = command.map(String);
    const executable = args[0];
    if (!executable) {
      throw new Error('Command must not be empty');
    }
    console.log(`> ${args.join(' ')}`);
    const probeEnvironment: NodeJS.ProcessEnv = {};
    if (this.checking) {
      for (const key of [
        'UV_CACHE_DIR', 'UV_PYTHON_INSTALL_DIR', 'UV_PYTHON_BIN_DIR',
        'npm_config_cache', 'BUN_INSTALL_CACHE_DIR', 'PNPM_HOME', 'PIP_CACHE_DIR',
        'XDG_CACHE_HOME', 'TEMP', 'TMP', 'TMPDIR', 'PLAYWRIGHT_BROWSERS_PATH',
      ]) probeEnvironment[key] = this.environment[key];
    }
    const result = spawnSync(executable, args.slice(1), {
      cwd: options.cwd,
      env: { ...this.environment, ...this.variables(), ...probeEnvironment, ...options.env },
      encoding: 'utf8',
      stdio: options.capture ? 'pipe' : 'inherit',
      windowsHide: true,
      windowsVerbatimArguments: options.windowsVerbatimArguments,
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      const details = options.capture ? result.stderr.trim() : '';
      throw new Error(
        `${basename(executable)} exited with code ${result.status ?? 'unknown'}${details ? `: ${details}` : ''}`,
      );
    }
    return options.capture ? result.stdout.trim() : undefined;
  }

  /**
   * Runs the managed npm JavaScript entrypoint.
   *
   * @param args - npm arguments.
   * @param options - Working directory and output capture mode.
   * @returns Captured output when requested.
   */
  npm(
    args: readonly (string | number)[],
    options?: RunOptions,
  ): string | undefined {
    const entry = join(
      this.nodeDir,
      WINDOWS
        ? 'node_modules/npm/bin/npm-cli.js'
        : 'lib/node_modules/npm/bin/npm-cli.js',
    );
    if (existsSync(entry)) return this.run([this.node, entry, ...args], options);
    const npm = this.globalTool('npm');
    if (!npm) throw new Error('npm is missing for the selected Node installation');
    return this.runGlobal(npm, args, options);
  }

  /**
   * Runs the discovered global pnpm executable.
   *
   * @param args - pnpm arguments.
   * @param options - Working directory and output capture mode.
   * @returns Captured output when requested.
   */
  pnpm(
    args: readonly (string | number)[],
    options?: RunOptions,
  ): string | undefined {
    if (!this.pnpmBin) throw new Error('Global pnpm is missing');
    return this.runGlobal(this.pnpmBin, args, options);
  }

  /**
   * Runs the discovered global Bun executable.
   *
   * @param args - Bun arguments.
   * @param options - Working directory and output capture mode.
   * @returns Captured output when requested.
   */
  bun(
    args: readonly (string | number)[],
    options?: RunOptions,
  ): string | undefined {
    if (!this.bunBin) throw new Error('Global Bun is missing');
    return this.runGlobal(this.bunBin, args, options);
  }

  /**
   * Runs the discovered global Codex CLI.
   *
   * @param args - Codex arguments.
   * @param options - Working directory and output capture mode.
   * @returns Captured output when requested.
   */
  codex(
    args: readonly (string | number)[],
    options?: RunOptions,
  ): string | undefined {
    if (!this.codexBin) throw new Error('Global Codex is missing');
    return this.runGlobal(this.codexBin, args, options);
  }

  /**
   * Runs the Playwright test runner from a generated project.
   *
   * @param target - Generated project root.
   * @param args - Playwright arguments.
   * @returns Captured output when requested by the caller.
   */
  playwright(target: string, ...args: (string | number)[]): void {
    this.run(
      [
        this.node,
        join(target, 'node_modules/@playwright/test/cli.js'),
        ...args,
      ],
      { cwd: target },
    );
  }

  /**
   * Runs the global Microsoft Playwright CLI.
   *
   * @param args - CLI arguments.
   * @returns Captured output when requested by the caller.
   */
  playwrightCli(...args: (string | number)[]): void {
    if (!this.playwrightCliBin) throw new Error('Global Playwright CLI is missing');
    this.runGlobal(this.playwrightCliBin, args);
  }

  /**
   * Runs the global Agent Browser executable.
   *
   * @param args - Agent Browser arguments.
   * @returns Captured output when requested by the caller.
   */
  agentBrowserCli(...args: (string | number)[]): void {
    const hasSession = args.some((arg) => {
      const value = String(arg);
      return value === '--session' || value.startsWith('--session=');
    });
    const sessionArgs = hasSession
      ? []
      : [
          '--session',
          AGENT_BROWSER_SESSION,
          ...(AGENT_BROWSER_LAUNCH_ARGS
            ? ['--args', AGENT_BROWSER_LAUNCH_ARGS]
            : []),
        ];
    if (!this.agentBrowser) throw new Error('Global Agent Browser is missing');
    this.runGlobal(this.agentBrowser, [...sessionArgs, ...args], { env: agentBrowserTempEnvironment() });
  }

  /**
   * Ensures the pinned Node LTS is available under the environment root.
   *
   * @returns Managed Node version string.
   */
  async ensureNode(): Promise<string> {
    if (!existsSync(this.node)) {
      throw new Error(`Node is missing at ${this.node}. Set QA_NODE_PATH to a usable Node executable`);
    }
    const version = this.run([this.node, '--version'], { capture: true });
    if (!version) throw new Error(`Unable to determine Node version: ${this.node}`);
    return version;
  }
  /**
   * Installs pinned Bun and pnpm through the managed Node toolchain.
   *
   * @returns Installed runtime versions.
   */
  async ensurePackageManagers(): Promise<{
    bun: string;
    pnpm: string;
  }> {
    if (!this.bunBin) this.installGlobal(`bun@${this.bunVersion}`);
    if (!this.pnpmBin) this.installGlobal(`pnpm@${this.pnpmVersion}`);
    if (!this.bunBin || !this.pnpmBin) throw new Error('Global Bun or pnpm is not discoverable after installation');
    const bun = this.bun(['--version'], { capture: true })?.trim();
    const pnpm = this.pnpm(['--version'], { capture: true })?.trim();
    if (!bun || !pnpm) throw new Error('Could not determine global Bun or pnpm version');
    for (const [name, actual, baseline] of [['bun', bun, this.bunVersion], ['pnpm', pnpm, this.pnpmVersion]]) {
      const actualMajor = /^(\d+)\./u.exec(actual ?? '')?.[1];
      const baselineMajor = /^(\d+)\./u.exec(baseline ?? '')?.[1];
      if (!actualMajor || !baselineMajor || actualMajor !== baselineMajor) {
        console.warn(`${name} version ${actual} differs from the configured baseline ${baseline}; check compatibility`);
      }
    }
    this.recordInstallation('bun', { status: 'ready', source: 'reused', scope: 'system-or-user', path: this.bunBin, version: bun });
    this.recordInstallation('pnpm', { status: 'ready', source: 'reused', scope: 'system-or-user', path: this.pnpmBin, version: pnpm });
    return { bun, pnpm };
  }

  /** Finds CC Switch on PATH, in known application locations, or in shared storage. */
  private findCcSwitch(): string | undefined {
    const command = this.globalTool('cc-switch')
      ?? (process.platform === 'linux' ? this.globalTool('cc-switch.AppImage') : undefined);
    if (command) return command;
    const home = homedir();
    const candidates = process.platform === 'win32'
      ? [
          join(this.environment.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Programs', 'CC Switch'),
          join(this.environment.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Programs', 'cc-switch'),
          ...(this.environment.ProgramFiles ? [join(this.environment.ProgramFiles, 'CC Switch'), join(this.environment.ProgramFiles, 'cc-switch')] : []),
          ...(this.environment['ProgramFiles(x86)'] ? [join(this.environment['ProgramFiles(x86)'] as string, 'CC Switch')] : []),
        ]
      : process.platform === 'darwin'
        ? ['/Applications/CC Switch.app', '/Applications/CC-Switch.app', join(home, 'Applications', 'CC Switch.app'), join(home, 'Applications', 'CC-Switch.app')]
        : ['/opt/cc-switch', '/usr/local/share/cc-switch', '/usr/share/cc-switch', join(home, '.local', 'share', 'applications', 'cc-switch')];
    for (const candidate of candidates) {
      if (!existsSync(candidate)) continue;
      if (process.platform === 'darwin' && candidate.endsWith('.app') && lstatSync(candidate).isDirectory()) return candidate;
      if (lstatSync(candidate).isDirectory()) {
        const entry = findCcSwitchEntry(candidate, process.platform);
        if (entry) return entry;
      }
    }
    return findCcSwitchEntry(this.ccSwitchDir, process.platform);
  }

  /** Reuses an existing CC Switch or installs the reviewed portable asset once. */
  async ensureCcSwitch(): Promise<string> {
    let entry = this.findCcSwitch();
    if (entry) {
      const metadata = this.readJson(join(this.ccSwitchDir, '.qa-cc-switch.json'));
      if (within(resolve(entry), this.ccSwitchDir) && (metadata?.entry !== entry || typeof metadata?.version !== 'string')
        && existsSync(join(this.ccSwitchDir, '.qa-cc-switch-pending.json'))) {
        throw new Error(`CC Switch installation was interrupted after publication; preserve and inspect ${this.ccSwitchDir} before retrying`);
      }
      const owned = within(resolve(entry), this.ccSwitchDir) && metadata?.entry === entry;
      const version = owned && typeof metadata?.version === 'string' ? metadata.version : 'unknown';
      this.state.cc_switch_installation = { scope: owned ? 'user' : 'system-or-user', source: owned ? 'qa' : 'reused', path: entry, version };
      this.recordInstallation('cc-switch', { status: 'ready', ...this.objectValue(this.state.cc_switch_installation) });
      this.writeCcSwitchWrapper(entry);
      console.log(`Reusing CC Switch: ${entry}`);
      return version;
    }
    const manifest = this.readJson(this.ccSwitchManifest) as CcSwitchManifest | undefined;
    if (!manifest || manifest.id !== 'cc-switch' || manifest.version !== this.ccSwitchVersion || manifest.source_type !== 'external') {
      throw new Error('CC Switch manifest is missing or does not match the configured version');
    }
    const arch = process.platform === 'darwin' ? 'universal' : process.arch;
    const asset = manifest.assets.find(item => item.platform === process.platform && item.arch === arch);
    if (!asset) throw new Error(`CC Switch has no portable asset for ${process.platform}/${process.arch}`);
    const archive = join(this.root, 'cache', 'downloads', asset.file);
    if (!existsSync(archive) || digest(archive) !== asset.sha256) {
      console.log(`Downloading CC Switch: ${manifest.download_base}/${asset.file} -> ${archive}`);
      await download(`${manifest.download_base}/${asset.file}`, archive);
    }
    if (digest(archive) !== asset.sha256) throw new Error(`CC Switch SHA256 mismatch: ${asset.file}`);
    console.log(`Installing CC Switch into shared user directory: ${this.ccSwitchDir}`);
    mkdirSync(dirname(this.ccSwitchDir), { recursive: true });
    const pendingFile = join(this.ccSwitchDir, '.qa-cc-switch-pending.json');
    if (existsSync(this.ccSwitchDir)) {
      const pending = this.readJson(pendingFile);
      const record = this.objectValue(this.objectValue(this.state.installations)['cc-switch']);
      if (lstatSync(this.ccSwitchDir).isSymbolicLink() || pending?.root !== this.root
        || pending?.sha256 !== asset.sha256 || record.status !== 'pending'
        || record.path !== this.ccSwitchDir || readdirSync(this.ccSwitchDir).some(name => name !== basename(pendingFile))) {
        throw new Error(`CC Switch shared directory already exists and will be preserved: ${this.ccSwitchDir}`);
      }
    }
    // Extraction uses a unique sibling so interrupted unpacking cannot appear installed.
    const staging = mkdtempSync(join(dirname(this.ccSwitchDir), '.qa-cc-switch-stage-'));
    this.recordInstallation('cc-switch', { status: 'pending', source: 'unknown', scope: 'user', path: this.ccSwitchDir, staging, version: manifest.version });
    if (asset.format === 'appimage') {
      const target = join(staging, 'cc-switch.AppImage');
      copyFileSync(archive, target);
      chmodSync(target, 0o755);
    } else {
      extractArchive(archive, staging);
    }
    entry = findCcSwitchEntry(staging, process.platform);
    if (!entry) throw new Error(`CC Switch executable was not found; staging directory preserved: ${staging}`);
    const relativeEntry = relative(staging, entry);
    if (!existsSync(this.ccSwitchDir)) {
      // Exclusive creation prevents replacing another installation.
      mkdirSync(this.ccSwitchDir);
      atomicJson(pendingFile, { root: this.root, sha256: asset.sha256 });
    }
    const pending = this.readJson(pendingFile);
    if (pending?.root !== this.root || pending?.sha256 !== asset.sha256
      || readdirSync(this.ccSwitchDir).some(name => name !== basename(pendingFile))) {
      throw new Error(`CC Switch shared directory changed and will be preserved: ${this.ccSwitchDir}`);
    }
    renameSync(staging, join(this.ccSwitchDir, 'payload'));
    entry = join(this.ccSwitchDir, 'payload', relativeEntry);
    atomicJson(join(this.ccSwitchDir, '.qa-cc-switch.json'), { entry, version: manifest.version });
    this.state.cc_switch_installation = { scope: 'user', source: 'qa', path: entry, version: manifest.version };
    this.recordInstallation('cc-switch', { status: 'ready', ...this.objectValue(this.state.cc_switch_installation) });
    this.writeCcSwitchWrapper(entry);
    return manifest.version;
  }

  /** Launches the same CC Switch executable found by initialization and checks. */
  ccSwitchCli(...args: string[]): void {
    const entry = this.findCcSwitch();
    if (!entry) throw new Error('CC Switch is not installed; run qa env init <language>');
    const command = process.platform === 'darwin' && entry.endsWith('.app')
      ? ['open', '-a', entry, '--args', ...args] : [entry, ...args];
    const executable = command[0];
    if (!executable) throw new Error('CC Switch executable path is empty');
    const isShim = WINDOWS && /\.(cmd|bat)$/i.test(executable);
    if (isShim && command.some(part => /["%\r\n]/.test(part))) {
      throw new Error('CC Switch command contains unsupported Windows characters');
    }
    const shimCommand = isShim ? command.map(part => `"${part}"`).join(' ') : '';
    const child = isShim
      ? spawn(this.environment.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${shimCommand}"`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true })
      : spawn(executable, command.slice(1), { detached: true, stdio: 'ignore' });
    child.on('error', error => console.error(`Unable to launch CC Switch: ${error.message}`));
    child.unref();
  }
  private writeCcSwitchWrapper(_entry: string): void {
    const bin = join(this.root, 'bin');
    const wrapper = join(bin, WINDOWS ? 'cc-switch.cmd' : 'cc-switch');
    const marker = 'qa-ai-playwright managed cc-switch wrapper';
    if (existsSync(wrapper) && !readFileSync(wrapper, 'utf8').includes(marker)) {
      console.log(`Preserving existing CC Switch wrapper: ${wrapper}`);
      return;
    }
    mkdirSync(bin, { recursive: true });
    const cli = join(this.repo, 'packages/qa-cli/qa-cli.ts');
    if (WINDOWS) {
      writeFileSync(wrapper, `@echo off\r\nrem ${marker}\r\nrem Shortcut to the detected CC Switch application; this file is not the application.\r\nstart "" "${this.node}" --experimental-strip-types "${cli}" --root "${this.root}" run cc-switch %*\r\n`, 'utf8');
      return;
    }
    writeFileSync(wrapper, `#!/usr/bin/env bash\n# ${marker}\n# Shortcut to the detected CC Switch application; this file is not the application.\nexec ${shellQuote(this.node)} --experimental-strip-types ${shellQuote(cli)} --root ${shellQuote(this.root)} run cc-switch "$@"\n`, 'utf8');
    chmodSync(wrapper, 0o755);
  }
  /**
   * Ensures the pinned uv bootstrap executable is locally available.
   *
   * @returns Installed uv version string.
   */
  async ensureUv(): Promise<string> {
    try {
      if (lstatSync(this.uv).isSymbolicLink()) throw new Error('Managed uv path is a link; preserve it and inspect manually');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (existsSync(this.uv)) {
      const recordedHash = this.state.uv_sha256;
      if (recordedHash !== undefined && (typeof recordedHash !== 'string' || !/^[a-f0-9]{64}$/u.test(recordedHash) || digest(this.uv) !== recordedHash)) {
        throw new Error('Cannot use uv: ownership hash is mismatched. Back up and move the existing uv manually, then rerun env init.');
      }
      try {
        const current =
          this.run([this.uv, '--version'], { capture: true }) ?? '';
        if (this.uvVersionMatches(current)) {
          return current;
        }
      } catch {
        // Preserve an existing executable when its version cannot be verified.
      }
      if (typeof recordedHash !== 'string' || !/^[a-f0-9]{64}$/u.test(recordedHash) || digest(this.uv) !== recordedHash) {
        throw new Error('Cannot replace uv: ownership hash is missing or mismatched. Back up and move the existing uv manually, then rerun env init.');
      }
      throw new Error('Installed uv differs from the configured version or cannot be verified; use qa env plan uv, update it manually, then run qa env check');
    }
    if (!/^(latest|\d+\.\d+\.\d+)$/.test(this.uvVersion)) {
      throw new Error('Invalid QA_UV_VERSION');
    }

    const architectures: Record<string, string> = {
      x64: 'x86_64',
      arm64: 'aarch64',
    };
    const platforms: Record<string, string> = {
      win32: 'pc-windows-msvc',
      darwin: 'apple-darwin',
      linux: 'unknown-linux-gnu',
    };
    const arch = architectures[process.arch];
    const platform = platforms[process.platform];
    if (!arch || !platform) {
      throw new Error('Unsupported uv platform');
    }

    const base =
      this.uvVersion === 'latest'
        ? 'https://github.com/astral-sh/uv/releases/latest/download'
        : `https://github.com/astral-sh/uv/releases/download/${this.uvVersion}`;
    const name = `uv-${arch}-${platform}.${WINDOWS ? 'zip' : 'tar.gz'}`;
    const bootstrap = join(this.root, 'bootstrap');
    const archive = join(bootstrap, name);
    await download(`${base}/${name}`, archive);

    const checksumFile = `${archive}.sha256`;
    await download(`${base}/${name}.sha256`, checksumFile);
    const expected = readFileSync(checksumFile, 'utf8').trim().split(/\s+/u)[0];
    if (!expected || !/^[a-fA-F0-9]{64}$/.test(expected)) {
      throw new Error('Invalid uv checksum');
    }
    if (digest(archive) !== expected.toLowerCase()) {
      throw new Error('uv checksum mismatch');
    }
    extractArchive(archive, bootstrap, WINDOWS ? 0 : 1);
    if (!existsSync(this.uv)) {
      throw new Error('uv executable is missing from its archive');
    }
    if (!WINDOWS) {
      chmodSync(this.uv, 0o755);
    }
    const current = this.run([this.uv, '--version'], { capture: true }) ?? '';
    if (!this.uvVersionMatches(current)) {
      throw new Error(
        `Expected uv ${this.uvVersion}; got ${current.trim() || 'missing'}`,
      );
    }
    this.recordUvOwnership();
    return current;
  }

  /** Persist the verified executable before later initialization steps can fail. */
  recordUvOwnership(): void {
    this.state.uv_sha256 = digest(this.uv);
    this.save();
  }

  /** Returns whether a uv version output matches the pinned policy. */
  private uvVersionMatches(output: string): boolean {
    if (this.uvVersion === 'latest') {
      return /^uv \d+\.\d+\.\d+/u.test(output);
    }
    const version = `uv ${this.uvVersion}`;
    return output === version || output.startsWith(`${version} `);
  }

  /**
   * Installs the requested managed Python series through uv.
   *
   * @returns Managed Python interpreter path.
   */
  async ensurePython(): Promise<string> {
    await this.ensureUv();
    this.run([
      this.uv,
      '--no-config',
      'python',
      'install',
      this.pythonVersion,
      '--no-progress',
    ]);
    const found =
      this.run(
        [
          this.uv,
          '--no-config',
          'python',
          'find',
          '--managed-python',
          this.pythonVersion,
        ],
        { capture: true },
      ) ?? '';
    const python = found
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1);
    if (!python || !within(python, this.root) || !existsSync(python)) {
      throw new Error('Managed Python path is missing or outside the root');
    }
    const record = join(this.root, 'bootstrap', 'python-path.txt');
    mkdirSync(dirname(record), { recursive: true });
    writeFileSync(record, `${python}\n`, 'utf8');
    return python;
  }

  /**
   * Finds Playwright Chromium shared with Agent Browser.
   *
   * @returns Executable path when installed.
   */
  playwrightChromiumExecutable(): string | undefined {
    const browsers = join(this.root, 'cache', 'browsers');
    if (!existsSync(browsers)) {
      return undefined;
    }
    for (const entry of readdirSync(browsers, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('chromium-')) {
        continue;
      }
      const executable = findChromium(join(browsers, entry.name));
      if (executable) {
        return executable;
      }
    }
    return undefined;
  }

  /** Select a system browser first, then the environment's Chromium. */
  findBrowser(channel?: SelectedBrowser['channel']): SelectedBrowser | undefined {
    const path = this.environment.QA_BROWSER_EXECUTABLE_PATH;
    const configured = this.environment.QA_BROWSER_CHANNEL;
    const configuredChannel = configured === undefined || configured === '' ? 'chromium' : configured;
    if (path && (!channel || channel === configuredChannel)) {
      if ((configuredChannel !== 'chrome' && configuredChannel !== 'msedge' && configuredChannel !== 'chromium') || !isAbsolute(path)) return undefined;
      try {
        const info = lstatSync(path);
        if (!info.isFile() && !info.isSymbolicLink()) return undefined;
        accessSync(path, WINDOWS ? constants.F_OK : constants.X_OK);
        return { channel: configuredChannel, path, scope: 'system-or-user' };
      } catch { return undefined; }
    }
    if (!channel && this.environment.QA_BROWSER_CHANNEL !== undefined) {
      const configured = this.environment.QA_BROWSER_CHANNEL;
      if (configured === '') channel = 'chromium';
      else if (configured === 'chrome' || configured === 'msedge') channel = configured;
      else return undefined;
    }
    if (!(channel === 'chromium' && configured === '' && !path)) {
      const system = findSystemBrowser(this.environment, channel);
      if (system) return system;
      if (channel && channel !== 'chromium') return undefined;
    }
    const chromium = this.playwrightChromiumExecutable();
    return chromium ? { channel: 'chromium', path: chromium, scope: 'environment' } : undefined;
  }

  /**
   * Ensures the global Microsoft Playwright CLI is available.
   *
   * @returns Installed package version.
   */
  async ensurePlaywrightCli(): Promise<string> {
    if (!this.playwrightCliBin && !this.playwrightCliPackage) {
      this.installGlobal(`@playwright/cli@${this.playwrightCliVersion}`, 'playwright-cli', '@playwright/cli');
    }
    const version = this.globalPackageVersion(this.playwrightCliPackage);
    if (!this.playwrightCliBin || !version) {
      throw new Error('Global Playwright CLI exists but its executable or package metadata is unavailable');
    }
    this.recordInstallation('@playwright/cli', { status: 'ready', source: 'reused', scope: 'system-or-user', path: this.playwrightCliBin, package_path: this.playwrightCliPackage, version });
    return version;
  }

  /**
   * Ensures the global Vercel Agent Browser package is available.
   *
   * @returns Installed package version.
   */
  async ensureAgentBrowser(): Promise<string> {
    if (!this.agentBrowser && !this.agentBrowserPackage) {
      this.installGlobal(`agent-browser@${this.agentBrowserVersion}`, 'agent-browser', 'agent-browser');
    }
    const version = this.globalPackageVersion(this.agentBrowserPackage);
    if (!this.agentBrowser || !version) {
      throw new Error('Global Agent Browser exists but its executable or package metadata is unavailable');
    }
    this.recordInstallation('agent-browser', { status: 'ready', source: 'reused', scope: 'system-or-user', path: this.agentBrowser, package_path: this.agentBrowserPackage, version });
    return version;
  }

  /**
   * Returns the expected environment-local Agent Browser MCP server.
   *
   * @returns Validated server configuration.
   */
  agentBrowserMcpServer(): McpServerConfig {
    if (!this.agentBrowserPackage) throw new Error('Global Agent Browser package metadata is unavailable');
    const entry = join(
      this.agentBrowserPackage,
      'bin/agent-browser.js',
    );
    const browser = this.findBrowser();
    if (!existsSync(entry) || !browser) {
      throw new Error(
        'Agent Browser MCP needs its CLI entry and an available browser',
      );
    }
    return {
      command: this.node,
      args: [
        entry,
        '--session',
        AGENT_BROWSER_SESSION,
        ...(AGENT_BROWSER_LAUNCH_ARGS
          ? ['--args', AGENT_BROWSER_LAUNCH_ARGS]
          : []),
        'mcp',
      ],
      env: {
        ...agentBrowserTempEnvironment(),
        AGENT_BROWSER_SOCKET_DIR: join(
          this.root,
          AGENT_BROWSER_SOCKET_DIR,
        ),
        AGENT_BROWSER_SCREENSHOT_DIR: join(
          this.root,
          'agent-browser-output',
        ),
        AGENT_BROWSER_DOWNLOAD_PATH: join(
          this.root,
          'agent-browser-downloads',
        ),
        AGENT_BROWSER_FLOWS_DIR: join(this.root, 'agent-browser-flows'),
        AGENT_BROWSER_CONFIG: join(
          this.root,
          'agent-browser-config.json',
        ),
        AGENT_BROWSER_EXECUTABLE_PATH: browser.path,
      },
    };
  }

  /**
   * Registers Agent Browser MCP in the environment-local Codex config.
   *
   * @returns Installed Agent Browser version.
   */
  configureAgentBrowserMcp(): string {
    const version = this.requirePackageVersion(join(this.agentBrowserPackage, 'package.json'));
    this.registerMcp('agent-browser', this.agentBrowserMcpServer(), 'external', version);
    return version;
  }

  /**
   * Returns the names of on-demand MCP servers shipped in the repository.
   *
   * @returns Optional MCP names, sorted by name.
   */
  optionalMcpNames(): string[] {
    const directory = join(this.repo, 'packages/mcp/external');
    if (!existsSync(directory)) {
      return [];
    }
    return readdirSync(directory)
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.slice(0, -'.json'.length))
      .filter((name) => {
        const manifest = mcpManifest(name, 'external', this.repo);
        return manifest.optional === true;
      })
      .sort();
  }

  /** Inspects one optional MCP without installing tools or changing configuration. */
  optionalMcpStatus(name: string): OptionalMcpStatus {
    const manifest = mcpManifest(name, 'external', this.repo);
    if (manifest.optional !== true) throw new Error(`MCP ${name} is not an on-demand server`);
    const serverName = this.mcpName(name);
    const servers = this.objectValue(this.readSharedMcpLock().servers);
    const record = this.objectValue(servers[serverName]);
    const present = this.hasMcpConfig(serverName);
    const hasRecord = Object.keys(record).length > 0;
    const ownsRecord = record.scope === 'user' && record.root === this.root && record.name === name
      && record.package === manifest.package && record.source_type === 'external';
    const unchanged = present && ownsRecord && typeof record.snapshot === 'string' && !!record.snapshot
      && record.snapshot === this.mcpConfigSnapshot(serverName)
      && this.sameMcpConfig(readMcpServerConfig(this.mcpConfig, serverName), this.objectValue(record.config) as McpServerConfig);
    const ownership: OptionalMcpStatus['ownership'] = unchanged ? 'owned'
      : ownsRecord ? 'modified' : present || hasRecord ? 'unowned' : 'none';

    const packageName = String(manifest.package);
    const bin = typeof this.state.global_npm_bin === 'string' ? this.state.global_npm_bin : '';
    const candidates = !bin ? [] : WINDOWS ? [join(bin, 'node_modules', packageName)]
      : [join(bin, '..', 'lib', 'node_modules', packageName), join(bin, '..', 'node_modules', packageName)];
    const directory = this.globalPackage(packageName)
      || candidates.find((candidate) => !within(resolve(candidate), this.root) && existsSync(candidate)) || '';
    const knownPrefix = !!bin;
    let packageStatus: OptionalMcpStatus['package'] = { name: packageName, status: knownPrefix ? 'missing' : 'unknown' };
    if (directory) {
      const metadata = this.readJson(join(directory, 'package.json'));
      const version = this.globalPackageVersion(directory);
      const relativeEntry = typeof manifest.entry === 'string' ? manifest.entry : '';
      const entry = resolve(directory, relativeEntry);
      const available = metadata?.name === packageName && !!version && !!relativeEntry
        && within(entry, directory) && existsSync(entry);
      packageStatus = { name: packageName, status: available ? 'available' : 'broken', path: directory, ...(version ? { version } : {}) };
    }
    const registration = !present ? 'absent' : this.hasSpecificMcpConfig(serverName) ? 'present' : 'unknown';
    return { name, serverName, registration, ownership, package: packageStatus };
  }

  /** Lists status for each optional MCP in the delivered manifest. */
  optionalMcpStatuses(): OptionalMcpStatus[] {
    return this.optionalMcpNames().map((name) => this.optionalMcpStatus(name));
  }

  /**
   * Installs one on-demand npm MCP server into the environment.
   *
   * @param name - Optional MCP name.
   * @returns Installed package version.
   */
  installOptionalMcp(name: string): string {
    this.requireInitialized();
    const manifest = mcpManifest(name, 'external', this.repo);
    if (manifest.optional !== true) throw new Error(`MCP ${name} is not an on-demand server`);
    const pkg = String(manifest.package);
    const requested = String(manifest.version);
    this.discoverGlobalNpmBin();
    let packageDir = this.globalPackage(pkg);
    if (!packageDir) {
      this.installGlobal(`${pkg}@${requested}`, undefined, pkg);
      packageDir = this.globalPackage(pkg);
    }
    const installed = this.globalPackageVersion(packageDir);
    const relativeEntry = String(manifest.entry ?? '');
    const entry = resolve(packageDir || '.', relativeEntry);
    if (!installed || !packageDir || !relativeEntry || !within(entry, packageDir) || !existsSync(entry)) {
      throw new Error(`Global MCP package ${pkg} exists but its metadata or entrypoint is unavailable`);
    }
    const args = Array.isArray(manifest.args) ? manifest.args as string[] : [];
    this.registerMcp(name, { command: this.node, args: [entry, ...args] }, 'external', installed);
    return installed;
  }

  /** Restores missing components of an owned optional MCP without upgrading shared software. */
  repairOptionalMcp(name: string): string {
    this.requireInitialized();
    const status = this.optionalMcpStatus(name);
    const manifest = mcpManifest(name, 'external', this.repo);
    const servers = this.objectValue(this.readSharedMcpLock().servers);
    const record = this.objectValue(servers[status.serverName]);
    const config = this.objectValue(record.config) as McpServerConfig;
    const version = typeof record.version === 'string' ? record.version : '';
    if (record.scope !== 'user' || record.root !== this.root || record.name !== name
      || record.source_type !== 'external' || record.package !== manifest.package
      || record.manifest !== `packages/mcp/external/${name}.json` || typeof record.snapshot !== 'string' || !record.snapshot
      || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
      throw new Error(`Cannot repair MCP ${name}: ownership record is missing or incomplete`);
    }
    if (status.registration === 'unknown' || (status.registration === 'present' && status.ownership !== 'owned')) {
      throw new Error(`Cannot repair MCP ${name}: registration ownership or contents cannot be verified`);
    }
    if (status.package.status === 'unknown' || status.package.status === 'broken') {
      throw new Error(`Cannot repair MCP ${name}: shared package is ${status.package.status}`);
    }
    if (status.package.status === 'available' && status.package.version !== version) {
      throw new Error(`Cannot repair MCP ${name}: shared package version differs from its ownership record`);
    }
    const bin = String(this.state.global_npm_bin);
    const packageDir = status.package.path ?? (WINDOWS
      ? join(bin, 'node_modules', String(manifest.package))
      : join(bin, '..', 'lib', 'node_modules', String(manifest.package)));
    const relativeEntry = typeof manifest.entry === 'string' ? manifest.entry : '';
    const entry = resolve(packageDir, relativeEntry);
    const args = Array.isArray(manifest.args) ? manifest.args as string[] : [];
    const expected: McpServerConfig = { command: this.node, args: [entry, ...args] };
    if (!relativeEntry || !within(entry, resolve(packageDir)) || !this.sameMcpConfig(config, expected)) {
      throw new Error(`Cannot repair MCP ${name}: recorded configuration differs from the current manifest`);
    }
    if (status.package.status === 'missing') {
      const priorBin = bin;
      const actualBin = this.discoverGlobalNpmBin();
      if (!actualBin || resolve(actualBin) !== resolve(priorBin)) {
        this.state.global_npm_bin = priorBin;
        throw new Error(`Cannot repair MCP ${name}: npm global prefix differs from its recorded location`);
      }
      this.installGlobal(`${String(manifest.package)}@${version}`, undefined, String(manifest.package));
      const repaired = this.optionalMcpStatus(name).package;
      if (repaired.status !== 'available' || repaired.version !== version) {
        throw new Error(`Cannot repair MCP ${name}: the installed package could not be verified`);
      }
    }
    this.registerMcp(name, expected, 'external', version);
    return version;
  }
  /**
   * Removes one owned on-demand MCP registration, preserving its shared package.
   *
   * @param name - Optional MCP name.
   */
  removeOptionalMcp(name: string): void {
    const manifest = mcpManifest(name, 'external', this.repo);
    if (manifest.optional !== true) throw new Error(`MCP ${name} is not an on-demand server`);
    this.withMcpLock(() => {
      const lock = this.readSharedMcpLock();
      const servers = this.objectValue(lock.servers);
      const serverName = this.mcpName(name);
      const record = this.objectValue(servers[serverName]);
      if (record.scope !== 'user' || record.root !== this.root || record.package !== manifest.package || record.source_type !== 'external') {
        throw new Error(`Preserving MCP ${serverName}: no matching QA installation record`);
      }
      const current = readMcpServerConfig(this.mcpConfig, serverName);
      const expected = this.objectValue(record.config) as McpServerConfig;
      if (this.hasMcpConfig(serverName)) {
        if (!this.sameMcpConfig(current, expected) || record.snapshot !== this.mcpConfigSnapshot(serverName)) throw new Error(`Preserving MCP ${serverName}: registration differs from the QA record`);
        this.codex(['mcp', 'remove', serverName]);
        if (this.hasMcpConfig(serverName)) throw new Error(`MCP ${serverName} is still present after removal`);
      }
      delete servers[serverName];
      lock.servers = servers;
      atomicJson(this.sharedMcpLockPath(), lock);
      console.log(`Preserving shared MCP package ${String(manifest.package)}`);
    });
  }
  /**
   * Removes unchanged user-level MCP registrations owned by this root.
   * Shared packages and registrations belonging to other roots are preserved.
   * Each successful removal is recorded before attempting the next one.
   *
   * @returns Removed, already absent, preserved, and failed registrations.
   */
  removeSharedMcpRegistrations(): SharedMcpRemovalResult {
    const result: SharedMcpRemovalResult = { removed: [], absent: [], preserved: [], failed: [] };
    try {
      this.withMcpLock(() => {
        const lock = this.readSharedMcpLock();
        const servers = this.objectValue(lock.servers);
        const entries = Object.entries(servers).filter(([, value]) => {
          const record = this.objectValue(value);
          return record.scope === 'user' && record.root === this.root;
        });
        for (const [index, [serverName, value]] of entries.entries()) {
          const record = this.objectValue(value);
          if (typeof record.name !== 'string' || this.mcpName(record.name) !== serverName || !record.snapshot) {
            result.preserved.push({ name: serverName, reason: 'Invalid or incomplete ownership record' });
            continue;
          }
          try {
            const present = this.hasMcpConfig(serverName);
            if (present) {
              const expected = this.objectValue(record.config) as McpServerConfig;
              const current = readMcpServerConfig(this.mcpConfig, serverName);
              if (!this.sameMcpConfig(current, expected) || record.snapshot !== this.mcpConfigSnapshot(serverName)) {
                result.preserved.push({ name: serverName, reason: 'Registration differs from the ownership record' });
                continue;
              }
              this.codex(['mcp', 'remove', serverName]);
              if (this.hasMcpConfig(serverName)) throw new Error('Registration is still present after removal');
            }
            // Persist each successful removal separately so a later failure is recoverable.
            delete servers[serverName];
            lock.servers = servers;
            try {
              atomicJson(this.sharedMcpLockPath(), lock);
            } catch (error) {
              servers[serverName] = value;
              result.failed.push({ name: serverName, reason: `Registration may have been removed but its lock could not be updated: ${String(error)}` });
              for (const [pending] of entries.slice(index + 1)) result.failed.push({ name: pending, reason: 'Not attempted after lock update failure' });
              break;
            }
            (present ? result.removed : result.absent).push(serverName);
          } catch (error) {
            result.failed.push({ name: serverName, reason: String(error) });
          }
        }
      });
    } catch (error) {
      result.failed.push({ name: '(shared MCP lock)', reason: String(error) });
    }
    return result;
  }

  /**
   * Lists discovered executable and package paths without running commands.
   * Source is unknown unless an ownership record establishes it.
   *
   * @returns Tools found by the current environment's discovery rules.
   */
  listDiscoveredTools(): DiscoveredTool[] {
    const tools: DiscoveredTool[] = [];
    const add = (name: string, path: string | undefined, version?: string): void => {
      if (!path || !existsSync(path)) return;
      tools.push({ name, path, scope: within(resolve(path), this.root) ? 'environment' : 'system-or-user', source: 'unknown', ...(version ? { version } : {}) });
    };
    add('node', this.node);
    add('npm', this.globalTool('npm'));
    add('bun', this.bunBin);
    add('pnpm', this.pnpmBin);
    add('codex', this.codexBin);
    const cc = this.findCcSwitch();
    if (cc) {
      const metadata = this.readJson(join(this.ccSwitchDir, '.qa-cc-switch.json'));
      const owned = within(resolve(cc), this.ccSwitchDir) && metadata?.entry === cc;
      tools.push({ name: 'cc-switch', path: cc, scope: 'system-or-user', source: owned ? 'qa' : 'unknown', ...(owned && typeof metadata?.version === 'string' ? { version: metadata.version } : {}) });
    }
    add('playwright-cli', this.playwrightCliBin, this.globalPackageVersion(this.playwrightCliPackage));
    add('playwright-mcp', this.playwrightMcpPackage, this.globalPackageVersion(this.playwrightMcpPackage));
    add('agent-browser', this.agentBrowser, this.globalPackageVersion(this.agentBrowserPackage));
    add('uv', this.uv);
    add('python', this.pythonPath());
    for (const name of this.optionalMcpNames()) {
      const manifest = mcpManifest(name, 'external', this.repo);
      const directory = this.globalPackage(String(manifest.package));
      add(`mcp:${name}`, directory, this.globalPackageVersion(directory));
    }
    return tools;
  }
  /**
   * Ensures the global official Playwright MCP package is available.
   *
   * @returns Installed MCP package version.
   */
  async ensurePlaywrightMcp(): Promise<string> {
    if (!this.playwrightMcpPackage && !this.globalTool('playwright-mcp')) {
      this.installGlobal(`@playwright/mcp@${this.playwrightMcpVersion}`, 'playwright-mcp', '@playwright/mcp');
    }
    const installed = this.globalPackageVersion(this.playwrightMcpPackage);
    const entry = join(this.playwrightMcpPackage, 'cli.js');
    if (!installed || !this.playwrightMcpPackage || !existsSync(entry)) {
      throw new Error('Global Playwright MCP exists but its package metadata or entrypoint is unavailable');
    }
    this.recordInstallation('@playwright/mcp', { status: 'ready', source: 'reused', scope: 'system-or-user', path: this.globalTool('playwright-mcp') ?? this.playwrightMcpPackage, package_path: this.playwrightMcpPackage, version: installed });
    let browser = this.findBrowser();
    if (!browser) {
      const preferred = this.environment.QA_BROWSER_CHANNEL;
      if (preferred || this.environment.QA_BROWSER_EXECUTABLE_PATH) {
        throw new Error(`Requested browser channel or executable was not found or is invalid; check QA_BROWSER_CHANNEL and QA_BROWSER_EXECUTABLE_PATH`);
      }
      this.recordInstallation('chromium', { status: 'pending', source: 'unknown', scope: 'environment', path: join(this.root, 'cache', 'browsers') });
      console.log('No existing Chrome, Edge, or Chromium found; installing environment Chromium.');
      this.run([this.node, entry, 'install-browser', 'chromium']);
      browser = this.findBrowser('chromium');
      if (!browser) throw new Error('Playwright Chromium installation is incomplete');
      this.recordInstallation('chromium', { status: 'ready', source: 'qa', scope: 'environment', path: browser.path, version: 'unknown' });
    } else {
      this.recordInstallation(browser.channel, { status: 'ready', source: 'reused', scope: browser.scope, path: browser.path, version: 'unknown' });
    }
    try {
      this.registerMcp('playwright', this.playwrightMcpServer(entry), 'external', installed);
    } catch (error) {
      if (error instanceof Error && /already exists or differs|conflicting QA ownership record/u.test(error.message)) {
        throw new Error(`${error.message}. Inspect the registration and ownership. If it belongs to this environment and is unmodified, run qa env uninstall and repeat env init with the original options.`);
      }
      throw error;
    }
    return installed;
  }

  /**
   * Returns the isolated standard-input Playwright MCP configuration.
   *
   * @param entry - Playwright MCP JavaScript entrypoint.
   * @returns Expected server configuration.
   */
  playwrightMcpServer(entry: string): McpServerConfig {
    const browser = this.findBrowser();
    return {
      command: this.node,
      env: { PLAYWRIGHT_BROWSERS_PATH: join(this.root, 'cache/browsers') },
      args: [
        entry,
        '--headless',
        '--browser',
        'chromium',
        ...(browser ? ['--executable-path', browser.path] : []),
        '--isolated',
        '--output-dir',
        join(this.root, 'mcp-output'),
      ],
    };
  }

  /**
   * Creates or preserves one environment-local MCP registration.
   *
   * @param name - Server name.
   * @param expected - Required command, arguments and environment.
   * @param sourceType - Reviewed source group.
   * @param version - Expected package version.
   */
  /** Gives each QA root its own stable names in the shared Codex configuration. */
  private mcpName(name: string): string {
    const root = WINDOWS ? this.root.toLowerCase() : this.root;
    const id = createHash('sha256').update(root).digest('hex').slice(0, 16);
    return `qa-${id}-${name}`;
  }

  private sharedMcpLockPath(): string {
    return join(dirname(this.mcpConfig), 'qa-ai-playwright-mcp.lock.json');
  }

  /** Refuses to replace an invalid ownership record. */
  private readSharedMcpLock(): Record<string, unknown> {
    const path = this.sharedMcpLockPath();
    if (!existsSync(path)) return { schema: 1, servers: {} };
    const lock = this.readJson(path);
    if (!lock || lock.schema !== 1 || !lock.servers || typeof lock.servers !== 'object' || Array.isArray(lock.servers)) {
      throw new Error(`Invalid MCP ownership lock; preserve and repair it manually: ${path}`);
    }
    return lock;
  }

  /** Serializes QA registration changes across environments sharing CODEX_HOME. */
  private withMcpLock<T>(action: () => T): T {
    const home = dirname(this.mcpConfig);
    mkdirSync(home, { recursive: true });
    const guard = join(home, '.qa-ai-playwright-mcp.guard');
    try { mkdirSync(guard); } catch {
      throw new Error(`MCP configuration is busy or its guard needs manual inspection: ${guard}`);
    }
    try { return action(); } finally { rmdirSync(guard); }
  }

  /** Detects an existing server even if its transport is not a command. */
  private hasSpecificMcpConfig(name: string): boolean {
    if (!existsSync(this.mcpConfig)) return false;
    const text = readFileSync(this.mcpConfig, 'utf8');
    const table = new RegExp(`^\\s*(?:\\[+\\s*["']?mcp_servers["']?\\s*\\.\\s*["']?${name}["']?\\s*(?:\\.|\\])|["']?mcp_servers["']?\\s*\\.\\s*["']?${name}["']?\\s*[.=])`, 'm');
    return table.test(text);
  }

  private hasMcpConfig(name: string): boolean {
    if (this.hasSpecificMcpConfig(name)) return true;
    if (!existsSync(this.mcpConfig)) return false;
    const text = readFileSync(this.mcpConfig, 'utf8');
    return /^\s*(?:["']?mcp_servers["']?\s*=|\[\s*["']?mcp_servers["']?\s*\])/m.test(text);
  }

  /** Captures the complete server tables so edits to unparsed fields are preserved. */
  private mcpConfigSnapshot(name: string): string {
    if (!existsSync(this.mcpConfig)) return '';
    const sections: string[] = [];
    let selected = false;
    const section = new RegExp(`^\\[\\s*mcp_servers\\.${name}(?:\\.[^\\]]+)?\\s*\\]\\s*(?:#.*)?$`);
    let array = false;
    for (const line of readFileSync(this.mcpConfig, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!array && /^\[[^\]]+\](?:\s*#.*)?$/.test(trimmed)) selected = section.test(trimmed);
      if (selected) sections.push(line);
      if (array && trimmed.includes(']')) array = false;
      else if (!array && /^[\w-]+\s*=\s*\[/.test(trimmed) && !trimmed.includes(']')) array = true;
    }
    return sections.join('\n').trim();
  }
  private sameMcpConfig(left: McpServerConfig, right: McpServerConfig): boolean {
    const keys = (env: Record<string, string> | undefined): string =>
      JSON.stringify(Object.entries(env ?? {}).sort(([a], [b]) => a.localeCompare(b)));
    return !!left.command && left.command === right.command
      && JSON.stringify(left.args ?? []) === JSON.stringify(right.args ?? [])
      && keys(left.env) === keys(right.env);
  }

  /** Restricts automatic re-registration to the selected browser executable. */
  private browserPathOnlyChange(name: string, previous: McpServerConfig, expected: McpServerConfig): boolean {
    if (name === 'playwright') {
      const oldArgs = [...(previous.args ?? [])];
      const newArgs = [...(expected.args ?? [])];
      const oldIndex = oldArgs.indexOf('--executable-path');
      const newIndex = newArgs.indexOf('--executable-path');
      if (oldIndex < 0 && newIndex >= 0 && newArgs.lastIndexOf('--executable-path') === newIndex && newArgs[newIndex + 1]) {
        newArgs.splice(newIndex, 2);
        return this.sameMcpConfig(previous, { ...expected, args: newArgs });
      }
      if (oldIndex < 0 || oldIndex !== newIndex || oldArgs.lastIndexOf('--executable-path') !== oldIndex
        || newArgs.lastIndexOf('--executable-path') !== newIndex || !oldArgs[oldIndex + 1] || !newArgs[newIndex + 1]) return false;
      oldArgs[oldIndex + 1] = newArgs[newIndex + 1] ?? '';
      return this.sameMcpConfig({ ...previous, args: oldArgs }, expected);
    }
    if (name === 'agent-browser') {
      const key = 'AGENT_BROWSER_EXECUTABLE_PATH';
      const nextPath = expected.env?.[key];
      if (!nextPath) return false;
      return this.sameMcpConfig({ ...previous, env: { ...previous.env, [key]: nextPath } }, expected);
    }
    return false;
  }

  registerMcp(name: string, expected: McpServerConfig, sourceType: SkillSource, version: string): void {
    const manifest = mcpManifest(name, sourceType, this.repo);
    if (sourceType === 'builtin' && manifest.version !== version) throw new Error(`MCP manifest version mismatch for ${name}`);
    this.withMcpLock(() => {
      const lock = this.readSharedMcpLock();
      const servers = this.objectValue(lock.servers);
      const serverName = this.mcpName(name);
      const record = this.objectValue(servers[serverName]);
      const present = this.hasMcpConfig(serverName);
      const recorded = this.objectValue(record.config) as McpServerConfig;
      const owned = record.scope === 'user' && record.root === this.root && record.name === name
        && record.source_type === sourceType && record.manifest === `packages/mcp/${sourceType}/${name}.json`
        && typeof record.snapshot === 'string' && !!record.snapshot;
      const browserMigration = owned && this.browserPathOnlyChange(name, recorded, expected);
      if (present) {
        if (!owned || !this.sameMcpConfig(readMcpServerConfig(this.mcpConfig, serverName), recorded)
          || !record.snapshot || record.snapshot !== this.mcpConfigSnapshot(serverName)) {
          throw new Error(`MCP ${serverName} already exists or differs from its QA record; preserve it and resolve the conflict manually`);
        }
        if (!this.sameMcpConfig(recorded, expected)) {
          if (!browserMigration) throw new Error(`MCP ${serverName} differs from its QA record; preserve it and resolve the conflict manually`);
          this.codex(['mcp', 'remove', serverName]);
          if (this.hasMcpConfig(serverName)) throw new Error(`MCP ${serverName} is still present after removal`);
        } else console.log(`KEEP MCP ${serverName}`);
      }
      if (!this.hasMcpConfig(serverName)) {
        if (Object.keys(record).length && (!owned || (!this.sameMcpConfig(recorded, expected) && !browserMigration))) {
          throw new Error(`MCP ${serverName} has a conflicting QA ownership record`);
        }
        const command = ['mcp', 'add', serverName];
        for (const [key, value] of Object.entries(expected.env ?? {})) command.push('--env', `${key}=${value}`);
        command.push('--', expected.command ?? '', ...(expected.args ?? []));
        try { this.codex(command); } catch (error) {
          throw new Error(`Could not register MCP ${serverName}; its ownership record is preserved. Retry env init or inspect the registration: ${String(error)}`);
        }
      }
      const snapshot = this.mcpConfigSnapshot(serverName);
      if (!snapshot || !this.sameMcpConfig(readMcpServerConfig(this.mcpConfig, serverName), expected)) throw new Error(`Unable to verify MCP ${serverName}; its configuration is preserved`);
      servers[serverName] = {
        snapshot, scope: 'user', root: this.root, name, source_type: sourceType,
        manifest: `packages/mcp/${sourceType}/${name}.json`, source: manifest.source,
        license: manifest.license, package: manifest.package, version,
        transport: manifest.transport, config: expected,
      };
      lock.servers = servers;
      atomicJson(this.sharedMcpLockPath(), lock);
    });
  }
  /**
   * Writes activation scripts that prepend only this environment to PATH.
   */
  activate(): void {
    const variables = this.variables();
    delete variables.PATH;
    const python = this.pythonPath();
    const prefix = [
      dirname(this.node),
      this.npmBin,
      join(this.root, 'bin'),
      ...(python ? [dirname(python)] : []),
    ].join(WINDOWS ? ';' : ':');

    const bash = Object.entries(variables).map(
      ([key, value]) => `export ${key}=${shellQuote(String(value ?? ''))}`,
    );
    bash.push(`export PATH=${shellQuote(prefix)}:"$PATH"`);

    const powershell = Object.entries(variables).map(
      ([key, value]) => `$env:${key} = '${String(value ?? '').replaceAll("'", "''")}'`,
    );
    powershell.push(
      `$env:PATH = '${prefix.replaceAll("'", "''")}' + [IO.Path]::PathSeparator + $env:PATH`,
    );

    writeFileSync(
      join(this.root, 'activate.sh'),
      `# Source this file to set the current shell's QA environment variables and PATH.\n${bash.join('\n')}\n`,
      'utf8',
    );
    writeFileSync(
      join(this.root, 'activate.ps1'),
      `# Dot-source this file to set the current shell's QA environment variables and PATH.\n${powershell.join('\n')}\n`,
      'utf8',
    );
  }

  /**
   * Initializes or repairs an owned environment.
   *
   * @param options - Stack and optional component switches.
   * @returns Process exit code.
   */
  async init(options: EnvironmentInitOptions): Promise<number> {
    const stack = options.stack;
    const profile = options.profile;
    if (!['python', 'typescript', 'both'].includes(stack)) {
      throw new Error('Invalid stack');
    }

    this.state.schema = 1;
    this.state.init_status = 'initializing';
    this.state.init_options = { ...options, withCcSwitch: options.withCcSwitch === true };
    this.save();
    mkdirSync(join(this.root, 'tmp'), { recursive: true });
    if (profile === 'full' && !options.skipSkills) {
      for (const relative of [
        AGENT_BROWSER_SOCKET_DIR,
        'agent-browser-output',
        'agent-browser-downloads',
        'agent-browser-flows',
      ]) {
        mkdirSync(join(this.root, relative), { recursive: true });
      }
      const agentConfig = join(
        this.root,
        'agent-browser-config.json',
      );
      if (!existsSync(agentConfig)) {
        writeFileSync(agentConfig, '{}\n', 'utf8');
      }
    }

    if (stack === 'python' || stack === 'both') {
      const python = await this.ensurePython();
      const version =
        this.run([python, '--version'], { capture: true }) ?? '';
      if (!version.startsWith(`Python ${this.pythonVersion}.`)) {
        throw new Error(
          `Expected Python ${this.pythonVersion}; use the original profile or a fresh --root`,
        );
      }
      this.state.python = version;
      this.state.uv =
        this.run([this.uv, '--version'], { capture: true }) ?? '';
      this.recordInstallation('python', { status: 'ready', source: 'unknown', scope: 'environment', path: python, version });
      this.recordInstallation('uv', { status: 'ready', source: typeof this.state.uv_sha256 === 'string' ? 'qa' : 'unknown', scope: 'environment', path: this.uv, version: this.state.uv });
    }

    this.state.node = await this.ensureNode();
    this.recordInstallation('node', { status: 'ready', source: 'unknown', scope: within(resolve(this.node), this.root) ? 'environment' : 'system-or-user', path: this.node, version: this.state.node });
    const packageManagers = await this.ensurePackageManagers();
    this.discoverGlobalNpmBin();
    this.state.bun = packageManagers.bun;
    this.state.pnpm = packageManagers.pnpm;
    if (options.withCcSwitch) {
      this.state.cc_switch = await this.ensureCcSwitch();
      this.state.cc_switch_version = this.state.cc_switch;
      const cc = this.objectValue(this.state.cc_switch_installation);
      this.recordInstallation('cc-switch', { status: 'ready', ...cc });
    }
    if (!options.skipCodex) {
      if (!this.codexBin) {
        const codex = this.codexManifest();
        this.installGlobal(codex.package, codex.executable);
      }
      const codexVersion = this.codex(['--version'], { capture: true });
      this.state.codex = codexVersion;
      const codexPackage = this.globalPackage('@openai/codex', this.codexBin);
      this.recordInstallation('@openai/codex', { status: 'ready', source: 'reused', scope: 'system-or-user', path: this.codexBin, package_path: codexPackage, version: this.globalPackageVersion(codexPackage) ?? codexVersion ?? 'unknown' });
      this.registerMcp(
        'qa',
        {
          command: this.bunExecutable,
          args: [join(this.repo, 'packages/mcp/builtin/qa-server.ts'), '--root', this.root],
        },
        'builtin',
        '0.0.1',
      );
    }

    if (!options.skipCodex && !options.skipSkills) {
      this.state.playwright_mcp = await this.ensurePlaywrightMcp();
    }
    if (!options.skipSkills) {
      this.state.playwright_cli = await this.ensurePlaywrightCli();
      if (profile === 'full') {
        this.state.agent_browser = await this.ensureAgentBrowser();
        if (options.skipCodex) {
          let browser = this.findBrowser();
          if (browser) {
            this.recordInstallation(browser.channel, { status: 'ready', source: 'reused', scope: browser.scope, path: browser.path, version: 'unknown' });
          } else {
            if (this.environment.QA_BROWSER_CHANNEL || this.environment.QA_BROWSER_EXECUTABLE_PATH) {
              throw new Error('Requested browser channel or executable was not found or is invalid; check QA_BROWSER_CHANNEL and QA_BROWSER_EXECUTABLE_PATH');
            }
            this.recordInstallation('chromium', { status: 'pending', source: 'unknown', scope: 'environment', path: join(this.root, 'cache', 'browsers') });
            console.log('No existing Chrome, Edge, or Chromium found; installing environment Chromium.');
            this.runGlobal(this.playwrightCliBin, ['install-browser', 'chromium'], { env: { NO_UPDATE_NOTIFIER: '1' } });
            browser = this.findBrowser('chromium');
            if (!browser) throw new Error('Playwright Chromium installation is incomplete');
            this.recordInstallation('chromium', { status: 'ready', source: 'qa', scope: 'environment', path: browser.path, version: 'unknown' });
          }
        }
      }
      if (profile === 'full' && !options.skipCodex) {
        this.state.agent_browser_mcp =
          this.configureAgentBrowserMcp();
      }
    }
    this.state.stack = stack;
    this.state.profile = profile;
    this.state.components = {
      bun: true,
      codex: !options.skipCodex,
      browser_tools: !options.skipSkills,
      pnpm: true,
      playwright_mcp: !options.skipCodex && !options.skipSkills,
      agent_browser: profile === 'full' && !options.skipSkills,
      agent_browser_mcp:
        profile === 'full' && !options.skipCodex && !options.skipSkills,
      cc_switch: options.withCcSwitch === true,
    };
    this.state.policy = {
      profile,
      node_major: this.nodeMajor,
      bun_version: this.bunVersion,
      pnpm_version: this.pnpmVersion,
      python_series: this.pythonVersion,
      playwright_cli_version: this.playwrightCliVersion,
      playwright_mcp_version: this.playwrightMcpVersion,
      agent_browser_version: this.agentBrowserVersion,
      cc_switch_version: this.ccSwitchVersion,
    };
    this.activate();
    this.state.init_status = 'ready';
    this.save();
    console.log(
      `Ready. Local activation files: ${join(this.root, 'activate.ps1')} / activate.sh`,
    );
    if (options.withCcSwitch) console.log(`CC Switch ${this.state.cc_switch} is available at ${this.findCcSwitch() ?? "unknown"}`);
    if (!options.skipCodex) {
      console.log(
        'Codex uses the selected user CODEX_HOME and its shared credentials.',
      );
    }
    console.log('No system PATH changes.');
    return 0;
  }

  /**
   * Checks the selected environment without mutating it.
   *
   * @param options - Stack and optional component switches.
   * @returns Zero when no component is missing.
   */
  check(options: EnvironmentCheckOptions): number {
    this.checking = true;
    try {
      return this.checkComponents(options);
    } finally {
      this.checking = false;
    }
  }

  /** Probes components while preserving the caller's cache and temporary paths. */
  private checkComponents(options: EnvironmentCheckOptions): number {
    const missing: string[] = [];
    if (this.state.init_status === 'initializing' || this.state.init_status === 'uninstalled') {
      missing.push('environment-initialization');
    }
    if (!options.skipSkills) {
      try { this.discoverGlobalNpmBin(); } catch { /* Component checks report missing tools below. */ }
    }
    if (options.stack === 'python' || options.stack === 'both') {
      try {
        const version =
          this.run([this.python(), '--version'], { capture: true }) ?? '';
        console.log(version);
        if (!version.startsWith(`Python ${this.pythonVersion}.`)) {
          missing.push(`python${this.pythonVersion}`);
        }
      } catch {
        missing.push('python');
      }
      try {
        const version =
          this.run([this.uv, '--version'], { capture: true }) ?? '';
        console.log(version);
        if (!this.uvVersionMatches(version)) {
          missing.push(`uv@${this.uvVersion}`);
        }
      } catch {
        missing.push(`uv@${this.uvVersion}`);
      }
    }

    if (
      options.stack === 'typescript' ||
      options.stack === 'both' ||
      !options.skipCodex ||
      !options.skipSkills
    ) {
      if (existsSync(this.node)) {
        try {
          const version =
            this.run([this.node, '--version'], { capture: true }) ?? '';
          console.log(version);
          if (!version) missing.push('node');
        } catch {
          missing.push('node');
        }
      } else {
        missing.push('node');
      }
    }
    for (const name of ['bun', 'pnpm'] as const) {
      try {
        const actual = (name === 'bun' ? this.bun(['--version'], { capture: true }) : this.pnpm(['--version'], { capture: true }))?.trim();
        if (!actual) throw new Error('Version output is empty');
        console.log(`${name} ${actual}`);
      } catch {
        missing.push(name);
      }
    }
    if ((options.withCcSwitch ?? this.objectValue(this.state.components).cc_switch === true) && !this.findCcSwitch()) {
      missing.push('cc-switch');
    }

    if (!options.skipCodex) {
      try {
        if (!this.codex(['--version'], { capture: true })) missing.push('codex');
      } catch {
        missing.push('codex');
      }
    }
    if (!options.skipCodex) {
      const entry = join(this.repo, 'packages/mcp/builtin/qa-server.ts');
      const current = readMcpServerConfig(this.mcpConfig, this.mcpName('qa'));
      if (
        !existsSync(entry) ||
        current.command !== this.bunExecutable ||
        JSON.stringify(current.args ?? []) !==
          JSON.stringify([entry, '--root', this.root])
      ) {
        missing.push('qa-mcp@0.0.1');
      }
      let lock: Record<string, unknown> = {};
      try { lock = this.readSharedMcpLock(); } catch { /* Invalid ownership is reported below. */ }
      const record = this.objectValue(this.objectValue(lock.servers)[this.mcpName('qa')]);
      if (
        record.scope !== 'user' ||
        record.root !== this.root ||
        !this.sameMcpConfig(current, this.objectValue(record.config) as McpServerConfig) ||
        !record.snapshot || record.snapshot !== this.mcpConfigSnapshot(this.mcpName('qa')) ||
        record.source_type !== 'builtin' ||
        record.version !== '0.0.1' ||
        record.manifest !== 'packages/mcp/builtin/qa.json'
      ) {
        missing.push('mcp-lock:qa');
      }
    }
    if (!options.skipCodex && !options.skipSkills) {
      const entry = this.playwrightMcpPackage ? join(this.playwrightMcpPackage, 'cli.js') : '';
      const current = readMcpServerConfig(this.mcpConfig, this.mcpName('playwright'));
      const expected = this.playwrightMcpServer(entry);
      if (
        !this.findBrowser() ||
        !this.globalPackageVersion(this.playwrightMcpPackage) ||
        !this.sameMcpConfig(current, expected)
      ) {
        missing.push('playwright-mcp');
      }
    }

    if (!options.skipSkills) {
      if (options.profile === 'full') {
        const agentVersion = this.globalPackageVersion(this.agentBrowserPackage);
        if (!this.findBrowser()) missing.push('agent-browser-browser');
        if (
          !agentVersion ||
          !existsSync(this.agentBrowser)
        ) {
          missing.push('agent-browser');
        }
        if (!options.skipCodex) {
          const current = readMcpServerConfig(this.mcpConfig, this.mcpName('agent-browser'));
          let expected: McpServerConfig | undefined;
          try {
            expected = this.agentBrowserMcpServer();
          } catch {
            expected = undefined;
          }
          if (
            !expected ||
            current.command !== expected.command ||
            JSON.stringify(current.args ?? []) !==
              JSON.stringify(expected.args ?? []) ||
            Object.entries(expected.env ?? {}).some(
              ([key, value]) => current.env?.[key] !== value,
            )
          ) {
            missing.push('agent-browser-mcp');
          }
        }
      }
      if (!options.skipCodex) {
        let lock: Record<string, unknown> = {};
        try { lock = this.readSharedMcpLock(); } catch { /* Invalid ownership is reported below. */ }
        const servers = this.objectValue(lock.servers);
        const expectedLocks: Record<string, [string, string]> = {
          playwright: ['external', this.globalPackageVersion(this.playwrightMcpPackage) ?? ''],
        };
        if (options.profile === 'full') {
          expectedLocks['agent-browser'] = [
            'external',
            this.globalPackageVersion(this.agentBrowserPackage) ?? '',
          ];
        }
        for (const [name, [sourceType, version]] of Object.entries(
          expectedLocks,
        )) {
          const record = this.objectValue(servers[this.mcpName(name)]);
          if (
            record.scope !== 'user' ||
            record.root !== this.root ||
            !this.sameMcpConfig(readMcpServerConfig(this.mcpConfig, this.mcpName(name)), this.objectValue(record.config) as McpServerConfig) ||
            !record.snapshot || record.snapshot !== this.mcpConfigSnapshot(this.mcpName(name)) ||
            record.source_type !== sourceType ||
            record.version !== version ||
            record.manifest !== `packages/mcp/${sourceType}/${name}.json`
          ) {
            missing.push(`mcp-lock:${name}`);
          }
        }
      }
      const cliVersion = this.globalPackageVersion(this.playwrightCliPackage);
      if (
        !cliVersion ||
        !existsSync(this.playwrightCliBin) ||
        !this.playwrightCliEntry()
      ) {
        missing.push('playwright-cli');
      }
    }

    console.log(
      JSON.stringify(
        { root: this.root, missing, versions: { ...this.state,
          playwright_cli: this.globalPackageVersion(this.playwrightCliPackage),
          playwright_mcp: this.globalPackageVersion(this.playwrightMcpPackage),
          agent_browser: this.globalPackageVersion(this.agentBrowserPackage),
        } },
        null,
        2,
      ),
    );
    return missing.length > 0 ? 1 : 0;
  }

  private pythonPath(): string | undefined {
    const record = join(this.root, 'bootstrap', 'python-path.txt');
    if (!existsSync(record)) {
      return undefined;
    }
    const python = readFileSync(record, 'utf8').replace(/^\uFEFF/u, '').trim();
    return within(python, this.root) && existsSync(python)
      ? python
      : undefined;
  }

  private readJson(path: string): Record<string, unknown> | undefined {
    if (!existsSync(path)) {
      return undefined;
    }
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }

  private objectValue(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  /**
   * Resolves the Playwright CLI entry declared by the installed package.
   *
   * @returns An existing package entry, or undefined when the metadata is invalid.
   */
  private playwrightCliEntry(): string | undefined {
    if (!this.playwrightCliPackage) return undefined;
    const data = this.readJson(join(this.playwrightCliPackage, 'package.json'));
    const bin = data?.bin;
    const binObject = this.objectValue(bin);
    const relative = typeof bin === 'string'
      ? bin
      : typeof binObject['playwright-cli'] === 'string'
        ? binObject['playwright-cli']
        : Object.values(binObject).find((value) => typeof value === 'string');
    if (typeof relative !== 'string') {
      return undefined;
    }
    const entry = resolve(this.playwrightCliPackage, relative);
    return within(entry, this.playwrightCliPackage) && existsSync(entry)
      ? entry
      : undefined;
  }

  /** Reads metadata only when the global package was discovered. */
  private globalPackageVersion(directory: string): string | undefined {
    return directory ? this.packageVersion(join(directory, 'package.json')) : undefined;
  }

  private packageVersion(path: string): string | undefined {
    const data = this.readJson(path);
    return typeof data?.version === 'string' ? data.version : undefined;
  }

  private requirePackageVersion(path: string): string {
    const version = this.packageVersion(path);
    if (!version) {
      throw new Error(`Package metadata is missing: ${path}`);
    }
    return version;
  }
}

/** Finds full Chromium builds, including the macOS Chrome for Testing bundle. */
function findChromium(directory: string): string | undefined {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (
      entry.isFile() &&
      ['chrome.exe', 'chrome', 'Chromium', 'Google Chrome for Testing'].includes(entry.name)
    ) {
      return path;
    }
    if (entry.isDirectory()) {
      const nested = findChromium(path);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

function findCcSwitchEntry(
  directory: string,
  platform: NodeJS.Platform,
): string | undefined {
  const candidates: string[] = [];
  const visit = (current: string): void => {
    if (!existsSync(current) || !lstatSync(current).isDirectory()) {
      return;
    }
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (
        (platform === 'darwin'
          && entry.isDirectory()
          && entry.name.endsWith('.app'))
        || (platform === 'win32'
          && entry.isFile()
          && entry.name.endsWith('.exe'))
        || (platform === 'linux'
          && entry.isFile()
          && entry.name.endsWith('.AppImage'))
      ) {
        candidates.push(path);
      } else if (entry.isDirectory()) {
        visit(path);
      }
    }
  };
  visit(directory);
  return candidates.find((path) =>
    /cc[\s_-]*switch/i.test(basename(path)),
  );
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
