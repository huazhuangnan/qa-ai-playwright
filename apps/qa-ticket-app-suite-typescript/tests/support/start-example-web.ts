import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const suiteRoot = resolve(import.meta.dirname, '../..');
const appRoot = resolve(suiteRoot, '../qa-ticket-app');
const viteEntry = resolve(appRoot, 'node_modules/vite/bin/vite.js');

const web = spawn(
  process.execPath,
  [viteEntry, '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
  { cwd: appRoot, stdio: 'inherit' },
);

const stop = () => web.kill('SIGTERM');
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

web.once('exit', (code) => process.exit(code ?? 0));
