import { existsSync, lstatSync, readFileSync } from 'node:fs';
import type { ParsedArguments } from '../qa-cli.ts';
import { Environment, type EnvironmentCheckOptions, type EnvironmentInitOptions } from './environment.ts';
import { OWNER, type Stack } from './shared.ts';

/** Dispatch the environment lifecycle using the shared environment implementation. */
export async function executeEnvironment(
  args: ParsedArguments,
  env: Environment,
  uninstallExternalTools: (env: Environment, requested: boolean) => Promise<boolean>,
): Promise<number> {
  const options: EnvironmentInitOptions = {
    stack: args.stack ?? 'typescript',
    profile: args.full ? 'full' : 'standard',
    skipCodex: args.skipCodex ?? false,
    skipSkills: args.skipSkills ?? false,
    withCcSwitch: args.withCcSwitch,
  };
  if (args.action === 'repair') {
    if (!existsSync(env.marker) || !existsSync(env.stateFile)
      || !lstatSync(env.marker).isFile() || lstatSync(env.marker).isSymbolicLink()
      || !lstatSync(env.stateFile).isFile() || lstatSync(env.stateFile).isSymbolicLink()
      || readFileSync(env.marker, 'utf8').trim() !== OWNER) {
      throw new Error('Cannot repair: environment ownership or state is missing');
    }
    const recorded = env.state.init_options as Partial<EnvironmentInitOptions> | undefined;
    if (recorded && (recorded.stack === 'python' || recorded.stack === 'typescript' || recorded.stack === 'both')
      && (recorded.profile === 'standard' || recorded.profile === 'full')
      && typeof recorded.skipCodex === 'boolean' && typeof recorded.skipSkills === 'boolean'
      && (recorded.withCcSwitch === undefined || typeof recorded.withCcSwitch === 'boolean')) {
      return env.init({ ...recorded, stack: recorded.stack, profile: recorded.profile, skipCodex: recorded.skipCodex, skipSkills: recorded.skipSkills, withCcSwitch: recorded.withCcSwitch ?? false });
    }
    const stack = env.state.stack;
    const profile = env.state.profile;
    const components = env.state.components as { codex?: unknown; browser_tools?: unknown; cc_switch?: unknown } | undefined;
    if ((stack !== 'python' && stack !== 'typescript' && stack !== 'both')
      || (profile !== 'standard' && profile !== 'full')
      || typeof components?.codex !== 'boolean' || typeof components.browser_tools !== 'boolean') {
      throw new Error('Cannot repair: environment configuration is incomplete; use env init with explicit options');
    }
    return env.init({ stack, profile, skipCodex: !components.codex, skipSkills: !components.browser_tools, withCcSwitch: components.cc_switch === true });
  }
  if (args.action === 'init') return env.init(options);
  if (args.action === 'check') {
    const check: EnvironmentCheckOptions = { ...options };
    return env.check(check);
  }
  if (args.action !== 'uninstall') throw new Error(`Invalid environment action: ${String(args.action)}`);
  if (args.includeExternal) throw new Error('External uninstall is unavailable: cross-environment usage cannot be verified');
  if (!existsSync(env.marker)) {
    console.log('Nothing to uninstall');
    return 0;
  }
  const cleanup = env.removeSharedMcpRegistrations();
  for (const item of cleanup.preserved) console.log(`Preserving MCP ${item.name}: ${item.reason}`);
  for (const item of cleanup.failed) console.error(`Could not remove MCP ${item.name}: ${item.reason}`);
  if (cleanup.failed.length > 0 || cleanup.preserved.length > 0) return 1;
  if (!await uninstallExternalTools(env, false)) return 1;
  env.state.init_status = 'uninstalled';
  env.save();
  // The platform entry reports that the environment directory was preserved.
  return 20;
}

/** Diagnose the active environment using the components it records. */
export function executeDoctor(env: Environment): number {
  const components = (env.state.components ?? { codex: true, browser_tools: true }) as {
    codex?: boolean;
    skills?: boolean;
    browser_tools?: boolean;
    agent_browser?: boolean;
    cc_switch?: boolean;
  };
  return env.check({
    stack: (env.state.stack ?? 'both') as Stack,
    profile: env.state.profile === 'full' || components.agent_browser ? 'full' : 'standard',
    skipCodex: !components.codex,
    skipSkills: !(components.browser_tools ?? components.skills ?? true),
    withCcSwitch: components.cc_switch === true,
  });
}
