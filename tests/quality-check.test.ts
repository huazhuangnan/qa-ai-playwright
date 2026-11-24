import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'bun:test';
import { checkQuality } from '../packages/qa-cli/cli/quality-check.ts';

test('quality check reports forbidden test patterns and sensitive artifacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-quality-check-'));
  try {
    mkdirSync(join(root, 'tests'), { recursive: true });
    const focused = ['test', 'only'].join('.');
    const fixedWait = ['page', 'waitForTimeout'].join('.');
    const forced = ['force', 'true'].join(': ');
    const click = ['page', 'click'].join('.');
    writeFileSync(join(root, 'tests/example.ts'), `${focused}("x", async () => ${fixedWait}(1));\nconst value: ${'any'} = 1;\nawait ${click}("x", { ${forced} });\n`);
    writeFileSync(join(root, '.env'), 'TOKEN=secret\n');
    const result = checkQuality(root);
    assert.equal(result.ok, false);
    assert.equal(result.checkedFiles, 1);
    assert.equal(result.findings.filter((finding) => finding.path.endsWith('example.ts')).length, 4);
    assert.equal(result.findings.some((finding) => finding.rule === 'no-sensitive-artifact'), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('quality check passes clean source and ignores dependencies', () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-quality-clean-'));
  try {
    mkdirSync(join(root, 'node_modules/pkg'), { recursive: true });
    writeFileSync(join(root, 'clean.ts'), 'const value: number = 1;\n');
    writeFileSync(join(root, 'node_modules/pkg/bad.ts'), `${['test', 'only'].join('.')}("ignored");\n`);
    const result = checkQuality(root);
    assert.equal(result.ok, true);
    assert.equal(result.checkedFiles, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
