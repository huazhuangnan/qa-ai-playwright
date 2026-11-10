import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const packageFile = resolve(root, 'package.json');
const lockFile = resolve(root, 'pnpm-lock.yaml');

if (!existsSync(packageFile)) {
  console.error('package.json is missing');
  process.exitCode = 1;
} else if (!existsSync(lockFile)) {
  console.error('Commit pnpm-lock.yaml before running CI');
  process.exitCode = 1;
} else if (!readFileSync(lockFile, 'utf8').includes('lockfileVersion:')) {
  console.error('pnpm-lock.yaml is invalid');
  process.exitCode = 1;
}
