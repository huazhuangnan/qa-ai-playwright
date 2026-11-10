import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const suiteRoot = resolve(import.meta.dirname, '../..');
const appRoot = resolve(suiteRoot, '../qa-ticket-app');
const databasePath = resolve(suiteRoot, '.tmp/e2e.db');

rmSync(databasePath, { force: true });
rmSync(`${databasePath}-shm`, { force: true });
rmSync(`${databasePath}-wal`, { force: true });
mkdirSync(resolve(suiteRoot, '.tmp'), { recursive: true });

const environment = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: '8787',
  DATABASE_URL: databasePath,
};

const seed = spawnSync(
  'node',
  ['src/server/seed-cli.ts'],
  { cwd: appRoot, env: environment, stdio: 'inherit' },
);
if (seed.status !== 0) {
  process.exit(seed.status ?? 1);
}

const server = spawn(
  'node',
  ['src/server/index.ts'],
  { cwd: appRoot, env: environment, stdio: 'inherit' },
);

const stop = () => server.kill('SIGTERM');
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

server.once('exit', (code) => process.exit(code ?? 0));
