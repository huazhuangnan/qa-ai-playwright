import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

/** A single static quality finding. */
export interface QualityFinding {
  rule: 'no-focused-tests' | 'no-fixed-wait' | 'no-unsafe-any' | 'no-force-locator' | 'no-sensitive-artifact';
  severity: 'error';
  path: string;
  line?: number;
  message: string;
}

export interface QualityCheckResult {
  root: string;
  findings: QualityFinding[];
  checkedFiles: number;
  ok: boolean;
}

const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py']);
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', 'playwright-report', 'test-results']);
const ignoredFiles = new Set(['quality-check.ts']);
const sensitiveNames = /^(?:\.env(?:\..+)?|.*(?:storage-state|storageState|auth-state|authState|cookies?)\.(?:json|txt)|.*\.(?:trace|zip|webm|mp4))$/iu;

/** Scans source files and artifact names without changing the target directory. */
export function checkQuality(target = process.cwd()): QualityCheckResult {
  const root = resolve(target);
  if (!existsSync(root)) throw new Error(`Quality target does not exist: ${root}`);
  const findings: QualityFinding[] = [];
  let checkedFiles = 0;
  for (const file of walk(root)) {
    const name = file.slice(root.length + 1);
    if (ignoredFiles.has(name.split(/[\\/]/u).pop() ?? '')) continue;
    if (sensitiveNames.test(name) && !name.endsWith('.example')) {
      findings.push({ rule: 'no-sensitive-artifact', severity: 'error', path: name, message: 'Sensitive test artifact or environment file is present in the checked tree.' });
      continue;
    }
    if (!codeExtensions.has(extname(file).toLowerCase())) continue;
    checkedFiles += 1;
    const lines = readFileSync(file, 'utf8').split(/\r?\n/u);
    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      const checks: Array<[QualityFinding['rule'], RegExp, string]> = [
        ['no-focused-tests', /\b(?:test|it|describe)\.only\s*\(/u, 'Focused tests are not allowed in committed test code.'],
        ['no-fixed-wait', /\.waitForTimeout\s*\(/u, 'Use an observable condition instead of a fixed wait.'],
        ['no-unsafe-any', /:\s*any\b|\bas\s+any\b|<any>/u, 'Do not bypass the type contract with any.'],
        ['no-force-locator', /\b(?:page|locator|element|button|input)\b[^\n]*\bforce\s*:\s*true\b/u, 'Forced locator actions require an explicit, reviewable exception.'],
      ];
      for (const [rule, pattern, message] of checks) {
        if (pattern.test(line)) findings.push({ rule, severity: 'error', path: name, line: lineNumber, message });
      }
    });
  }
  return { root, findings, checkedFiles, ok: findings.length === 0 };
}

function* walk(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) yield* walk(join(directory, entry.name));
    else if (entry.isFile()) yield join(directory, entry.name);
  }
}
