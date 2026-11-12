import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { assertPackageLinks, packageEntries } from './package-layout.ts';

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

const userEntries = packageEntries(files);
const userFiles = userEntries.map((entry) => entry.source);
assertPackageLinks(userEntries, (source) => readFileSync(join(repo, source), 'utf8'));
assertPortableText(userFiles);
assertPortablePaths(userFiles);
createArchive(userEntries);

/** Rejects BOM and CRLF in text files shipped with the delivery archive. */
function assertPortableText(selectedFiles: string[]): void {
  const textExtensions = new Set([
    '.cmd', '.env', '.example', '.gitignore', '.in', '.ini', '.js',
    '.json', '.lock', '.md', '.ps1', '.py', '.sh', '.toml', '.ts',
    '.txt', '.yaml', '.yml',
  ]);
  for (const relative of selectedFiles) {
    const lower = relative.toLowerCase();
    const name = lower.split('/').at(-1) ?? '';
    if (
      !textExtensions.has(lower.slice(lower.lastIndexOf('.'))) &&
      !['changelog', 'license', 'notice', 'readme', 'version'].includes(name)
    ) {
      continue;
    }
    const content = readFileSync(join(repo, relative));
    if (content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf) {
      throw new Error(`UTF-8 BOM is not allowed in ${relative}`);
    }
    if (content.includes(0x0d)) {
      throw new Error(`CRLF is not allowed in ${relative}`);
    }
  }
}

/** Rejects archive paths that cannot be represented safely on Windows. */
function assertPortablePaths(selectedFiles: string[]): void {
  const reserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
  for (const relative of selectedFiles) {
    for (const part of relative.split('/')) {
      if (
        /[<>:"|?*\u0000-\u001f]/u.test(part) ||
        /[ .]$/u.test(part) ||
        reserved.test(part)
      ) {
        throw new Error(`Path is not portable to Windows: ${relative}`);
      }
    }
  }
}

function createArchive(selectedEntries: ReturnType<typeof packageEntries>): void {
  const stage = join(output, `qa-ai-playwright-v${version}`);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  for (const entry of selectedEntries) {
    const source = join(repo, entry.source);
    const target = join(stage, entry.target);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
  }

  const zip = join(output, `qa-ai-playwright-v${version}.zip`);
  rmSync(zip, { force: true });
  run('zip', ['-q', '-r', zip, basename(stage)], output);
  rmSync(stage, { recursive: true, force: true });
  console.log(`Created ${zip}`);
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(command: string, args: string[], cwd: string): void {
  if (!existsSync(cwd)) throw new Error(`Output directory does not exist: ${cwd}`);
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}
