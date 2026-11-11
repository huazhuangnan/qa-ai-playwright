import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join, relative as relativePath, resolve, sep } from 'node:path';
import {
  OWNER,
  WINDOWS,
  atomicJson,
  digest,
  removeOwned,
  templateVersion,
  within,
  type Browser,
} from './shared.ts';
import { Environment } from './environment.ts';

/** Inputs accepted by project initialization. */
export interface ProjectInitArguments {
  target: string;
  stack: 'python' | 'typescript';
  browser?: Browser;
  withDeps: boolean;
}

/** Inputs accepted by project checks and uninstall operations. */
export interface ProjectTargetArguments {
  target: string;
  browser?: Exclude<Browser, 'all' | 'none'>;
}

interface ProjectState {
  owner: string;
  stack: 'python' | 'typescript';
  target: string;
  files: Record<string, string>;
  directories: string[];
  qa_template_version?: string;
  language_template_version?: string;
  requirements_lock_sha256?: string;
  requirements_lock_meta_sha256?: string;
}

/**
 * Generates a language project and records every copied template file.
 */
export async function projectInit(
  env: Environment,
  initial: ProjectInitArguments,
): Promise<number> {
  const args = { ...initial };
  if (!['python', 'typescript'].includes(args.stack)) {
    throw new Error('Invalid stack');
  }
  args.browser ??= 'chromium';
  if (!['chromium', 'firefox', 'webkit', 'all', 'none'].includes(args.browser)) {
    throw new Error('Invalid browser');
  }
  const target = resolve(args.target);
  if (
    isLink(target) ||
    overlapsEnvironment(target, env.root)
  ) {
    throw new Error(
      'Project must be separate from environment root; linked target is unsupported',
    );
  }
  env.requireInitialized(args.stack);
  const markerPath = join(target, '.qa-project.json');
  assertSafeProjectPath(target, markerPath);
  let state: ProjectState;
  if (existsSync(markerPath)) {
    state = JSON.parse(readFileSync(markerPath, 'utf8')) as ProjectState;
    if (
      state.owner !== OWNER ||
      state.stack !== args.stack ||
      state.target !== target
    ) {
      throw new Error('Project marker mismatch');
    }
  } else {
    state = {
      owner: OWNER,
      stack: args.stack,
      target,
      files: {},
      directories: [],
    };
  }
  mkdirSync(target, { recursive: true });
  const templateRoot = join(env.repo, 'src/templates', args.stack);
  const sharedRoot = join(env.repo, 'src/templates/qa');
  templateVersion(templateRoot);
  templateVersion(sharedRoot);
  const files = walkTemplate(templateRoot).map(
    (source) => [source, source.slice(templateRoot.length + 1)] as const,
  );
  files.push(
    ...walkTemplate(sharedRoot).map(
      (source) =>
        [source, join('docs/qa', source.slice(sharedRoot.length + 1))] as const,
    ),
  );
  for (const [source, relative] of files) {
    const output = join(target, relative);
    assertSafeProjectPath(target, output);
    if (existsSync(output)) {
      console.log(`KEEP ${relative.split('\\').join('/')}`);
    } else {
      mkdirSync(join(output, '..'), { recursive: true });
      copyFileSync(source, output);
      state.files[relative.split('\\').join('/')] = digest(output);
    }
  }
  const installedVersion = join(target, 'docs/qa/VERSION');
  state.qa_template_version = templateVersion(join(installedVersion, '..'));
  state.language_template_version = templateVersion(target);
  const dependency = args.stack === 'python' ? '.venv' : 'node_modules';
  const dependencyRoot = join(target, dependency);
  if (isLink(dependencyRoot) || !within(dependencyRoot, target)) {
    throw new Error(`Linked or escaping dependency directory: ${dependencyRoot}`);
  }
  if (!existsSync(dependencyRoot) && !state.directories.includes(dependency)) {
    state.directories.push(dependency);
  }
  // Persist ownership before any fallible dependency installation.
  atomicJson(markerPath, state);
  let browserCommand: string[];
  if (args.stack === 'python') {
    const python = join(
      target,
      '.venv',
      WINDOWS ? 'Scripts/python.exe' : 'bin/python',
    );
    if (!existsSync(python)) {
      env.run([
        env.uv,
        '--no-config',
        'venv',
        '--python',
        env.python(),
        join(target, '.venv'),
      ]);
    }
    const requirementsSource = join(target, 'requirements.in');
    const requirementsLock = join(target, 'requirements.lock');
    const lockMetadata = join(target, 'requirements.lock.meta.json');
    for (const path of [requirementsSource, requirementsLock, lockMetadata]) {
      assertSafeProjectPath(target, path);
    }
    let requirementsFile = join(target, 'requirements.txt');
    if (existsSync(requirementsSource)) {
      const sourceDigest = digest(requirementsSource);
      let lockDigest: string | undefined;
      if (existsSync(lockMetadata)) {
        try {
          lockDigest = (
            JSON.parse(readFileSync(lockMetadata, 'utf8')) as {
              requirements_in_sha256?: string;
            }
          ).requirements_in_sha256;
        } catch {
          lockDigest = undefined;
        }
      }
      if (!existsSync(requirementsLock) || lockDigest !== sourceDigest) {
        if (
          (existsSync(requirementsLock) &&
            (!state.requirements_lock_sha256 ||
              digest(requirementsLock) !== state.requirements_lock_sha256)) ||
          (existsSync(lockMetadata) &&
            (!state.requirements_lock_meta_sha256 ||
              digest(lockMetadata) !== state.requirements_lock_meta_sha256))
        ) {
          throw new Error(
            'Existing requirements lock or metadata is unmanaged or modified; regenerate it manually',
          );
        }
        env.run(
          [
            env.uv,
            '--no-config',
            'pip',
            'compile',
            requirementsSource,
            '--python',
            env.python(),
            '--universal',
            '--generate-hashes',
            '--output-file',
            requirementsLock,
          ],
          { cwd: target },
        );
        atomicJson(lockMetadata, {
          schema: 1,
          requirements_in_sha256: sourceDigest,
        });
        state.requirements_lock_meta_sha256 = digest(lockMetadata);
        if (existsSync(requirementsLock)) {
          state.requirements_lock_sha256 = digest(requirementsLock);
        }
        atomicJson(markerPath, state);
      }
      requirementsFile = requirementsLock;
    }
    env.run([
      env.uv,
      '--no-config',
      'pip',
      'install',
      '--python',
      python,
      '-r',
      requirementsFile,
    ]);
    browserCommand = [python, '-m', 'playwright'];
  } else {
    env.pnpm(
      [
        'install',
        ...(existsSync(join(target, 'pnpm-lock.yaml'))
          ? ['--frozen-lockfile']
          : []),
      ],
      { cwd: target },
    );
    browserCommand = [
      env.node,
      join(target, 'node_modules/@playwright/test/cli.js'),
    ];
  }
  if (args.browser !== 'none') {
    const options = ['install'];
    if (args.withDeps) {
      options.push('--with-deps');
    }
    if (args.browser !== 'all') {
      options.push(args.browser);
    }
    env.run([...browserCommand, ...options], { cwd: target });
  }
  if (args.stack === 'python') {
    const python = join(
      target,
      '.venv',
      WINDOWS ? 'Scripts/python.exe' : 'bin/python',
    );
    env.run([python, '-m', 'pytest', 'tests/unit', 'tests/functional', '-q'], {
      cwd: target,
    });
  } else {
    env.playwright(
      target,
      'test',
      'tests/unit',
      'tests/functional',
      '--project=chromium',
    );
  }
  console.log(
    `Project ready: ${target}. QA templates: ${state.qa_template_version}. ` +
      `Language template: ${state.language_template_version}. ` +
      `Run: qa project check ${target}`,
  );
  return 0;
}

