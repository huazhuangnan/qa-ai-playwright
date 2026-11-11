import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

/** The QA MCP server delegates each fixed operation to the existing CLI. */
const cliPath = fileURLToPath(new URL('../../qa-cli/qa-cli.ts', import.meta.url));
const rootArgument = process.argv.slice(2);
if (rootArgument.length !== 2 || rootArgument[0] !== '--root' || !rootArgument[1] || rootArgument[1].includes('\0')) {
  console.error('Usage: bun qa-server.ts --root <environment-directory>');
  process.exit(1);
}
const root = resolve(rootArgument[1]);
const outputLimit = 2 * 1024 * 1024;
const timeoutMs = 30 * 60 * 1000;
const children = new Set<ChildProcess>();
let initialized = false;

type JsonObject = Record<string, unknown>;
type Tool = { name: string; description: string; inputSchema: JsonObject };
const stringProperty = (description: string, values?: string[]): JsonObject => ({
  type: 'string', description, ...(values ? { enum: values } : {}),
});
const schema = (properties: JsonObject = {}, required: string[] = []): JsonObject => ({
  type: 'object', properties, required, additionalProperties: false,
});
const project = stringProperty('Project directory, absolute or relative to the server working directory.');
const browser = stringProperty('Browser to use.', ['chromium', 'firefox', 'webkit', 'all', 'none']);
const tools: Tool[] = [
  { name: 'qa_env_check', description: 'Check the selected QA environment and installed tools.', inputSchema: schema({ stack: stringProperty('Environment language.', ['python', 'typescript', 'both']), full: { type: 'boolean' }, skipCodex: { type: 'boolean' }, skipSkills: { type: 'boolean' } }, ['stack']) },
  { name: 'qa_doctor', description: 'Diagnose the configured QA environment.', inputSchema: schema() },
  { name: 'qa_project_init', description: 'Initialize a project and install its dependencies.', inputSchema: schema({ project, language: stringProperty('Project language.', ['python', 'typescript']), browser, withDeps: { type: 'boolean' } }, ['project', 'language']) },
  { name: 'qa_project_check', description: 'Run the managed project checks and tests; this can take time.', inputSchema: schema({ project, browser: stringProperty('Browser to use.', ['chromium', 'firefox', 'webkit']) }, ['project']) },
  { name: 'qa_project_uninstall', description: 'Uninstall a managed project. Requires user authorization.', inputSchema: schema({ project }, ['project']) },
  { name: 'qa_mcp_list', description: 'List optional MCP servers available for installation.', inputSchema: schema() },
  { name: 'qa_mcp_add', description: 'Install and register an optional MCP server.', inputSchema: schema({ name: stringProperty('Optional MCP server name.') }, ['name']) },
  { name: 'qa_mcp_remove', description: 'Remove an optional MCP server. Requires user authorization.', inputSchema: schema({ name: stringProperty('Optional MCP server name.') }, ['name']) },
];

/** Validate input against the advertised closed, flat JSON schemas. */
function validate(tool: Tool, input: unknown): JsonObject {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('arguments must be an object');
  const args = input as JsonObject;
  const properties = tool.inputSchema.properties as Record<string, JsonObject>;
  for (const key of Object.keys(args)) {
    const spec = properties[key];
    if (!spec) throw new Error(`Unknown argument: ${key}`);
    const value = args[key];
    if (typeof value !== spec.type) throw new Error(`${key} must be a ${String(spec.type)}`);
    if (typeof value === 'string' && (!value.trim() || value.includes('\0'))) throw new Error(`${key} must be a non-empty string without NUL`);
    if (Array.isArray(spec.enum) && !spec.enum.includes(value)) throw new Error(`Invalid ${key}`);
  }
  for (const key of tool.inputSchema.required as string[]) {
    if (!(key in args)) throw new Error(`Missing argument: ${key}`);
  }
  return args;
}

