import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

import {
  readMcpServerConfig,
  type McpServerConfig,
} from '../packages/qa-ai-playwright/src/cli/shared.ts';

interface JsonRpcMessage {
  id?: number;
  error?: unknown;
  result?: {
    serverInfo?: unknown;
    tools?: unknown[];
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
  root: string,
): Promise<number> {
  assert.ok(server.command, `${name} command is missing`);
  const child = spawn(server.command, server.args ?? [], {
    cwd: root,
    env: { ...process.env, ...(server.env ?? {}) },
    stdio: ['pipe', 'pipe', 'ignore'],
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
    const initialized = await waitForResponse(messages, 1);
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
    const tools = (await waitForResponse(messages, 2)).tools ?? [];
    assert.ok(tools.length > 0, `${name}: no tools returned`);
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
  const config = join(root, 'codex/config.toml');
  const state = JSON.parse(
    readFileSync(join(root, 'state.json'), 'utf8'),
  ) as { profile?: string };
  const names = state.profile === 'full'
    ? ['playwright', 'agent-browser']
    : ['playwright'];
  for (const name of names) {
    const server = readMcpServerConfig(config, name);
    await smokeServer(name, server, root);
  }
  console.log('MCP initialize and tools/list passed');
}

await main();
