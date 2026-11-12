import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'bun:test';
import { Environment } from '../packages/qa-cli/cli/environment.ts';
import { WINDOWS, type McpServerConfig } from '../packages/qa-cli/cli/shared.ts';

/** Simulates Codex registration changes without invoking a user installation. */
class FakeCodexEnvironment extends Environment {
  failAdd = false;
  override codex(args: readonly (string | number)[]): string | undefined {
    if (args[1] === 'remove') {
      writeFileSync(this.mcpConfig, '', 'utf8');
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
      writeFileSync(this.mcpConfig, text, 'utf8');
    }
    return undefined;
  }
}

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
    const key = createHash('sha256').update(WINDOWS ? env.root.toLowerCase() : env.root).digest('hex').slice(0, 16);
    const lock = readFileSync(join(dirname(env.mcpConfig), 'qa-ai-playwright-mcp.lock.json'), 'utf8');
    assert.ok(lock.includes(`qa-${key}-agent-browser`));
    env.failAdd = false;
    env.registerMcp('agent-browser', next, 'external', '0.42.0');
    assert.match(readFileSync(env.mcpConfig, 'utf8'), /new browser/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
