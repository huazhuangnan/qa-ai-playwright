import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'bun:test';
import { checkTemplates, listTemplates } from '../packages/qa-cli/cli/template-status.ts';

test('template status lists and checks delivered templates', () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-template-status-'));
  try {
    for (const name of ['python', 'typescript', 'qa']) {
      const dir = join(root, 'packages/templates', name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'VERSION'), '0.0.1\n');
    }
    assert.equal(listTemplates(root).every((item) => item.status === 'ok'), true);
    assert.equal(checkTemplates(root).ok, true);
    rmSync(join(root, 'packages/templates/qa/VERSION'));
    assert.equal(checkTemplates(root).ok, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
