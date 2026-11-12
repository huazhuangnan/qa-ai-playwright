import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Exercise the exact documented commands in an isolated project during CI.
const root = process.env.QA_ROOT;
assert.ok(root, 'QA_ROOT is required');
const project = join(resolve(root), 'external-skill-ci');
mkdirSync(project, { recursive: true });
const reference = readFileSync(
  'packages/skills/builtin/qa-core/references/external-skills.md',
  'utf8',
);
const commands = [...reference.matchAll(/`(bunx skills@[^`]+)`/gu)]
  .map((match) => match[1] as string);
assert.equal(commands.length, 6);
for (const command of commands) {
  const args = command.split(' ');
  assert.equal(args.shift(), 'bunx');
  const skillIndex = args.indexOf('--skill');
  const name = args[skillIndex + 1];
  assert.ok(name);
  const result = spawnSync(process.execPath, ['x', ...args], {
    cwd: project,
    env: process.env,
    stdio: 'inherit',
    timeout: 180_000,
  });
  assert.equal(result.status, 0, `${name}: ${result.error ?? result.status}`);
  const file = join(project, '.agents/skills', name, 'SKILL.md');
  assert.ok(existsSync(file), name);
  const source = args[2];
  assert.ok(source);
  const raw = source.replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/tree/', '/');
  const response = await fetch(`${raw}/SKILL.md`);
  assert.ok(response.ok, `${name}: upstream ${response.status}`);
  assert.equal(readFileSync(file, 'utf8'), await response.text(), `${name}: pinned source`);
}

// QA Skills are installed one at a time from the local delivery package.
for (const name of ['qa-core', 'qa-api']) {
  const source = resolve('packages/skills/builtin', name);
  const result = spawnSync(process.execPath, [
    'x', 'skills@1.8.1', 'add', source, '--skill', name,
    '--agent', 'codex', '--copy', '--yes',
  ], { cwd: project, env: process.env, stdio: 'inherit', timeout: 180_000 });
  assert.equal(result.status, 0, `${name}: ${result.error ?? result.status}`);
  const installed = join(project, '.agents/skills', name, 'SKILL.md');
  assert.equal(readFileSync(installed, 'utf8'), readFileSync(join(source, 'SKILL.md'), 'utf8'));
}
assert.ok(existsSync(join(project, '.agents/skills/qa-core/references/external-skills.md')));
assert.ok(!existsSync(join(project, '.agents/skills/qa-web')));
