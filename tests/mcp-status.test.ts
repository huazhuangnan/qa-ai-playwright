import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Environment } from '../packages/qa-cli/cli/environment.ts';

test('optional MCP status separates package, registration, and ownership', () => {
  const base = mkdtempSync(join(tmpdir(), 'qa-mcp-status-'));
  const home = join(base, 'codex');
  const environment = new Environment({ root: join(base, 'env'), env: { CODEX_HOME: home, PATH: '' } });
  mkdirSync(home, { recursive: true });
  const initial = environment.optionalMcpStatus('faker');
  assert.equal(initial.registration, 'absent');
  assert.equal(initial.ownership, 'none');
  assert.equal(initial.package.status, 'unknown');

  const prefix = join(base, 'npm');
  environment.state.global_npm_bin = process.platform === 'win32' ? prefix : join(prefix, 'bin');
  const packageDir = process.platform === 'win32'
    ? join(prefix, 'node_modules', 'faker-mcp-server')
    : join(prefix, 'lib', 'node_modules', 'faker-mcp-server');
  assert.equal(environment.optionalMcpStatus('faker').package.status, 'missing');
  mkdirSync(join(packageDir, 'dist'), { recursive: true });
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'faker-mcp-server', version: '1.0.3' }));
  writeFileSync(join(packageDir, 'dist', 'index.js'), '');

  const root = process.platform === 'win32' ? environment.root.toLowerCase() : environment.root;
  const serverName = `qa-${createHash('sha256').update(root).digest('hex').slice(0, 16)}-faker`;
  const config = `[mcp_servers.${serverName}]\ncommand = "test-node"\nargs = ["test-entry"]`;
  writeFileSync(environment.mcpConfig, `${config}\n`);
  assert.equal(environment.optionalMcpStatus('faker').ownership, 'unowned');
  writeFileSync(join(dirname(environment.mcpConfig), 'qa-ai-playwright-mcp.lock.json'), JSON.stringify({
    schema: 1,
    servers: { [serverName]: { name: 'faker', scope: 'user', root: environment.root, package: 'faker-mcp-server', source_type: 'external', snapshot: config, config: { command: 'test-node', args: ['test-entry'] } } },
  }));
  const owned = environment.optionalMcpStatus('faker');
  assert.equal(owned.registration, 'present');
  assert.equal(owned.ownership, 'owned');
  assert.equal(owned.package.status, 'available');
  assert.equal(owned.package.version, '1.0.3');
  const lockPath = join(dirname(environment.mcpConfig), 'qa-ai-playwright-mcp.lock.json');
  const originalLock = readFileSync(lockPath, 'utf8');
  environment.codex = () => undefined;
  assert.throws(() => environment.removeOptionalMcp('faker'), /still present after removal/);
  assert.equal(readFileSync(lockPath, 'utf8'), originalLock);
  assert.equal(readFileSync(environment.mcpConfig, 'utf8'), `${config}\n`);
  writeFileSync(environment.mcpConfig, `${config}\n# user edit\n`);
  assert.equal(environment.optionalMcpStatus('faker').ownership, 'modified');
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'wrong-package', version: '1.0.3' }));
  assert.equal(environment.optionalMcpStatus('faker').package.status, 'broken');
  writeFileSync(environment.mcpConfig, '[mcp_servers]\nother = {}\n');
  assert.equal(environment.optionalMcpStatus('faker').registration, 'unknown');
});

test('MCP repair restores only owned missing registration and recorded package version', () => {
  const base = mkdtempSync(join(tmpdir(), 'qa-mcp-repair-'));
  const home = join(base, 'codex');
  const prefix = join(base, 'npm');
  const environment = new Environment({ root: join(base, 'env'), env: { CODEX_HOME: home, PATH: '' } });
  environment.requireInitialized = () => undefined;
  environment.state.global_npm_bin = process.platform === 'win32' ? prefix : join(prefix, 'bin');
  const packageDir = process.platform === 'win32' ? join(prefix, 'node_modules', 'faker-mcp-server')
    : join(prefix, 'lib', 'node_modules', 'faker-mcp-server');
  const entry = join(packageDir, 'dist', 'index.js');
  const root = process.platform === 'win32' ? environment.root.toLowerCase() : environment.root;
  const serverName = `qa-${createHash('sha256').update(root).digest('hex').slice(0, 16)}-faker`;
  const config = `[mcp_servers.${serverName}]\ncommand = ${JSON.stringify(environment.node)}\nargs = [${JSON.stringify(entry)}]`;
  mkdirSync(home, { recursive: true });
  const lock = { schema: 1, servers: { [serverName]: {
    name: 'faker', scope: 'user', root: environment.root, package: 'faker-mcp-server', source_type: 'external',
    manifest: 'packages/mcp/external/faker.json', version: '1.0.3', snapshot: config,
    config: { command: environment.node, args: [entry] },
  } } };
  writeFileSync(join(home, 'qa-ai-playwright-mcp.lock.json'), JSON.stringify(lock));
  mkdirSync(dirname(entry), { recursive: true });
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'faker-mcp-server', version: '1.0.3' }));
  writeFileSync(entry, '');
  environment.codex = () => { writeFileSync(environment.mcpConfig, `${config}\n`); return undefined; };
  assert.equal(environment.repairOptionalMcp('faker'), '1.0.3');
  assert.equal(environment.optionalMcpStatus('faker').ownership, 'owned');

  const installs: string[][] = [];
  rmSync(packageDir, { recursive: true });
  environment.npm = (args) => {
    const values = args.map(String);
    if (values.includes('prefix')) return prefix;
    installs.push(values);
    mkdirSync(dirname(entry), { recursive: true });
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'faker-mcp-server', version: '1.0.3' }));
    writeFileSync(entry, '');
    return undefined;
  };
  assert.equal(environment.repairOptionalMcp('faker'), '1.0.3');
  assert.deepEqual(installs, [['install', '--global', 'faker-mcp-server@1.0.3']]);
  writeFileSync(environment.mcpConfig, `${config}\n# user edit\n`);
  assert.throws(() => environment.repairOptionalMcp('faker'), /cannot be verified/);
  assert.equal(readFileSync(environment.mcpConfig, 'utf8'), `${config}\n# user edit\n`);
  writeFileSync(environment.mcpConfig, `${config}\n`);
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'wrong-package', version: '1.0.3' }));
  assert.throws(() => environment.repairOptionalMcp('faker'), /shared package is broken/);
  writeFileSync(join(home, 'qa-ai-playwright-mcp.lock.json'), JSON.stringify({ schema: 1, servers: {} }));
  assert.throws(() => environment.repairOptionalMcp('faker'), /ownership record is missing or incomplete/);
});