/** Build a fixed argument vector; path resolution prevents positional option injection. */
function command(name: string, args: JsonObject): string[] {
  const target = () => resolve(args.project as string);
  const options = (keys: [string, string][]) => keys.flatMap(([key, flag]) => args[key] === true ? [flag] : []);
  switch (name) {
    case 'qa_env_check': return ['env', 'check', args.stack as string, ...options([['full', '--full'], ['skipCodex', '--skip-codex'], ['skipSkills', '--skip-skills']])];
    case 'qa_doctor': return ['doctor'];
    case 'qa_project_init': return ['project', 'init', target(), '--language', args.language as string, ...(args.browser ? ['--browser', args.browser as string] : []), ...options([['withDeps', '--with-deps']])];
    case 'qa_project_check': return ['project', 'check', target(), ...(args.browser ? ['--browser', args.browser as string] : [])];
    case 'qa_project_uninstall': return ['project', 'uninstall', target()];
    case 'qa_mcp_list': return ['mcp', 'list'];
    case 'qa_mcp_add':
    case 'qa_mcp_remove': {
      const server = args.name as string;
      if (!/^[a-z0-9][a-z0-9-]*$/.test(server)) throw new Error('Invalid MCP server name');
      return ['mcp', name === 'qa_mcp_add' ? 'add' : 'remove', server];
    }
    default: throw new Error('Unknown tool');
  }
}

/** Capture CLI output without allowing it to contaminate the MCP protocol stream. */
function runCli(argv: string[]): Promise<JsonObject> {
  return new Promise((done) => {
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    let settled = false;
    const finish = (result: JsonObject) => { if (!settled) { settled = true; done(result); } };
    const child = spawn(process.execPath, [cliPath, '--root', root, ...argv], { shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    children.add(child);
    const collect = (current: string, chunk: Buffer): string => {
      const text = chunk.toString('utf8');
      if (current.length + text.length > outputLimit) truncated = true;
      return (current + text).slice(0, outputLimit);
    };
    child.stdout?.on('data', (chunk: Buffer) => { stdout = collect(stdout, chunk); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr = collect(stderr, chunk); });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.on('error', (error) => { clearTimeout(timer); children.delete(child); finish({ exitCode: null, stdout, stderr, error: error.message, truncated }); });
    child.on('close', (code, signal) => { clearTimeout(timer); children.delete(child); finish({ exitCode: code, signal, stdout, stderr, timedOut, truncated }); });
  });
}

/** Write exactly one newline-delimited JSON-RPC message to stdout. */
function send(message: JsonObject): void { process.stdout.write(`${JSON.stringify(message)}\n`); }
function rpcError(id: unknown, code: number, message: string): void { send({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }); }

/** Handle MCP requests independently so long-running calls do not block other messages. */
async function handle(value: unknown): Promise<void> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { rpcError(null, -32600, 'Invalid Request'); return; }
  const request = value as JsonObject;
  const hasId = Object.prototype.hasOwnProperty.call(request, 'id');
  const validId = request.id === null || typeof request.id === 'string' || (typeof request.id === 'number' && Number.isFinite(request.id));
  if (request.jsonrpc !== '2.0' || typeof request.method !== 'string' || (hasId && !validId)) { rpcError(null, -32600, 'Invalid Request'); return; }
  if (!hasId) return;
  const id = request.id;
  if (request.method === 'initialize') {
    const params = request.params;
    if (!params || typeof params !== 'object' || Array.isArray(params) || typeof (params as JsonObject).protocolVersion !== 'string') { rpcError(id, -32602, 'Invalid initialize parameters'); return; }
    const requested = (params as JsonObject).protocolVersion as string;
    const supported = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
    initialized = true;
    send({ jsonrpc: '2.0', id, result: { protocolVersion: supported.includes(requested) ? requested : supported[0], capabilities: { tools: {} }, serverInfo: { name: 'qa', version: '0.0.1' } } });
    return;
  }
  if (!initialized) { rpcError(id, -32002, 'Server not initialized'); return; }
  if (request.method === 'ping') { send({ jsonrpc: '2.0', id, result: {} }); return; }
  if (request.method === 'tools/list') { send({ jsonrpc: '2.0', id, result: { tools } }); return; }
  if (request.method !== 'tools/call') { rpcError(id, -32601, 'Method not found'); return; }
  const params = request.params;
  if (!params || typeof params !== 'object' || Array.isArray(params) || typeof (params as JsonObject).name !== 'string') { rpcError(id, -32602, 'Invalid tool call parameters'); return; }
  const call = params as JsonObject;
  const tool = tools.find((item) => item.name === call.name);
  if (!tool) { rpcError(id, -32602, 'Unknown tool'); return; }
  try {
    const args = validate(tool, call.arguments ?? {});
    const result = await runCli(command(tool.name, args));
    send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: result.exitCode !== 0 } });
  } catch (error) {
    rpcError(id, -32602, error instanceof Error ? error.message : String(error));
  }
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  try { void handle(JSON.parse(line)).catch((error: unknown) => { console.error(error); }); }
  catch { rpcError(null, -32700, 'Parse error'); }
});
input.on('close', () => { for (const child of children) child.kill(); });
