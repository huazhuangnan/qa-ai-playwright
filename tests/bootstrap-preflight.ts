import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { Environment } from '../packages/qa-cli/cli/environment.ts';

// Run before bootstrap with the runner's Node and npm, without project dependencies.
const workspace = mkdtempSync(join(tmpdir(), 'qa-bootstrap-preflight-'));
try {
  const root = join(workspace, 'fresh environment with spaces');
  const environment = new Environment({ root, env: { ...process.env, QA_NODE_PATH: process.execPath } });
  environment.check({ stack: 'both', profile: 'full', skipCodex: false, skipSkills: false });
  assert.ok(environment.state.global_npm_bin, 'Global npm prefix discovery failed');
  assert.equal(existsSync(root), false, 'Fresh environment check created its root');

  const bin = join(workspace, 'global tools with spaces');
  const cache = join(workspace, 'probe cache');
  mkdirSync(bin, { recursive: true });
  const bun = join(bin, process.platform === 'win32' ? 'bun.cmd' : 'bun');
  writeFileSync(bun, process.platform === 'win32'
    ? '@echo off\r\nmkdir "%XDG_CACHE_HOME%" 2>nul\r\necho 1.0.0\r\n'
    : '#!/bin/sh\nmkdir -p "$XDG_CACHE_HOME"\nprintf "1.0.0\\n"\n');
  if (process.platform !== 'win32') chmodSync(bun, 0o755);
  const probeEnvironment = new Environment({
    root,
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`, XDG_CACHE_HOME: cache, QA_NODE_PATH: process.execPath },
  });
  probeEnvironment.check({ stack: 'typescript', profile: 'standard', skipCodex: true, skipSkills: true });
  assert.ok(existsSync(cache), 'Version probe did not use the caller cache');
  assert.equal(existsSync(root), false, 'Version probe created the fresh environment root');

  if (process.platform === 'win32') {
    writeFileSync(join(bin, 'pnpm.cmd'), '@echo off\r\necho %~1\r\n');
    const shimEnvironment = new Environment({
      root,
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`, QA_NODE_PATH: process.execPath },
    });
    assert.equal(shimEnvironment.pnpm(['argument with spaces'], { capture: true }), 'argument with spaces');
  }
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
