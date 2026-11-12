import { chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import type { Environment } from './environment.ts';
import { projectMarker } from './project.ts';
import { projectUpgradePlan, rejectLinks } from './project-upgrade-plan.ts';
import { saveProjectSnapshot } from './project-snapshots.ts';
import { digest, within } from './shared.ts';

/** Replace a marker without deleting its previous version first. */
function saveMarker(path: string, state: unknown): void {
  const temporary = join(dirname(path), `.qa-marker-${randomUUID()}`);
  try {
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx' });
    chmodSync(temporary, lstatSync(path).mode & 0o777);
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

/** Apply a delivered template without overwriting modified or unowned files. */
export function projectUpgrade(env: Environment, targetInput: string, mode: 'upgrade' | 'repair'): number {
  const plan = projectUpgradePlan(env, targetInput);
  const { target, markerPath, state } = projectMarker(plan.target);
  if (digest(markerPath) !== plan.markerHash) throw new Error('Project record changed after planning; retry');
  const actualTarget = realpathSync(target);
  const actualEnvironment = realpathSync(env.root);
  if (within(actualTarget, actualEnvironment) || within(actualEnvironment, actualTarget)) {
    throw new Error('Project overlaps environment');
  }
  if (mode === 'repair') {
    const changed = plan.entries.filter((entry) => entry.status === 'missing' && entry.recordedHash !== entry.templateHash);
    if (changed.length) {
      for (const entry of changed) console.error(`CONFLICT template changed; use project upgrade: ${entry.path}`);
      return 1;
    }
  }
  if (mode === 'upgrade') {
    const conflicts = plan.entries.filter((entry) => entry.status === 'modified' || entry.status === 'unknown' || (entry.status === 'removed' && entry.currentHash));
    if (conflicts.length) {
      for (const entry of conflicts) console.error(`CONFLICT ${entry.status}: ${entry.path}`);
      return 1;
    }
  }
  // Never change the Python dependency source while its generated lock is stale.
  const requirements = plan.entries.find((entry) => entry.path === 'requirements.in');
  const changesRequirements = requirements && (mode === 'repair'
    ? requirements.status === 'missing'
    : ['update', 'missing', 'new', 'adopt'].includes(requirements.status));
  if (plan.stack === 'python' && requirements && changesRequirements) {
    const metadata = join(target, 'requirements.lock.meta.json');
    const lock = join(target, 'requirements.lock');
    rejectLinks(metadata, target);
    rejectLinks(lock, target);
    let baseline: unknown;
    try {
      baseline = (JSON.parse(readFileSync(metadata, 'utf8')) as { requirements_in_sha256?: unknown }).requirements_in_sha256;
    } catch {
      baseline = undefined;
    }
    if (!existsSync(lock) || baseline !== requirements.templateHash) {
      console.error('CONFLICT requirements.in: update the dependency source and regenerate its lock with project init before upgrading');
      return 1;
    }
  }
  let markerHash = digest(markerPath);
  if (markerHash !== plan.markerHash) throw new Error('Project record changed after planning; retry');
  if (mode === 'upgrade') {
    saveProjectSnapshot(env, plan);
    if (digest(markerPath) !== markerHash) throw new Error('Project marker changed while creating the snapshot');
  }
  for (const entry of plan.entries) {
    const selected = mode === 'repair' ? entry.status === 'missing' : ['update', 'missing', 'new', 'adopt'].includes(entry.status);
    if (!selected) continue;
    const output = join(target, ...entry.path.split('/'));
    const languageSource = join(env.repo, 'packages/templates', plan.stack, ...entry.path.split('/'));
    const sharedSource = entry.path.startsWith('docs/qa/')
      ? join(env.repo, 'packages/templates/qa', ...entry.path.slice('docs/qa/'.length).split('/'))
      : undefined;
    const source = sharedSource && existsSync(sharedSource) ? sharedSource : languageSource;
    rejectLinks(output, target);
    rejectLinks(source, env.repo);
    rejectLinks(markerPath, target);
    if (digest(markerPath) !== markerHash || digest(source) !== entry.templateHash) throw new Error(`Project or template changed during ${mode}: ${entry.path}`);
    if (entry.currentHash ? !existsSync(output) || digest(output) !== entry.currentHash : existsSync(output)) {
      throw new Error(`Project file changed during ${mode}: ${entry.path}`);
    }
    if (entry.status === 'adopt') {
      state.files[entry.path] = entry.currentHash!;
      saveMarker(markerPath, state);
      markerHash = digest(markerPath);
      console.log(`ADOPT ${entry.path}`);
      continue;
    }
    const original = entry.currentHash ? readFileSync(output) : undefined;
    const originalMode = original ? lstatSync(output).mode & 0o777 : undefined;
    mkdirSync(dirname(output), { recursive: true });
    rejectLinks(output, target);
    const temporary = join(dirname(output), `.qa-upgrade-${randomUUID()}`);
    try {
      if (original) {
        copyFileSync(source, temporary, constants.COPYFILE_EXCL);
        chmodSync(temporary, originalMode!);
        if (digest(temporary) !== entry.templateHash) throw new Error(`Template changed during ${mode}: ${entry.path}`);
        if (digest(output) !== entry.currentHash) throw new Error(`Project file changed during ${mode}: ${entry.path}`);
        renameSync(temporary, output);
      } else {
        copyFileSync(source, output, constants.COPYFILE_EXCL);
        if (digest(output) !== entry.templateHash) {
          unlinkSync(output);
          throw new Error(`Template changed during ${mode}: ${entry.path}`);
        }
      }
      const previousHash = state.files[entry.path];
      state.files[entry.path] = digest(output);
      try {
        saveMarker(markerPath, state);
        markerHash = digest(markerPath);
      } catch (error) {
        if (previousHash === undefined) delete state.files[entry.path];
        else state.files[entry.path] = previousHash;
        // Restore only if no other process changed the newly written file.
        if (existsSync(output) && digest(output) === entry.templateHash) {
          if (original) writeFileSync(output, original);
          else unlinkSync(output);
        }
        throw error;
      }
      console.log(`${mode === 'repair' ? 'REPAIR' : 'UPDATE'} ${entry.path}`);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
  if (mode === 'upgrade') {
    for (const entry of plan.entries) if (entry.status === 'removed' && !entry.currentHash) delete state.files[entry.path];
    state.language_template_version = plan.templateVersions.language;
    state.qa_template_version = plan.templateVersions.qa;
    if (digest(markerPath) !== markerHash) throw new Error('Project marker changed during upgrade');
    saveMarker(markerPath, state);
  }
  return 0;
}
