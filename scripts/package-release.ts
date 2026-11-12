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

mkdirSync(output, { recursive: true });
const stage = join(output, `qa-ai-playwright-${version}`);
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

const files = execFileSync('git', ['-C', repo, 'ls-files', '-z'], { encoding: 'buffer' })
  .toString('utf8').split('\0').filter(Boolean);
if (!files.length) throw new Error('No tracked files found for release');
for (const relative of files) {
  const source = join(repo, relative);
  const target = join(stage, relative);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}

const archiveBase = `qa-ai-playwright-v${version}`;
const zip = join(output, `${archiveBase}.zip`);
rmSync(zip, { force: true });
run('zip', ['-q', '-r', zip, basename(stage)], output);
rmSync(stage, { recursive: true, force: true });
console.log(`Created ${zip}`);

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(command: string, args: string[], cwd: string): void {
  if (!existsSync(cwd)) throw new Error(`Output directory does not exist: ${cwd}`);
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}
