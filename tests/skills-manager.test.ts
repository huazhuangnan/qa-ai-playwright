import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installBuiltinSkill, listBuiltinSkills, listBuiltinSkillSnapshots, recoverBuiltinSkills, repairBuiltinSkill, rollbackBuiltinSkill, uninstallBuiltinSkill, upgradeBuiltinSkill } from '../packages/qa-cli/cli/skills-manager.ts';

function fixture(): { project: string; repo: string; target: string } {
  const base = mkdtempSync(join(tmpdir(), 'qa-skill-test-'));
  const project = join(base, 'project');
  const repo = join(base, 'repo');
  const source = join(repo, 'packages', 'skills', 'builtin', 'qa-example');
  mkdirSync(source, { recursive: true });
  mkdirSync(project);
  writeFileSync(join(source, 'SKILL.md'), '---\nname: qa-example\nmetadata:\n  version: "0.0.1"\n---\n');
  writeFileSync(join(source, 'guide.md'), 'original');
  return { project, repo, target: join(project, '.agents', 'skills', 'qa-example') };
}

test('builtin Skills install idempotently and preserve edited and untracked files on uninstall', () => {
  const { project, repo, target } = fixture();
  assert.equal(listBuiltinSkills(project, repo)[0]?.status, 'missing');
  installBuiltinSkill(project, 'qa-example', repo);
  installBuiltinSkill(project, 'qa-example', repo);
  assert.equal(listBuiltinSkills(project, repo)[0]?.status, 'installed');
  writeFileSync(join(target, 'guide.md'), 'edited');
  writeFileSync(join(target, 'personal.md'), 'personal');
  assert.equal(listBuiltinSkills(project, repo)[0]?.status, 'modified');
  const result = uninstallBuiltinSkill(project, 'qa-example', repo);
  assert.deepEqual(result.preserved, ['guide.md']);
  assert.equal(readFileSync(join(target, 'guide.md'), 'utf8'), 'edited');
  assert.equal(readFileSync(join(target, 'personal.md'), 'utf8'), 'personal');
  assert.equal(listBuiltinSkills(project, repo)[0]?.status, 'modified');
});

test('builtin Skill install never takes ownership of an existing directory', () => {
  const { project, repo, target } = fixture();
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'SKILL.md'), 'user');
  assert.equal(listBuiltinSkills(project, repo)[0]?.status, 'unmanaged');
  assert.throws(() => installBuiltinSkill(project, 'qa-example', repo), /unmanaged/);
  assert.throws(() => uninstallBuiltinSkill(project, 'qa-example', repo), /ownership/);
  assert.equal(readFileSync(join(target, 'SKILL.md'), 'utf8'), 'user');
});

test('repair uses the recorded source and upgrade preserves user conflicts', () => {
  const { project, repo, target } = fixture();
  const source = join(repo, 'packages', 'skills', 'builtin', 'qa-example');
  installBuiltinSkill(project, 'qa-example', repo);
  unlinkSync(join(target, 'guide.md'));
  assert.deepEqual(repairBuiltinSkill(project, 'qa-example', repo).repaired, ['guide.md']);
  writeFileSync(join(source, 'guide.md'), 'new version');
  writeFileSync(join(target, 'guide.md'), 'user edit');
  assert.throws(() => upgradeBuiltinSkill(project, 'qa-example', repo), /modified or missing/);
  assert.equal(readFileSync(join(target, 'guide.md'), 'utf8'), 'user edit');
  writeFileSync(join(target, 'guide.md'), 'original');
  upgradeBuiltinSkill(project, 'qa-example', repo);
  assert.equal(readFileSync(join(target, 'guide.md'), 'utf8'), 'new version');
  assert.equal(listBuiltinSkills(project, repo)[0]?.status, 'installed');
});

