import { existsSync, lstatSync, readFileSync } from 'node:fs';
import type { Environment } from './environment.ts';
import { OWNER } from './shared.ts';

/** Return recorded configuration and discovered tools without changing the environment. */
export function environmentStatus(env: Environment): object {
  const stack = env.state.stack;
  const profile = env.state.profile;
  const initialized = existsSync(env.marker) && lstatSync(env.marker).isFile()
    && !lstatSync(env.marker).isSymbolicLink() && readFileSync(env.marker, 'utf8').trim() === OWNER
    && (stack === 'python' || stack === 'typescript' || stack === 'both')
    && (profile === 'standard' || profile === 'full')
    && env.state.init_status !== 'initializing' && env.state.init_status !== 'uninstalled';
  const configured = env.state.components;
  const components: Record<string, boolean> = {};
  if (configured && typeof configured === 'object' && !Array.isArray(configured)) {
    for (const [name, value] of Object.entries(configured)) if (typeof value === 'boolean') components[name] = value;
  }
  const keys: Record<string, string> = { 'playwright-cli': 'playwright_cli', 'playwright-mcp': 'playwright_mcp', 'agent-browser': 'agent_browser', 'cc-switch': 'cc_switch' };
  const tools = env.listDiscoveredTools().map((tool) => {
    const recorded = env.state[keys[tool.name] ?? tool.name];
    return { ...tool, recordedVersion: typeof recorded === 'string' ? recorded : null,
      detectedVersion: tool.version ?? null };
  });
  const recordedInstallations = env.state.installations;
  const installations = recordedInstallations && typeof recordedInstallations === 'object' && !Array.isArray(recordedInstallations)
    ? recordedInstallations : {};
  return { root: env.root, initialized, stack: typeof stack === 'string' ? stack : null,
    profile: typeof profile === 'string' ? profile : null, components, installations, tools };
}
