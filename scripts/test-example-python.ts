import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Run the Python example with its isolated interpreter and project working directory. */
function runPythonExample(): number {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const project = join(root, 'apps', 'qa-ticket-app-suite-python');
  const python = process.platform === 'win32'
    ? join(project, '.venv', 'Scripts', 'python.exe')
    : join(project, '.venv', 'bin', 'python');

  if (!existsSync(python)) {
    console.error('Python 示例环境不存在。请先按 apps/qa-ticket-app-suite-python/README.md 准备 .venv。');
    return 1;
  }

  const result = spawnSync(python, ['-m', 'pytest', ...process.argv.slice(2)], {
    cwd: project,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) console.error(result.error.message);
  return result.status ?? 1;
}

process.exitCode = runPythonExample();