/**
 * Validates a managed project and runs its functional, browser, and type checks.
 */
export function projectCheck(
  env: Environment,
  args: ProjectTargetArguments,
): number {
  const { target, state } = projectMarker(args.target);
  if (overlapsEnvironment(target, env.root)) {
    throw new Error('Project overlaps environment');
  }
  env.requireInitialized(state.stack);
  const testPaths = ['tests/unit', 'tests/functional', 'tests/e2e'];
  if (process.env.REQUIRE_API_TESTS === '1') {
    testPaths.push('tests/api');
  }
  if (state.stack === 'python') {
    if (
      existsSync(join(target, 'requirements.in')) &&
      !existsSync(join(target, 'requirements.lock'))
    ) {
      throw new Error(
        'Missing requirements.lock; rerun project init with the same target',
      );
    }
    const python = join(
      target,
      '.venv',
      WINDOWS ? 'Scripts/python.exe' : 'bin/python',
    );
    if (existsSync(join(target, 'requirements.in'))) {
      env.run([python, join(target, 'scripts/check_lock.py')], {
        cwd: target,
      });
    }
    env.run([
      python,
      '-m',
      'pytest',
      ...testPaths,
      '--browser',
      args.browser ?? 'chromium',
      '--tracing',
      'retain-on-failure',
      '--screenshot',
      'only-on-failure',
    ], { cwd: target });
  } else {
    if (!existsSync(join(target, 'pnpm-lock.yaml'))) {
      throw new Error(
        'Missing pnpm-lock.yaml; rerun project init with the same target',
      );
    }
    env.run([env.bunBin, join(target, 'scripts/check_lock.ts')], {
      cwd: target,
    });
    env.playwright(
      target,
      'test',
      ...testPaths,
      `--project=${args.browser ?? 'chromium'}`,
    );
    env.run(
      [
        env.bunBin,
        join(target, 'node_modules/typescript/bin/tsc'),
        '--noEmit',
      ],
      { cwd: target },
    );
  }
  return 0;
}

