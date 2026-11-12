import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'bun:test';

import { Environment } from '../packages/qa-cli/cli/environment.ts';
import { findSystemBrowser } from '../packages/qa-cli/cli/browser-discovery.ts';

test('prefers an available Chrome, allows Edge explicitly, and passes the selected executable to MCP', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'qa-system-browser-'));
  try {
    const bin = join(workspace, 'browser path with spaces');
    mkdirSync(bin, { recursive: true });
    const chrome = join(bin, process.platform === 'win32' ? 'chrome.exe' : 'google-chrome');
    const edge = join(bin, process.platform === 'win32' ? 'msedge.exe' : 'microsoft-edge');
    for (const path of [chrome, edge]) { writeFileSync(path, 'browser'); chmodSync(path, 0o755); }
    const env = new Environment({ root: join(workspace, 'environment'), env: { PATH: bin, HOME: workspace } });
    const selected = findSystemBrowser(env.environment);
    assert.equal(selected?.channel, 'chrome');
    assert.equal(env.findBrowser('msedge')?.channel, 'msedge');
    assert.equal(env.findBrowser()?.channel, 'chrome');
    assert.equal(env.variables().QA_BROWSER_CHANNEL, 'chrome');
    assert.equal(env.variables().AGENT_BROWSER_EXECUTABLE_PATH, selected?.path);
    assert.equal(env.variables().QA_BROWSER_EXECUTABLE_PATH, selected?.path);
    const args = env.playwrightMcpServer('mcp entry.js').args ?? [];
    assert.equal(args[args.indexOf('--executable-path') + 1], selected?.path);
    const explicit = new Environment({ root: join(workspace, 'other'), env: { PATH: bin, HOME: workspace, QA_BROWSER_CHANNEL: 'msedge' } });
    assert.equal(explicit.variables().QA_BROWSER_CHANNEL, 'msedge');
    const pinned = new Environment({ root: join(workspace, 'pinned'), env: { PATH: bin, HOME: workspace, QA_BROWSER_CHANNEL: 'msedge', QA_BROWSER_EXECUTABLE_PATH: edge } });
    assert.equal(pinned.findBrowser()?.path, edge);
    const missing = new Environment({ root: join(workspace, 'missing'), env: { PATH: bin, HOME: workspace, QA_BROWSER_CHANNEL: 'msedge', QA_BROWSER_EXECUTABLE_PATH: join(workspace, 'missing browser') } });
    assert.equal(missing.findBrowser(), undefined);
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});

test('reuses available Chromium when no system browser is discovered', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'qa-managed-browser-'));
  try {
    const env = new Environment({ root: join(workspace, 'environment'), env: { PATH: '', HOME: workspace } });
    const executable = join(env.root, 'cache/browsers/chromium-1254/chrome-win64/chrome.exe');
    mkdirSync(dirname(executable), { recursive: true });
    writeFileSync(executable, 'browser');
    assert.equal(env.findBrowser('chromium')?.path, executable);
    assert.equal(new Environment({ root: join(workspace, 'explicit'), env: { PATH: '', HOME: workspace, QA_BROWSER_CHANNEL: '' } }).findBrowser(), undefined);
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});