test('repair refuses a changed source and upgrade refuses unowned new files', () => {
  const { project, repo, target } = fixture();
  const source = join(repo, 'packages', 'skills', 'builtin', 'qa-example');
  installBuiltinSkill(project, 'qa-example', repo);
  unlinkSync(join(target, 'guide.md'));
  writeFileSync(join(source, 'guide.md'), 'changed');
  assert.throws(() => repairBuiltinSkill(project, 'qa-example', repo), /source differs/);
  writeFileSync(join(target, 'guide.md'), 'original');
  writeFileSync(join(source, 'extra.md'), 'upstream');
  writeFileSync(join(target, 'extra.md'), 'user');
  assert.throws(() => upgradeBuiltinSkill(project, 'qa-example', repo), /unowned/);
  assert.equal(readFileSync(join(target, 'extra.md'), 'utf8'), 'user');
  assert.equal(readFileSync(join(target, 'guide.md'), 'utf8'), 'original');
});

test('Skill upgrade snapshots roll back only unchanged managed state', () => {
  const { project, repo, target } = fixture();
  const source = join(repo, 'packages', 'skills', 'builtin', 'qa-example');
  installBuiltinSkill(project, 'qa-example', repo);
  writeFileSync(join(source, 'guide.md'), 'upgraded');
  const snapshot = upgradeBuiltinSkill(project, 'qa-example', repo).snapshot;
  assert.ok(snapshot);
  assert.deepEqual(listBuiltinSkillSnapshots(project), [snapshot]);
  writeFileSync(join(target, 'guide.md'), 'user edit');
  assert.throws(() => rollbackBuiltinSkill(project, snapshot), /modified or missing/);
  assert.equal(readFileSync(join(target, 'guide.md'), 'utf8'), 'user edit');
  writeFileSync(join(target, 'guide.md'), 'upgraded');
  rollbackBuiltinSkill(project, snapshot);
  assert.equal(readFileSync(join(target, 'guide.md'), 'utf8'), 'original');
  assert.throws(() => rollbackBuiltinSkill(project, snapshot), /changed path/);
});

test('interrupted Skill upgrade restores its previous files and ownership record', () => {
  const { project, repo, target } = fixture();
  installBuiltinSkill(project, 'qa-example', repo);
  const file = join(target, 'guide.md');
  const lock = join(project, '.agents', 'qa-skills-lock.json');
  const previousLock = readFileSync(lock);
  const journal = join(project, '.agents', '.qa-skills-recovery.json');
  const encoded = (value: string | Buffer): string => Buffer.from(value).toString('base64');
  writeFileSync(journal, JSON.stringify({ schema: 1, entries: [
    { path: '.agents/skills/qa-example/guide.md', before: encoded('original'), after: encoded('new') },
    { path: '.agents/qa-skills-lock.json', before: encoded(previousLock), after: encoded('changed lock') },
  ] }));
  writeFileSync(file, 'new');
  writeFileSync(lock, 'changed lock');
  assert.equal(recoverBuiltinSkills(project).restored.length, 2);
  assert.equal(readFileSync(file, 'utf8'), 'original');
  assert.deepEqual(readFileSync(lock), previousLock);
  assert.equal(listBuiltinSkills(project, repo)[0]?.status, 'installed');
});

test('Skill recovery preserves post-interruption edits and rejects unsafe paths', () => {
  const { project, repo, target } = fixture();
  installBuiltinSkill(project, 'qa-example', repo);
  const file = join(target, 'guide.md');
  const journal = join(project, '.agents', '.qa-skills-recovery.json');
  const entry = { path: '.agents/skills/qa-example/guide.md', before: Buffer.from('original').toString('base64'), after: Buffer.from('new').toString('base64') };
  writeFileSync(journal, JSON.stringify({ schema: 1, entries: [entry] }));
  writeFileSync(file, 'later user edit');
  assert.throws(() => recoverBuiltinSkills(project), /changed path/);
  assert.equal(readFileSync(file, 'utf8'), 'later user edit');
  writeFileSync(journal, JSON.stringify({ schema: 1, entries: [{ ...entry, path: '../outside' }] }));
  assert.throws(() => recoverBuiltinSkills(project), /Invalid Skill recovery path/);
  writeFileSync(journal, JSON.stringify({ schema: 1, entries: [entry, entry] }));
  assert.throws(() => recoverBuiltinSkills(project), /Duplicate Skill recovery path/);
});