/**
 * Removes managed dependencies and unchanged templates while preserving edits.
 */
export async function projectUninstall(
  env: Environment,
  args: ProjectTargetArguments,
): Promise<number> {
  const { target, markerPath, state } = projectMarker(args.target);
  env.requireInitialized(state.stack);
  if (overlapsEnvironment(target, env.root)) {
    throw new Error('Project overlaps environment');
  }
  for (const relative of Object.keys(state.files)) {
    assertSafeProjectPath(target, join(target, relative), 'manifest');
  }
  for (const relative of state.directories) {
    if (relative !== '.venv' && relative !== 'node_modules') {
      throw new Error('Invalid managed dependency directory');
    }
    assertSafeProjectPath(target, join(target, relative), 'manifest');
  }
  const retained: Record<string, string> = {};
  for (const [relative, expected] of Object.entries(state.files)) {
    const path = join(target, relative);
    assertSafeProjectPath(target, path, 'manifest');
    if (existsSync(path) && digest(path) === expected) {
      unlinkSync(path);
    } else if (existsSync(path)) {
      console.log(`KEEP modified: ${relative}`);
      retained[relative] = expected;
    }
  }
  for (const relative of state.directories) {
    const path = join(target, relative);
    assertSafeProjectPath(target, path, 'manifest');
    removeOwned(path, target);
  }
  unlinkSync(markerPath);
  console.log(
    `Project uninstalled; preserved ${Object.keys(retained).length} changed template files and all untracked files.`,
  );
  return 0;
}

/** Reads and validates a project ownership marker. */
export function projectMarker(targetInput: string): {
  target: string;
  markerPath: string;
  state: ProjectState;
} {
  const raw = resolve(targetInput);
  if (isLink(raw)) {
    throw new Error('Linked project root is unsupported');
  }
  const target = raw;
  const markerPath = join(target, '.qa-project.json');
  assertSafeProjectPath(target, markerPath, 'manifest');
  if (!existsSync(markerPath)) {
    throw new Error(`Missing project marker: ${markerPath}`);
  }
  const state = JSON.parse(readFileSync(markerPath, 'utf8')) as ProjectState;
  if (state.owner !== OWNER || state.target !== target) {
    throw new Error('Unmanaged or relocated project');
  }
  return { target, markerPath, state };
}

function walkTemplate(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTemplate(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Resolves existing ancestors before checking project/environment overlap. */
function overlapsEnvironment(target: string, environment: string): boolean {
  const actualTarget = resolveExistingAncestor(target);
  const actualEnvironment = resolveExistingAncestor(environment);
  return within(actualTarget, actualEnvironment) || within(actualEnvironment, actualTarget);
}

/** Resolves links in existing ancestors while preserving a missing suffix. */
function resolveExistingAncestor(path: string): string {
  let ancestor = path;
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  return resolve(realpathSync(ancestor), relativePath(ancestor, path));
}

/** Refuses links in any existing path component within a project. */
function assertSafeProjectPath(
  target: string,
  path: string,
  kind: 'project' | 'manifest' = 'project',
): void {
  if (!within(path, target) || isLink(target)) {
    throw new Error(`Unsafe ${kind} path: ${path}`);
  }
  let current = target;
  for (const component of relativePath(target, path).split(sep).filter(Boolean)) {
    current = join(current, component);
    if (isLink(current)) {
      throw new Error(`Unsafe ${kind} path: ${path}`);
    }
  }
}
