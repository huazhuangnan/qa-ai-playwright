import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import {
  OWNER,
  REPO,
  WINDOWS,
  atomicJson,
  digest,
  download,
  extractArchive,
  fetchJson,
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
}

/** Options accepted by `env check`. */
export interface EnvironmentCheckOptions {
  stack: Stack;
  profile: SkillProfile;
  skipCodex: boolean;
  skipSkills: boolean;
}

/** Options for one child process invocation. */
export interface RunOptions {
  cwd?: string;
  capture?: boolean;
}

interface NodeRelease {
  version: string;
  lts: false | string;
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
  readonly bunBin: string;
  readonly pnpmBin: string;
  readonly codexBin: string;
  readonly codexPackage: string;
  readonly playwrightCliBin: string;
  readonly playwrightCliPackage: string;
  readonly playwrightMcpPackage: string;
  readonly agentBrowser: string;
  readonly agentBrowserPackage: string;
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

    if (!['22', '24', '26'].includes(this.nodeMajor)) {
      throw new Error(
        'Node major must be in the Playwright-supported LTS range: 22/24/26',
      );
    }
    if (!/^3\.(12|13|14|15)$/.test(this.pythonVersion)) {
      throw new Error('Unsupported stable QA_PYTHON_VERSION');
    }

    this.uv = join(this.root, 'bootstrap', WINDOWS ? 'uv.exe' : 'uv');
    this.nodeDir = join(this.root, 'runtime', 'node');
    this.node = join(this.nodeDir, WINDOWS ? 'node.exe' : 'bin/node');
    this.npmPrefix = join(this.root, 'tools', 'npm');
    this.npmBin = WINDOWS ? this.npmPrefix : join(this.npmPrefix, 'bin');
    this.bunBin = WINDOWS
      ? join(this.npmPrefix, 'node_modules/bun/bin/bun.exe')
      : join(this.npmBin, 'bun');
    this.pnpmBin = join(this.npmBin, WINDOWS ? 'pnpm.cmd' : 'pnpm');
    this.codexBin = join(this.npmBin, WINDOWS ? 'codex.cmd' : 'codex');
    this.codexPackage = join(
      this.npmPrefix,
      WINDOWS
        ? 'node_modules/@openai/codex'
        : 'lib/node_modules/@openai/codex',
    );
    this.playwrightCliBin = join(
      this.npmBin,
      WINDOWS ? 'playwright-cli.cmd' : 'playwright-cli',
    );
    this.playwrightCliPackage = join(
      this.npmPrefix,
      WINDOWS
        ? 'node_modules/@playwright/cli'
        : 'lib/node_modules/@playwright/cli',
    );
    this.playwrightMcpPackage = join(
      this.npmPrefix,
      WINDOWS
        ? 'node_modules/@playwright/mcp'
        : 'lib/node_modules/@playwright/mcp',
    );
    this.agentBrowser = join(
      this.npmBin,
      WINDOWS ? 'agent-browser.cmd' : 'agent-browser',
    );
    this.agentBrowserPackage = join(
      this.npmPrefix,
      WINDOWS
        ? 'node_modules/agent-browser'
        : 'lib/node_modules/agent-browser',
    );
    this.ccSwitchDir = join(this.root, 'tools', 'cc-switch');
    this.ccSwitchManifest = join(
      this.repo,
      'src/apps/cc-switch/manifest.json',
    );
    this.mcpConfig = join(this.root, 'codex', 'config.toml');
  }

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
      throw new Error('Managed Node is missing. Re-run: qa env init <language>');
    }
    if (!existsSync(this.bunBin) || !existsSync(this.pnpmBin)) {
      throw new Error(
        'Managed Bun or pnpm is missing. Re-run: qa env init <language>',
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
      CODEX_HOME: join(this.root, 'codex'),
      AGENT_BROWSER_SOCKET_DIR: join(this.root, 'runtime/agent-browser'),
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
      dirname(this.bunBin),
      this.npmBin,
      join(this.root, 'bin'),
      ...(python ? [dirname(python)] : []),
      this.environment.PATH ?? '',
    ].filter(Boolean))];
    values.PATH = pathParts.join(WINDOWS ? ';' : ':');

    const browser = this.playwrightChromiumExecutable();
    if (browser) {
      values.AGENT_BROWSER_EXECUTABLE_PATH = browser;
    }
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
    const result = spawnSync(executable, args.slice(1), {
      cwd: options.cwd,
      env: { ...this.environment, ...this.variables() },
      encoding: 'utf8',
      stdio: options.capture ? 'pipe' : 'inherit',
      windowsHide: true,
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
    return this.run([this.node, entry, ...args], options);
  }

  /**
   * Runs the environment-local pnpm executable.
   *
   * @param args - pnpm arguments.
   * @param options - Working directory and output capture mode.
   * @returns Captured output when requested.
   */
  pnpm(
    args: readonly (string | number)[],
    options?: RunOptions,
  ): string | undefined {
    return this.run([this.pnpmBin, ...args], options);
  }

  /**
   * Runs the environment-local Bun executable.
   *
   * @param args - Bun arguments.
   * @param options - Working directory and output capture mode.
   * @returns Captured output when requested.
   */
  bun(
    args: readonly (string | number)[],
    options?: RunOptions,
  ): string | undefined {
    return this.run([this.bunBin, ...args], options);
  }

  /**
   * Runs the environment-local Codex CLI.
   *
   * @param args - Codex arguments.
   * @param options - Working directory and output capture mode.
   * @returns Captured output when requested.
   */
  codex(
    args: readonly (string | number)[],
    options?: RunOptions,
  ): string | undefined {
    return this.run(
      [this.node, join(this.codexPackage, 'bin/codex.js'), ...args],
      options,
    );
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
   * Runs the local Microsoft Playwright CLI package.
   *
   * @param args - CLI arguments.
   * @returns Captured output when requested by the caller.
   */
  playwrightCli(...args: (string | number)[]): void {
    this.run(
      [this.node, join(this.playwrightCliPackage, 'cli.js'), ...args],
    );
  }

  /**
   * Runs the local Agent Browser JavaScript entrypoint.
   *
   * @param args - Agent Browser arguments.
   * @returns Captured output when requested by the caller.
   */
  agentBrowserCli(...args: (string | number)[]): void {
    this.run(
      [
        this.node,
        join(this.agentBrowserPackage, 'bin/agent-browser.js'),
        ...args,
      ],
    );
  }

  /**
   * Ensures the pinned Node LTS is available under the environment root.
   *
   * @returns Managed Node version string.
   */
  async ensureNode(): Promise<string> {
    if (existsSync(this.node)) {
      const version = this.run([this.node, '--version'], { capture: true });
      if (version?.startsWith(`v${this.nodeMajor}.`)) {
        return version;
      }
      throw new Error(
        `Expected managed Node ${this.nodeMajor} LTS, got ${version}; select the original profile or use a fresh --root`,
      );
    }

    const architectures: Record<string, string> = {
      x64: 'x64',
      arm64: 'arm64',
    };
    const systems: Record<string, string> = {
      win32: 'win',
      darwin: 'darwin',
      linux: 'linux',
    };
    const arch = architectures[process.arch];
    const system = systems[process.platform];
    if (!arch || !system) {
      throw new Error('Unsupported Node platform');
    }

    const releases = await fetchJson<NodeRelease[]>(
      'https://nodejs.org/dist/index.json',
    );
    const release = releases.find(
      (item) =>
        item.version.startsWith(`v${this.nodeMajor}.`) && item.lts !== false,
    );
    if (!release) {
      throw new Error(`No Node ${this.nodeMajor} LTS release found`);
    }

    const suffix = WINDOWS ? 'zip' : 'tar.gz';
    const name = `node-${release.version}-${system}-${arch}.${suffix}`;
    const downloads = join(this.root, 'cache', 'downloads');
    const archive = join(downloads, name);
    const checksumFile = join(
      downloads,
      `${release.version}-SHASUMS256.txt`,
    );
    await download(
      `https://nodejs.org/dist/${release.version}/SHASUMS256.txt`,
      checksumFile,
    );
    const expected = readChecksum(checksumFile, name);
    if (!existsSync(archive) || digest(archive) !== expected) {
      await download(
        `https://nodejs.org/dist/${release.version}/${name}`,
        archive,
      );
    }
    if (digest(archive) !== expected) {
      throw new Error('Node SHA256 mismatch');
    }

    const staging = join(this.root, 'runtime', 'node-extract');
    if (existsSync(staging)) {
      removeOwned(staging, this.root);
    }
    extractArchive(archive, staging);
    const candidates = readdirSync(staging, { withFileTypes: true }).filter(
      (entry) => entry.isDirectory(),
    );
    if (candidates.length !== 1 || !candidates[0]) {
      throw new Error('Unexpected Node archive layout');
    }
    mkdirSync(dirname(this.nodeDir), { recursive: true });
    if (existsSync(this.nodeDir)) {
      removeOwned(this.nodeDir, this.root);
    }
    renameSync(join(staging, candidates[0].name), this.nodeDir);
    rmSync(staging, { recursive: true, force: true });
    return this.run([this.node, '--version'], { capture: true }) ?? '';
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
    const currentVersion = (executable: string): string | undefined => {
      if (!existsSync(executable)) {
        return undefined;
      }
      try {
        return this.run([executable, '--version'], {
          capture: true,
        })?.trim();
      } catch {
        return undefined;
      }
    };

    if (currentVersion(this.bunBin) !== this.bunVersion) {
      this.npm([
        'install',
        '--global',
        '--allow-scripts=bun',
        `bun@${this.bunVersion}`,
      ]);
    }
    if (currentVersion(this.pnpmBin) !== this.pnpmVersion) {
      this.npm([
        'install',
        '--global',
        '--allow-scripts=pnpm',
        `pnpm@${this.pnpmVersion}`,
      ]);
    }

    const bun = currentVersion(this.bunBin);
    const pnpm = currentVersion(this.pnpmBin);
    if (bun !== this.bunVersion || pnpm !== this.pnpmVersion) {
      throw new Error(
        `Expected Bun ${this.bunVersion} and pnpm ${this.pnpmVersion}; got ${bun ?? 'missing'} and ${pnpm ?? 'missing'}`,
      );
    }
    return { bun, pnpm };
  }

  /**
   * Installs the pinned portable CC Switch release for every language profile.
   *
   * @returns Installed CC Switch version.
   */
  async ensureCcSwitch(): Promise<string> {
    const manifest = this.readJson(this.ccSwitchManifest) as
      | CcSwitchManifest
      | undefined;
    if (
      !manifest
      || manifest.id !== 'cc-switch'
      || manifest.version !== this.ccSwitchVersion
      || manifest.source_type !== 'external'
      || manifest.scope !== 'environment'
    ) {
      throw new Error('CC Switch manifest is missing or does not match the pinned version');
    }
    const arch =
      process.platform === 'darwin' ? 'universal' : process.arch;
    const asset = manifest.assets.find(
      (item) => item.platform === process.platform && item.arch === arch,
    );
    if (!asset) {
      throw new Error(
        `CC Switch has no portable asset for ${process.platform}/${process.arch}`,
      );
    }
    let entry = findCcSwitchEntry(this.ccSwitchDir, process.platform);
    if (entry && this.state.cc_switch_version === manifest.version) {
      this.writeCcSwitchWrapper(entry);
      return manifest.version;
    }

    const downloads = join(this.root, 'cache', 'downloads');
    const archive = join(downloads, asset.file);
    if (!existsSync(archive) || digest(archive) !== asset.sha256) {
      await download(`${manifest.download_base}/${asset.file}`, archive);
    }
    if (digest(archive) !== asset.sha256) {
      throw new Error(`CC Switch SHA256 mismatch: ${asset.file}`);
    }

    const staging = join(this.root, 'tools', 'cc-switch-staging');
    if (existsSync(staging)) {
      removeOwned(staging, this.root);
    }
    mkdirSync(staging, { recursive: true });
    if (asset.format === 'appimage') {
      const target = join(staging, 'cc-switch.AppImage');
      copyFileSync(archive, target);
      chmodSync(target, 0o755);
    } else {
      extractArchive(archive, staging);
    }
    if (existsSync(this.ccSwitchDir)) {
      removeOwned(this.ccSwitchDir, this.root);
    }
    renameSync(staging, this.ccSwitchDir);
    entry = findCcSwitchEntry(this.ccSwitchDir, process.platform);
    if (!entry) {
      throw new Error('CC Switch executable was not found after extraction');
    }
    this.writeCcSwitchWrapper(entry);
    return manifest.version;
  }

  /** Launches the installed CC Switch desktop application. */
  ccSwitchCli(...args: string[]): void {
    const entry = findCcSwitchEntry(this.ccSwitchDir, process.platform);
    if (!entry) {
      throw new Error('CC Switch is not installed; run qa env init <language>');
    }
    const command =
      process.platform === 'darwin'
        ? ['open', '-a', entry, '--args', ...args]
        : [entry, ...args];
    const executable = command[0];
    if (!executable) {
      throw new Error('CC Switch executable path is empty');
    }
    const child = spawn(executable, command.slice(1), {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  }

  private writeCcSwitchWrapper(entry: string): void {
    const bin = join(this.root, 'bin');
    mkdirSync(bin, { recursive: true });
    if (WINDOWS) {
      writeFileSync(
        join(bin, 'cc-switch.cmd'),
        `@echo off\r\nstart "" "${entry.replaceAll('"', '""')}" %*\r\n`,
        'utf8',
      );
      return;
    }
    const command =
      process.platform === 'darwin'
        ? `open -a ${shellQuote(entry)} --args "$@"`
        : `${shellQuote(entry)} "$@"`;
    const wrapper = join(bin, 'cc-switch');
    writeFileSync(wrapper, `#!/usr/bin/env bash\n${command}\n`, 'utf8');
    chmodSync(wrapper, 0o755);
  }

  /**
   * Ensures the pinned uv bootstrap executable is locally available.
   *
   * @returns Installed uv version string.
   */
  async ensureUv(): Promise<string> {
    if (existsSync(this.uv)) {
      try {
        const current =
          this.run([this.uv, '--version'], { capture: true }) ?? '';
        if (this.uvVersionMatches(current)) {
          return current;
        }
      } catch {
        // A damaged local uv executable is replaced below.
      }
      removeOwned(this.uv, this.root);
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
    return current;
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

  /**
   * Ensures the pinned Microsoft Playwright CLI is installed.
   *
   * @returns Installed package version.
   */
  async ensurePlaywrightCli(): Promise<string> {
    const packageFile = join(this.playwrightCliPackage, 'package.json');
    const installed = this.packageVersion(packageFile);
    if (
      installed === this.playwrightCliVersion &&
      existsSync(this.playwrightCliBin)
    ) {
      return installed;
    }
    if (existsSync(this.playwrightCliPackage)) {
      removeOwned(this.playwrightCliPackage, this.root);
    }
    this.npm([
      'install',
      '--global',
      `@playwright/cli@${this.playwrightCliVersion}`,
    ]);
    const actual = this.requirePackageVersion(packageFile);
    if (
      actual !== this.playwrightCliVersion ||
      !existsSync(this.playwrightCliBin)
    ) {
      throw new Error(
        `Expected Playwright CLI ${this.playwrightCliVersion}, got ${actual}`,
      );
    }
    return actual;
  }

  /**
   * Ensures the pinned Vercel Agent Browser package is installed.
   *
   * @returns Installed package version.
   */
  async ensureAgentBrowser(): Promise<string> {
    const packageFile = join(this.agentBrowserPackage, 'package.json');
    const installed = this.packageVersion(packageFile);
    if (
      installed === this.agentBrowserVersion &&
      existsSync(this.agentBrowser)
    ) {
      return installed;
    }
    if (existsSync(this.agentBrowserPackage)) {
      removeOwned(this.agentBrowserPackage, this.root);
    }
    this.npm([
      'install',
      '--global',
      `agent-browser@${this.agentBrowserVersion}`,
    ]);
    const actual = this.requirePackageVersion(packageFile);
    if (actual !== this.agentBrowserVersion || !existsSync(this.agentBrowser)) {
      throw new Error(
        `Expected Agent Browser ${this.agentBrowserVersion}, got ${actual}`,
      );
    }
    return actual;
  }

  /**
   * Returns the expected environment-local Agent Browser MCP server.
   *
   * @returns Validated server configuration.
   */
  agentBrowserMcpServer(): McpServerConfig {
    const entry = join(
      this.agentBrowserPackage,
      'bin/agent-browser.js',
    );
    const chromium = this.playwrightChromiumExecutable();
    if (!existsSync(entry) || !chromium) {
      throw new Error(
        'Agent Browser MCP needs its CLI entry and Playwright Chromium',
      );
    }
    return {
      command: this.node,
      args: [entry, 'mcp'],
      env: {
        AGENT_BROWSER_SOCKET_DIR: join(
          this.root,
          'runtime/agent-browser',
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
        AGENT_BROWSER_EXECUTABLE_PATH: chromium,
      },
    };
  }

  /**
   * Registers Agent Browser MCP in the environment-local Codex config.
   *
   * @returns Installed Agent Browser version.
   */
  configureAgentBrowserMcp(): string {
    this.registerMcp(
      'agent-browser',
      this.agentBrowserMcpServer(),
      'external',
      this.agentBrowserVersion,
    );
    return this.agentBrowserVersion;
  }

  /**
   * Returns the names of on-demand MCP servers shipped in the repository.
   *
   * @returns Optional MCP names, sorted by name.
   */
  optionalMcpNames(): string[] {
    const directory = join(this.repo, 'src/mcp/external');
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

  /**
   * Installs one on-demand npm MCP server into the environment.
   *
   * @param name - Optional MCP name.
   * @returns Installed package version.
   */
  installOptionalMcp(name: string): string {
    this.requireInitialized();
    const manifest = mcpManifest(name, 'external', this.repo);
    if (manifest.optional !== true) {
      throw new Error(`MCP ${name} is not an on-demand server`);
    }
    const pkg = String(manifest.package);
    const version = String(manifest.version);
    const entry = String(manifest.entry ?? '');
    const packageDir = join(
      this.npmPrefix,
      WINDOWS ? `node_modules/${pkg}` : `lib/node_modules/${pkg}`,
    );
    const packageFile = join(packageDir, 'package.json');
    let installed = this.packageVersion(packageFile);
    if (installed !== version) {
      if (existsSync(packageDir)) {
        removeOwned(packageDir, this.root);
      }
      this.npm(['install', '--global', `${pkg}@${version}`]);
      installed = this.requirePackageVersion(packageFile);
    }
    if (installed !== version) {
      throw new Error(`Expected ${pkg} ${version}, got ${installed}`);
    }
    const entryPath = join(packageDir, entry);
    if (!entry || !existsSync(entryPath)) {
      throw new Error(`MCP entrypoint is missing for ${name}`);
    }
    const args = Array.isArray(manifest.args)
      ? (manifest.args as string[])
      : [];
    this.registerMcp(
      name,
      { command: this.node, args: [entryPath, ...args] },
      'external',
      version,
    );
    return version;
  }

  /**
   * Removes one on-demand MCP server registration and its package.
   *
   * @param name - Optional MCP name.
   */
  removeOptionalMcp(name: string): void {
    const manifest = mcpManifest(name, 'external', this.repo);
    if (manifest.optional !== true) {
      throw new Error(`MCP ${name} is not an on-demand server`);
    }
    const current = readMcpServerConfig(this.mcpConfig, name);
    if (current.command) {
      this.codex(['mcp', 'remove', name]);
    }
    const lockPath = join(this.root, 'codex', 'mcp.lock.json');
    const lock = this.readJson(lockPath) ?? { schema: 1, servers: {} };
    const servers = this.objectValue(lock.servers);
    delete servers[name];
    lock.servers = servers;
    atomicJson(lockPath, lock);
    const pkg = String(manifest.package);
    const packageDir = join(
      this.npmPrefix,
      WINDOWS ? `node_modules/${pkg}` : `lib/node_modules/${pkg}`,
    );
    if (existsSync(packageDir)) {
      this.npm(['uninstall', '--global', pkg]);
    }
  }

  /**
   * Ensures the pinned official Playwright MCP package is installed.
   *
   * @returns Installed MCP package version.
   */
  async ensurePlaywrightMcp(): Promise<string> {
    const packageFile = join(this.playwrightMcpPackage, 'package.json');
    let installed = this.packageVersion(packageFile);
    if (installed !== this.playwrightMcpVersion) {
      if (existsSync(this.playwrightMcpPackage)) {
        removeOwned(this.playwrightMcpPackage, this.root);
      }
      this.npm([
        'install',
        '--global',
        `@playwright/mcp@${this.playwrightMcpVersion}`,
      ]);
      installed = this.requirePackageVersion(packageFile);
    }
    if (installed !== this.playwrightMcpVersion) {
      throw new Error(
        `Expected Playwright MCP ${this.playwrightMcpVersion}, got ${installed}`,
      );
    }
    const entry = join(this.playwrightMcpPackage, 'cli.js');
    if (!existsSync(entry)) {
      throw new Error('Official Playwright MCP entrypoint is missing');
    }
    this.run([this.node, entry, 'install-browser', 'chromium']);
    if (!this.playwrightChromiumExecutable()) {
      throw new Error('Playwright Chromium installation is incomplete');
    }
    this.registerMcp(
      'playwright',
      this.playwrightMcpServer(entry),
      'external',
      this.playwrightMcpVersion,
    );
    return installed;
  }

  /**
   * Returns the isolated standard-input Playwright MCP configuration.
   *
   * @param entry - Playwright MCP JavaScript entrypoint.
   * @returns Expected server configuration.
   */
  playwrightMcpServer(entry: string): McpServerConfig {
    return {
      command: this.node,
      args: [
        entry,
        '--headless',
        '--browser',
        'chromium',
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
  registerMcp(
    name: string,
    expected: McpServerConfig,
    sourceType: SkillSource,
    version: string,
  ): void {
    mkdirSync(dirname(this.mcpConfig), { recursive: true });
    const manifest = mcpManifest(name, sourceType, this.repo);
    if (manifest.version !== version) {
      throw new Error(
        `MCP manifest version mismatch for ${name}: ${String(manifest.version)} != ${version}`,
      );
    }

    const current = readMcpServerConfig(this.mcpConfig, name);
    const unchanged =
      current.command === expected.command &&
      JSON.stringify(current.args ?? []) ===
        JSON.stringify(expected.args ?? []) &&
      Object.entries(expected.env ?? {}).every(
        ([key, value]) => current.env?.[key] === value,
      );
    if (unchanged) {
      console.log(`KEEP MCP ${name}`);
    } else {
      if (current.command) {
        this.codex(['mcp', 'remove', name]);
      }
      const command = ['mcp', 'add', name];
      for (const [key, value] of Object.entries(expected.env ?? {})) {
        command.push('--env', `${key}=${value}`);
      }
      command.push('--', expected.command ?? '', ...(expected.args ?? []));
      this.codex(command);
    }

    const lockPath = join(this.root, 'codex', 'mcp.lock.json');
    const lock = this.readJson(lockPath) ?? { schema: 1, servers: {} };
    const servers = this.objectValue(lock.servers);
    servers[name] = {
      scope: 'environment',
      source_type: sourceType,
      manifest: `src/mcp/${sourceType}/${name}.json`,
      source: manifest.source,
      license: manifest.license,
      package: manifest.package,
      version,
      transport: manifest.transport,
    };
    lock.servers = servers;
    atomicJson(lockPath, lock);
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
      `${bash.join('\n')}\n`,
      'utf8',
    );
    writeFileSync(
      join(this.root, 'activate.ps1'),
      `${powershell.join('\n')}\n`,
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
    this.save();
    mkdirSync(join(this.root, 'tmp'), { recursive: true });
    if (profile === 'full' && !options.skipSkills) {
      for (const relative of [
        'runtime/agent-browser',
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
    }

    this.state.node = await this.ensureNode();
    const packageManagers = await this.ensurePackageManagers();
    this.state.bun = packageManagers.bun;
    this.state.pnpm = packageManagers.pnpm;
    this.state.cc_switch_version = this.ccSwitchVersion;
    this.state.cc_switch = await this.ensureCcSwitch();
    if (!options.skipCodex) {
      let codexVersion: string | undefined;
      if (existsSync(this.codexPackage)) {
        try {
          codexVersion = this.codex(['--version'], { capture: true });
        } catch {
          console.log('Repairing incomplete local Codex installation');
        }
      }
      if (!codexVersion) {
        if (existsSync(this.codexPackage)) {
          removeOwned(this.codexPackage, this.root);
        }
        this.npm(['install', '--global', '@openai/codex']);
        codexVersion = this.codex(['--version'], { capture: true });
      }
      this.state.codex = codexVersion;
    }

    if (!options.skipCodex && !options.skipSkills) {
      this.state.playwright_mcp = await this.ensurePlaywrightMcp();
    }
    if (!options.skipSkills) {
      this.state.playwright_cli = await this.ensurePlaywrightCli();
      if (profile === 'full') {
        this.state.agent_browser = await this.ensureAgentBrowser();
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
      cc_switch: true,
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
    this.save();
    this.activate();
    console.log(
      `Ready. Local activation files: ${join(this.root, 'activate.ps1')} / activate.sh`,
    );
    console.log(`CC Switch ${this.state.cc_switch} is available in ${this.ccSwitchDir}`);
    if (!options.skipCodex) {
      console.log(
        'Use qa run codex to log in; credentials remain in this environment.',
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
    const missing: string[] = [];
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
          if (!version.startsWith(`v${this.nodeMajor}.`)) {
            missing.push(`node${this.nodeMajor}`);
          }
        } catch {
          missing.push(`node${this.nodeMajor}`);
        }
      } else {
        missing.push(`node${this.nodeMajor}`);
      }
    }
    for (const [name, executable, version] of [
      ['bun', this.bunBin, this.bunVersion],
      ['pnpm', this.pnpmBin, this.pnpmVersion],
    ] as const) {
      if (!existsSync(executable)) {
        missing.push(`${name}@${version}`);
        continue;
      }
      try {
        const actual =
          this.run([executable, '--version'], { capture: true })?.trim();
        console.log(`${name} ${actual ?? ''}`.trim());
        if (actual !== version) {
          missing.push(`${name}@${version}`);
        }
      } catch {
        missing.push(`${name}@${version}`);
      }
    }
    if (
      this.state.cc_switch_version !== this.ccSwitchVersion
      || !findCcSwitchEntry(this.ccSwitchDir, process.platform)
      || !existsSync(join(this.root, 'bin', WINDOWS ? 'cc-switch.cmd' : 'cc-switch'))
    ) {
      missing.push(`cc-switch@${this.ccSwitchVersion}`);
    }

    if (!options.skipCodex && !existsSync(this.codexBin)) {
      missing.push('codex');
    }
    if (!options.skipCodex && !options.skipSkills) {
      const entry = join(this.playwrightMcpPackage, 'cli.js');
      const current = readMcpServerConfig(this.mcpConfig, 'playwright');
      const expected = this.playwrightMcpServer(entry);
      if (
        this.packageVersion(join(this.playwrightMcpPackage, 'package.json')) !==
          this.playwrightMcpVersion ||
        current.command !== expected.command ||
        JSON.stringify(current.args ?? []) !==
          JSON.stringify(expected.args ?? [])
      ) {
        missing.push(`playwright-mcp@${this.playwrightMcpVersion}`);
      }
    }

    if (!options.skipSkills) {
      if (options.profile === 'full') {
        const agentVersion = this.packageVersion(
          join(this.agentBrowserPackage, 'package.json'),
        );
        if (
          agentVersion !== this.agentBrowserVersion ||
          !existsSync(this.agentBrowser)
        ) {
          missing.push(`agent-browser@${this.agentBrowserVersion}`);
        }
        if (!options.skipCodex) {
          const current = readMcpServerConfig(this.mcpConfig, 'agent-browser');
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
        const lock =
          this.readJson(join(this.root, 'codex', 'mcp.lock.json')) ?? {};
        const servers = this.objectValue(lock.servers);
        const expectedLocks: Record<string, [string, string]> = {
          playwright: ['external', this.playwrightMcpVersion],
        };
        if (options.profile === 'full') {
          expectedLocks['agent-browser'] = [
            'external',
            this.agentBrowserVersion,
          ];
        }
        for (const [name, [sourceType, version]] of Object.entries(
          expectedLocks,
        )) {
          const record = this.objectValue(servers[name]);
          if (
            record.scope !== 'environment' ||
            record.source_type !== sourceType ||
            record.version !== version ||
            record.manifest !== `src/mcp/${sourceType}/${name}.json`
          ) {
            missing.push(`mcp-lock:${name}`);
          }
        }
      }
      const cliVersion = this.packageVersion(
        join(this.playwrightCliPackage, 'package.json'),
      );
      if (
        cliVersion !== this.playwrightCliVersion ||
        !existsSync(this.playwrightCliBin)
      ) {
        missing.push(`playwright-cli@${this.playwrightCliVersion}`);
      }
    }

    console.log(
      JSON.stringify(
        { root: this.root, missing, versions: this.state },
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

function readChecksum(file: string, archiveName: string): string {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/u)) {
    const parts = line.trim().split(/\s+/u);
    if (parts.length === 2 && parts[1]?.replace(/^\*/u, '') === archiveName) {
      return String(parts[0]).toLowerCase();
    }
  }
  throw new Error(`Checksum is missing for ${archiveName}`);
}

function findChromium(directory: string): string | undefined {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (
      entry.isFile() &&
      ['chrome.exe', 'chrome', 'Chromium'].includes(entry.name)
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
    if (!existsSync(current)) {
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
    basename(path).toLowerCase().includes('cc-switch'),
  ) ?? candidates[0];
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
