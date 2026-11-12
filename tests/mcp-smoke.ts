import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

import {
  readMcpServerConfig,
  type McpServerConfig,
} from '../packages/qa-cli/cli/shared.ts';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface JsonRpcMessage {
  id?: number;
  error?: unknown;
  result?: {
    serverInfo?: unknown;
    tools?: Array<{ name?: string }>;
    content?: Array<{ type?: string; text?: string }>;
    isError?: boolean;
  };
}

/** Writes one JSON-RPC request to an MCP server. */
function send(
  process: { stdin: Writable },
  payload: unknown,
): void {
  process.stdin.write(`${JSON.stringify(payload)}\n`);
}

/** Reads lines until the response with the requested ID arrives. */
async function waitForResponse(
  messages: AsyncIterator<string>,
  requestId: number,
  timeoutMs = 30_000,
  strict = false,
): Promise<NonNullable<JsonRpcMessage['result']>> {
  while (true) {
    const next = messages.next();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`MCP response ${requestId} timed out`)),
        timeoutMs,
      );
    });
    try {
      const result = await Promise.race([next, timeout]);
      if (result.done) {
        throw new Error('MCP server closed stdout');
      }
      let payload: JsonRpcMessage;
      try {
        payload = JSON.parse(result.value) as JsonRpcMessage;
      } catch {
        if (strict) {
          throw new Error('MCP stdout contained non-JSON output');
        }
        continue;
      }
      if (payload.id !== requestId) {
        continue;
      }
      if (payload.error !== undefined) {
        throw new Error(JSON.stringify(payload.error));
      }
      return payload.result ?? {};
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}

/** Initializes one MCP server and lists its exposed tools. */
async function smokeServer(
  name: string,
  server: McpServerConfig,
): Promise<number> {
  assert.ok(server.command, `${name} command is missing`);
  const child = spawn(server.command, server.args ?? [], {
    cwd: REPO,
    env: { ...process.env, ...(server.env ?? {}) },
    stdio: ['pipe', 'pipe', 'inherit'],
    windowsHide: true,
  });
  const reader = createInterface({ input: child.stdout });
  const messages = reader[Symbol.asyncIterator]();
  try {
    send(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'qa-smoke', version: '1.0.0' },
      },
    });
    const initialized = await waitForResponse(messages, 1, 30_000, name === 'qa');
    assert.ok(initialized.serverInfo, `${name}: missing serverInfo`);
    send(child, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    send(child, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    const tools = (await waitForResponse(messages, 2, 30_000, name === 'qa')).tools ?? [];
    assert.ok(tools.length > 0, `${name}: no tools returned`);
    if (name === 'qa') {
      for (const expected of ['qa_template_list', 'qa_template_check', 'qa_env_list', 'qa_env_repair', 'qa_env_uv_plan', 'qa_env_uv_upgrade', 'qa_env_uv_snapshots', 'qa_env_uv_rollback', 'qa_project_plan', 'qa_project_upgrade', 'qa_project_repair', 'qa_project_snapshots', 'qa_project_rollback', 'qa_mcp_list', 'qa_mcp_check', 'qa_mcp_repair', 'qa_skills_list', 'qa_skills_recover', 'qa_skills_snapshots', 'qa_skills_rollback', 'qa_skills_check', 'qa_skills_install', 'qa_skills_upgrade', 'qa_skills_repair', 'qa_skills_uninstall']) {
        assert.ok(tools.some((tool) => tool.name === expected), `missing ${expected}`);
      }
      send(child, {
        jsonrpc: '2.0', id: 3, method: 'tools/call',
        params: { name: 'qa_mcp_list', arguments: {} },
      });
      const result = await waitForResponse(messages, 3, 30_000, true);
      assert.notEqual(result.isError, true, `qa_mcp_list failed: ${JSON.stringify(result.content)}`);
      assert.match(JSON.stringify(result.content), /faker/);
      send(child, {
        jsonrpc: '2.0', id: 4, method: 'tools/call',
        params: { name: 'qa_mcp_add', arguments: { name: 'unknown' } },
      });
      const failure = await waitForResponse(messages, 4, 30_000, true);
      assert.equal(failure.isError, true, 'unknown MCP must fail');
    }
    console.log(`${name}: ${tools.length} tools`);
    return tools.length;
  } finally {
    reader.close();
    child.stdin.end();
    await Promise.race([
      once(child, 'exit'),
      new Promise<void>((resolveDelay) => {
        setTimeout(() => {
          child.kill();
          resolveDelay();
        }, 5_000);
      }),
    ]);
  }
}

/** Runs smoke checks against the MCP servers enabled by the profile. */
async function main(): Promise<void> {
  const root = resolve(process.env.QA_ROOT ?? '');
  if (!process.env.QA_ROOT) {
    throw new Error('QA_ROOT is required');
  }
  const codexHome = process.env.CODEX_HOME;
  if (!codexHome) throw new Error('CODEX_HOME is required for isolated MCP smoke tests');
  const config = join(codexHome, 'config.toml');
  const realRoot = realpathSync(root);
  const normalizedRoot = process.platform === 'win32' ? realRoot.toLowerCase() : realRoot;
  const id = createHash('sha256').update(normalizedRoot).digest('hex').slice(0, 16);
  const state = JSON.parse(
    readFileSync(join(root, 'state.json'), 'utf8'),
  ) as { profile?: string };
  const names = state.profile === 'full'
    ? ['qa', 'playwright', 'agent-browser']
    : ['qa', 'playwright'];
  for (const name of names) {
    const server = readMcpServerConfig(config, `qa-${id}-${name}`);
    await smokeServer(name, server);
  }
  console.log('MCP initialize and tools/list passed');
}

await main();
