import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

interface PackageManifest {
  name?: unknown;
  version?: unknown;
}

const repo = resolve(import.meta.dir, '..');
const output = resolve(process.cwd(), argumentValue('--output') ?? 'release');
const manifest = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')) as PackageManifest;
const version = typeof manifest.version === 'string' ? manifest.version : '';
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) throw new Error('Root package.json has no valid semantic version');

const files = execFileSync('git', ['-C', repo, 'ls-files', '-z'], { encoding: 'buffer' })
  .toString('utf8').split('\0').filter(Boolean);
if (!files.length) throw new Error('No tracked files found for release');
mkdirSync(output, { recursive: true });

createArchive(files.filter(isUserFile));

function createArchive(selectedFiles: string[]): void {
  const stage = join(output, `qa-ai-playwright-${version}`);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  for (const relative of selectedFiles) {
    const source = join(repo, relative);
    const target = join(stage, relative);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
  }

  const zip = join(output, `qa-ai-playwright-v${version}.zip`);
  rmSync(zip, { force: true });
  run('zip', ['-q', '-r', zip, basename(stage)], output);
  rmSync(stage, { recursive: true, force: true });
  console.log(`Created ${zip}`);
}

function isUserFile(relative: string): boolean {
  const normalized = relative.replaceAll('\\', '/');
  if (normalized.startsWith('.github/') || normalized.startsWith('.agents/')) return false;
  if (normalized.startsWith('apps/') || normalized.startsWith('scripts/') || normalized.startsWith('tests/')) return false;
  if (normalized === 'AGENTS.md' || normalized.endsWith('/AGENTS.md')) return false;
  if (normalized === 'package.json' || normalized === 'pnpm-lock.yaml' || normalized === 'tsconfig.json') return false;
  if (normalized.startsWith('docs/')) {
    return normalized === 'docs/environment.zh-CN.md'
      || normalized === 'docs/python.zh-CN.md'
      || normalized === 'docs/typescript.zh-CN.md'
      || normalized === 'docs/skills-mcp.zh-CN.md'
      || normalized === 'docs/qa-workflow.zh-CN.md'
      || normalized.startsWith('docs/releases/');
  }
  return normalized === 'README.md' || normalized.startsWith('packages/');
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(command: string, args: string[], cwd: string): void {
  if (!existsSync(cwd)) throw new Error(`Output directory does not exist: ${cwd}`);
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}