test('prefers system Chromium over the environment cache and propagates its executable', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'qa-system-chromium-'));
  try {
    const bin = join(workspace, 'browser with spaces');
    mkdirSync(bin, { recursive: true });
    const executable = join(bin, process.platform === 'win32' ? 'chromium.exe' : 'chromium');
    writeFileSync(executable, 'browser');
    chmodSync(executable, 0o755);
    const env = new Environment({ root: join(workspace, 'environment'), env: { PATH: bin, HOME: workspace } });
    env.save();
    const managed = join(env.root, 'cache/browsers/chromium-1254/chrome-win64/chrome.exe');
    mkdirSync(dirname(managed), { recursive: true });
    writeFileSync(managed, 'browser');
    assert.equal(env.findBrowser('chromium')?.scope, 'system-or-user');
    const pinned = new Environment({ root: env.root, env: { PATH: bin, HOME: workspace, QA_BROWSER_CHANNEL: '', QA_BROWSER_EXECUTABLE_PATH: executable } });
    assert.equal(pinned.findBrowser()?.path, executable);
    assert.equal(pinned.variables().QA_BROWSER_EXECUTABLE_PATH, executable);
    assert.equal(pinned.variables().AGENT_BROWSER_EXECUTABLE_PATH, executable);
    const managedOnly = new Environment({ root: env.root, env: { PATH: bin, HOME: workspace, QA_BROWSER_CHANNEL: '' } });
    assert.equal(managedOnly.findBrowser()?.path, managed);
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});

test('Playwright MCP reuses a detected system browser without downloading Chromium', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'qa-mcp-browser-'));
  try {
    const env = new Environment({ root: join(workspace, 'environment'), env: { PATH: '', HOME: workspace } });
    const pkg = join(workspace, 'mcp');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, 'package.json'), '{"version":"0.0.85"}');
    writeFileSync(join(pkg, 'cli.js'), '');
    Object.defineProperty(env, 'playwrightMcpPackage', { value: pkg });
    const browser = { channel: 'chrome' as const, scope: 'system-or-user' as const, path: join(workspace, 'Chrome with spaces') };
    env.findBrowser = () => browser;
    env.registerMcp = () => {};
    env.run = () => { throw new Error('Unexpected browser installation'); };
    assert.equal(await env.ensurePlaywrightMcp(), '0.0.85');
    const records = env.state.installations as Record<string, { path?: string; source?: string }>;
    assert.equal(records.chrome?.path, browser.path);
    assert.equal(records.chrome?.source, 'reused');
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});

test('Playwright MCP installs managed Chromium only after discovery finds no browser', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'qa-mcp-install-'));
  try {
    const env = new Environment({ root: join(workspace, 'environment'), env: { PATH: '', HOME: workspace } });
    const pkg = join(workspace, 'mcp');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, 'package.json'), '{"version":"0.0.85"}');
    writeFileSync(join(pkg, 'cli.js'), '');
    Object.defineProperty(env, 'playwrightMcpPackage', { value: pkg });
    const executable = join(env.root, 'cache/browsers/chromium-1254/chrome-win64/chrome.exe');
    env.findBrowser = () => env.playwrightChromiumExecutable() ? { channel: 'chromium', scope: 'environment', path: executable } : undefined;
    env.registerMcp = () => {};
    const commands: Array<readonly (string | number)[]> = [];
    env.run = (command) => { commands.push(command); mkdirSync(dirname(executable), { recursive: true }); writeFileSync(executable, 'browser'); return undefined; };
    assert.equal(await env.ensurePlaywrightMcp(), '0.0.85');
    assert.deepEqual(commands[0]?.slice(-2), ['install-browser', 'chromium']);
    const records = env.state.installations as Record<string, { source?: string }>;
    assert.equal(records.chromium?.source, 'qa');
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});

test('an explicitly selected missing browser does not trigger a substitute download', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'qa-mcp-explicit-browser-'));
  try {
    const env = new Environment({ root: join(workspace, 'environment'), env: { PATH: '', HOME: workspace, QA_BROWSER_CHANNEL: 'chrome', QA_BROWSER_EXECUTABLE_PATH: join(workspace, 'missing') } });
    const pkg = join(workspace, 'mcp');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, 'package.json'), '{"version":"0.0.85"}');
    writeFileSync(join(pkg, 'cli.js'), '');
    Object.defineProperty(env, 'playwrightMcpPackage', { value: pkg });
    env.run = () => { throw new Error('Unexpected browser installation'); };
    await assert.rejects(env.ensurePlaywrightMcp(), /Requested browser channel or executable/);
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});

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