test('Skill recovery refuses a guard owned by an active process', () => {
  const { project } = fixture();
  const guard = join(project, '.agents', '.qa-skills.guard');
  mkdirSync(guard, { recursive: true });
  writeFileSync(join(guard, 'owner.json'), JSON.stringify({ pid: process.pid }));
  assert.throws(() => recoverBuiltinSkills(project), /still active/);
});

test('recovery rolls back an interrupted installation and uninstall without changing user data', () => {
  const { project, repo, target } = fixture();
  const agents = join(project, '.agents');
  const journal = join(agents, '.qa-skills-recovery.json');
  const file = join(target, 'guide.md');
  const lock = join(agents, 'qa-skills-lock.json');
  const encoded = (value: string | Buffer): string => Buffer.from(value).toString('base64');
  mkdirSync(target, { recursive: true });
  writeFileSync(journal, JSON.stringify({ schema: 1, entries: [
    { path: '.agents/skills/qa-example/guide.md', before: null, after: encoded('original') },
    { path: '.agents/qa-skills-lock.json', before: null, after: encoded('new lock') },
  ] }));
  writeFileSync(file, 'original');
  recoverBuiltinSkills(project);
  assert.throws(() => readFileSync(file), /ENOENT/);
  assert.throws(() => readFileSync(lock), /ENOENT/);

  // The interrupted installation leaves an empty directory for manual review.
  const second = fixture();
  installBuiltinSkill(second.project, 'qa-example', second.repo);
  const oldLock = readFileSync(join(second.project, '.agents', 'qa-skills-lock.json'));
  const oldFile = readFileSync(join(second.target, 'guide.md'));
  writeFileSync(join(second.project, '.agents', '.qa-skills-recovery.json'), JSON.stringify({ schema: 1, entries: [
    { path: '.agents/skills/qa-example/guide.md', before: encoded(oldFile), after: null },
    { path: '.agents/qa-skills-lock.json', before: encoded(oldLock), after: encoded('{}\n') },
  ] }));
  unlinkSync(join(second.target, 'guide.md'));
  writeFileSync(join(second.project, '.agents', 'qa-skills-lock.json'), '{}\n');
  recoverBuiltinSkills(second.project);
  assert.deepEqual(readFileSync(join(second.target, 'guide.md')), oldFile);
  assert.deepEqual(readFileSync(join(second.project, '.agents', 'qa-skills-lock.json')), oldLock);
});

test.skipIf(process.platform === 'win32')('builtin Skills reject linked project paths', () => {
  const { project, repo } = fixture();
  const external = mkdtempSync(join(tmpdir(), 'qa-skill-external-'));
  symlinkSync(external, join(project, '.agents'), 'dir');
  assert.throws(() => installBuiltinSkill(project, 'qa-example', repo), /link/);
});

test('builtin Skills reject drive paths in ownership records', () => {
  const { project, repo } = fixture();
  mkdirSync(join(project, '.agents'));
  writeFileSync(join(project, '.agents', 'qa-skills-lock.json'), JSON.stringify({
    'qa-example': { scope: 'project', source: 'packages/skills/builtin/qa-example', version: '0.0.1', files: { 'C:/outside': 'a'.repeat(64) } },
  }));
  assert.throws(() => listBuiltinSkills(project, repo), /Invalid Skill lock/);
});

test.skipIf(process.platform === 'win32')('builtin Skills reject a linked project root', () => {
  const { project, repo } = fixture();
  const link = `${project}-link`;
  symlinkSync(project, link, 'dir');
  assert.throws(() => installBuiltinSkill(link, 'qa-example', repo), /Invalid project directory/);
});
