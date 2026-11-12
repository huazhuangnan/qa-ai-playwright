import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'bun:test';
import { Environment } from '../packages/qa-cli/cli/environment.ts';
import { type McpServerConfig } from '../packages/qa-cli/cli/shared.ts';

/** Simulates Codex registration changes without invoking a user installation. */
class FakeCodexEnvironment extends Environment {
  failAdd = false;
  override codex(args: readonly (string | number)[]): string | undefined {
    if (args[1] === 'remove') {
      const name = String(args[2]);
      let selected = false;
      const lines = readFileSync(this.mcpConfig, 'utf8').split('\n').filter((line) => {
        const header = /^\[mcp_servers\.([^\].]+)(?:\.[^\]]+)?\]$/.exec(line);
        if (header) selected = header[1] === name;
        return !selected;
      });
      writeFileSync(this.mcpConfig, lines.join('\n'), 'utf8');
    } else if (args[1] === 'add') {
      if (this.failAdd) throw new Error('simulated add failure');
      const values = args.map(String);
      const separator = values.indexOf('--');
      const env: Record<string, string> = {};
      for (let index = 3; index < separator; index += 2) {
        const assignment = values[index + 1] ?? '';
        const equals = assignment.indexOf('=');
        env[assignment.slice(0, equals)] = assignment.slice(equals + 1);
      }
      const server = values[2];
      let text = `[mcp_servers.${server}]\ncommand = ${JSON.stringify(values[separator + 1])}\nargs = ${JSON.stringify(values.slice(separator + 2))}\n`;
      if (Object.keys(env).length) {
        text += `\n[mcp_servers.${server}.env]\n`;
        for (const [key, value] of Object.entries(env)) text += `${key} = ${JSON.stringify(value)}\n`;
      }
      const previous = existsSync(this.mcpConfig) ? readFileSync(this.mcpConfig, 'utf8') : '';
      writeFileSync(this.mcpConfig, `${previous}${previous ? '\n' : ''}${text}`, 'utf8');
    }
    return undefined;
  }
}

test('hashed registration migrates only when ownership and contents match', () => {
  const base = mkdtempSync(join(tmpdir(), 'qa-mcp-name-'));
  try {
    const env = new FakeCodexEnvironment({ root: join(base, 'root'), env: {} });
    Object.defineProperty(env, 'mcpConfig', { value: join(base, 'codex', 'config.toml') });
    mkdirSync(dirname(env.mcpConfig), { recursive: true });
    const root = process.platform === 'win32' ? env.root.toLowerCase() : env.root;
    const oldName = `qa-${createHash('sha256').update(root).digest('hex').slice(0, 16)}-playwright`;
    const config = { command: 'node', args: ['entry'] };
    const oldText = `[mcp_servers.${oldName}]\ncommand = "node"\nargs = ["entry"]\n`;
    const lockPath = join(dirname(env.mcpConfig), 'qa-ai-playwright-mcp.lock.json');
    const record = { name: 'playwright', scope: 'user', root: env.root, source_type: 'external',
      manifest: 'packages/mcp/external/playwright.json', snapshot: oldText.trim(), config };
    writeFileSync(env.mcpConfig, oldText);
    writeFileSync(lockPath, JSON.stringify({ schema: 1, servers: { [oldName]: record } }));

    writeFileSync(env.mcpConfig, `${oldText}timeout_sec = 30\n`);
    assert.throws(() => env.registerMcp('playwright', config, 'external', '0.0.85'), /Preserving|differs|conflict/i);
    assert.match(readFileSync(env.mcpConfig, 'utf8'), /timeout_sec = 30/);

    writeFileSync(env.mcpConfig, `${oldText}\n[mcp_servers.qa-playwright]\ncommand = "user"\n`);
    const conflict = readFileSync(env.mcpConfig, 'utf8');
    assert.throws(() => env.registerMcp('playwright', config, 'external', '0.0.85'), /exists|conflict/i);
    assert.equal(readFileSync(env.mcpConfig, 'utf8'), conflict);

    writeFileSync(env.mcpConfig, oldText);
    env.registerMcp('playwright', config, 'external', '0.0.85');
    const result = readFileSync(env.mcpConfig, 'utf8');
    assert.match(result, /\[mcp_servers\.qa-playwright\]/);
    assert.ok(!result.includes(`[mcp_servers.${oldName}]`));
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    assert.ok(lock.servers['qa-playwright']);
    assert.equal(lock.servers[oldName], undefined);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('owned browser registrations migrate paths and preserve user edits', () => {
  const base = mkdtempSync(join(tmpdir(), 'qa-mcp-browser-'));
  try {
    const env = new FakeCodexEnvironment({ root: join(base, 'root with spaces'), env: {} });
    Object.defineProperty(env, 'mcpConfig', { value: join(base, 'codex', 'config.toml') });
    mkdirSync(dirname(env.mcpConfig), { recursive: true });
    const old: McpServerConfig = { command: 'node', args: ['entry'] };
    const updated: McpServerConfig = { command: 'node', args: ['entry', '--executable-path', 'new browser'] };
    env.registerMcp('playwright', old, 'external', '0.0.85');
    env.registerMcp('playwright', updated, 'external', '0.0.85');
    assert.match(readFileSync(env.mcpConfig, 'utf8'), /new browser/);
    const beforeConflict = readFileSync(env.mcpConfig, 'utf8');
    assert.throws(() => env.registerMcp('playwright', { ...old, command: 'other-node' }, 'external', '0.0.85'), /differs|conflict/);
    assert.equal(readFileSync(env.mcpConfig, 'utf8'), beforeConflict);
    const edited = `${readFileSync(env.mcpConfig, 'utf8')}timeout_sec = 30\n`;
    writeFileSync(env.mcpConfig, edited, 'utf8');
    assert.throws(() => env.registerMcp('playwright', old, 'external', '0.0.85'), /differs|conflict/);
    assert.equal(readFileSync(env.mcpConfig, 'utf8'), edited);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('failed migration keeps ownership and can be retried', () => {
  const base = mkdtempSync(join(tmpdir(), 'qa-mcp-retry-'));
  try {
    const env = new FakeCodexEnvironment({ root: join(base, 'root'), env: {} });
    Object.defineProperty(env, 'mcpConfig', { value: join(base, 'codex', 'config.toml') });
    mkdirSync(dirname(env.mcpConfig), { recursive: true });
    const previous = { command: 'node', args: ['entry'], env: { AGENT_BROWSER_EXECUTABLE_PATH: 'old browser' } };
    const next = { ...previous, env: { AGENT_BROWSER_EXECUTABLE_PATH: 'new browser' } };
    env.registerMcp('agent-browser', previous, 'external', '0.42.0');
    env.failAdd = true;
    assert.throws(() => env.registerMcp('agent-browser', next, 'external', '0.42.0'), /ownership record is preserved/);
    const lock = readFileSync(join(dirname(env.mcpConfig), 'qa-ai-playwright-mcp.lock.json'), 'utf8');
    assert.ok(lock.includes('qa-agent-browser'));
    env.failAdd = false;
    env.registerMcp('agent-browser', next, 'external', '0.42.0');
    assert.match(readFileSync(env.mcpConfig, 'utf8'), /new browser/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
