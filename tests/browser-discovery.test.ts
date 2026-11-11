import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'bun:test';

import { Environment } from '../packages/qa-cli/cli/environment.ts';

for (const layout of [
  'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
  'chrome-linux64/chrome',
  'chrome-win64/chrome.exe',
]) {
  test(`discovers full Playwright Chromium: ${layout}`, () => {
    const workspace = mkdtempSync(join(tmpdir(), 'qa-browser-'));
    try {
      const environment = new Environment({
        root: join(workspace, 'environment with spaces'),
        env: {},
      });
      const executable = join(environment.root, 'cache/browsers/chromium-1254', layout);
      mkdirSync(dirname(executable), { recursive: true });
      writeFileSync(executable, 'browser placeholder');
      assert.equal(environment.playwrightChromiumExecutable(), executable);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
}

test('rejects an incomplete full browser even when headless shell is present', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'qa-browser-'));
  try {
    const environment = new Environment({
      root: join(workspace, 'environment with spaces'),
      env: {},
    });
    const browsers = join(environment.root, 'cache/browsers');
    const shell = join(browsers, 'chromium_headless_shell-1254/chrome-headless-shell-mac-x64/chrome-headless-shell');
    mkdirSync(dirname(shell), { recursive: true });
    writeFileSync(shell, 'headless shell placeholder');
    mkdirSync(join(browsers, 'chromium-1254'), { recursive: true });
    assert.equal(environment.playwrightChromiumExecutable(), undefined);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
