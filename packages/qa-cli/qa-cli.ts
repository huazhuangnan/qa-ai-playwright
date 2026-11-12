#!/usr/bin/env node
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { checkSkillUpdates, loadSkillSources } from './cli/skill-updates.ts';
import { checkAllUpdates, loadUpdateConfig } from './cli/update-check.ts';
import { projectUpgradePlan } from './cli/project-upgrade-plan.ts';
import { projectUpgrade } from './cli/project-upgrade.ts';
import { projectRollback, projectSnapshots } from './cli/project-snapshots.ts';
import { executeDoctor, executeEnvironment } from './cli/environment-commands.ts';
import { environmentStatus } from './cli/environment-status.ts';
import { checkTemplates, listTemplates } from './cli/template-status.ts';
import { listEnvironmentUvSnapshots, planEnvironmentUv, rollbackEnvironmentUv, upgradeEnvironmentUv } from './cli/environment-upgrade.ts';
import { installBuiltinSkill, listBuiltinSkills, listBuiltinSkillSnapshots, recoverBuiltinSkills, repairBuiltinSkill, rollbackBuiltinSkill, uninstallBuiltinSkill } from './cli/skills-manager.ts';
import { basename, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  Environment,
  type DiscoveredTool,
} from './cli/environment.ts';
import {
  projectCheck,
  projectInit,
  projectUninstall,
  type ProjectInitArguments,
  type ProjectTargetArguments,
} from './cli/project.ts';
import {
  type Browser,
  type Stack,
  within,
} from './cli/shared.ts';

/** Parsed command line used by the local QA lifecycle CLI. */
export interface ParsedArguments {
  root: string;
  command: 'env' | 'project' | 'template' | 'doctor' | 'shell' | 'run' | 'mcp' | 'skills' | 'update' | 'help';
  action?: 'init' | 'check' | 'uninstall' | 'plan' | 'repair' | 'upgrade' | 'rollback' | 'snapshots' | 'list';
  mcpAction?: 'add' | 'remove' | 'list' | 'check' | 'repair';
  mcpName?: string;
  skillSource?: string;
  skillAction?: 'check-updates' | 'list' | 'check' | 'install' | 'uninstall' | 'upgrade' | 'repair' | 'recover' | 'snapshots' | 'rollback';
  skillName?: string;
  updateSource?: string;
  stack?: Stack;
  full?: boolean;
  skipCodex?: boolean;
  skipSkills?: boolean;
  includeExternal?: boolean;
  target?: string;
  snapshotId?: string;
  language?: 'python' | 'typescript';
  browser?: Browser;
  withDeps?: boolean;
  runArgs?: string[];
}

/** Preserves external tools when cross-environment references cannot be verified. */
export async function uninstallExternalTools(
  env: Environment,
  requested: boolean,
  interaction: { log: (message: string) => void } = { log: (message) => console.log(message) },
): Promise<boolean> {
  const tools = env.listDiscoveredTools().filter((tool) => tool.scope === 'system-or-user' && tool.source !== 'qa');
  for (const tool of tools) interaction.log(`Preserving ${tool.name}: ${tool.path}`);
  if (requested) {
    interaction.log('External uninstall is unavailable: cross-environment usage cannot be verified.');
    return false;
  }
  interaction.log('External software is preserved.');
  return true;
}
/** Verifies the package, its global prefix, and the discovered executable. */
export function verifiedGlobalPackage(tool: DiscoveredTool, name: string, directory: string, prefix: string): boolean {
  try {
    const expected = process.platform === 'win32'
      ? join(prefix, 'node_modules', name)
      : join(prefix, 'lib', 'node_modules', name);
    const realPrefix = realpathSync(prefix);
    const packageRoot = process.platform === 'win32' ? join(prefix, 'node_modules') : join(prefix, 'lib', 'node_modules');
    const realPackageRoot = realpathSync(packageRoot);
    if (!within(realPackageRoot, realPrefix) || lstatSync(expected).isSymbolicLink()) return false;
    const actual = realpathSync(directory);
    const expectedPath = realpathSync(expected);
    if (!within(actual, realPackageRoot)) return false;
    const executable = realpathSync(tool.path);
    const metadata = JSON.parse(readFileSync(join(actual, 'package.json'), 'utf8')) as { name?: unknown };
    return actual === expectedPath && metadata.name === name && executable.startsWith(`${actual}${sep}`);
  } catch {
    return false;
  }
}
/**
 * Parses lifecycle arguments and accepts `--root` before `run`.
 *
 * Arguments after `run` belong to the child command and remain unchanged.
 */
export function parseArgs(
  argv: readonly string[],
  cwd = process.cwd(),
): ParsedArguments {
  const rootDefault = process.env.QA_ROOT ?? resolve(cwd, '.qa-env');
  let root = rootDefault;
  const cleaned: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? '';
    if (argument === '--root') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('--root requires a directory');
      }
      root = value;
      index += 1;
    } else if (argument.startsWith('--root=')) {
      root = argument.slice('--root='.length);
    } else {
      cleaned.push(argument);
      if (argument === 'run') {
        cleaned.push(...argv.slice(index + 1));
        break;
      }
    }
  }
  const command = (cleaned[0] ?? 'help') as ParsedArguments['command'];
  if (cleaned.length === 0 || ['--help', '-h'].includes(cleaned[0] ?? '')) {
    return { root, command: 'help' };
  }
  if (!['env', 'project', 'template', 'doctor', 'shell', 'run', 'mcp', 'skills', 'update'].includes(command)) {
    throw new Error(`Invalid command: ${command}`);
  }
  const parsed: ParsedArguments = { root, command };
  if (command === 'run') {
    parsed.runArgs = cleaned.slice(1);
    return parsed;
  }
  if (command === 'doctor' || command === 'shell') {
    if (cleaned.length > 1) {
      throw new Error(`${command} takes no arguments`);
    }
    return parsed;
  }
  if (command === 'update') {
    if (cleaned[1] !== 'check') throw new Error('update requires check');
    if (cleaned.length === 4 && cleaned[2] === '--source' && cleaned[3]) parsed.updateSource = cleaned[3];
    else if (cleaned.length !== 2) throw new Error('update check accepts --source <file>');
    return parsed;
  }
  if (command === 'template') {
    const action = cleaned[1];
    if ((action !== 'list' && action !== 'check') || cleaned.length !== 2) throw new Error('template requires list or check');
    parsed.action = action;
    return parsed;
  }
  if (command === 'skills') {
    const action = cleaned[1] as ParsedArguments['skillAction'];
    if (!['check-updates', 'list', 'check', 'install', 'uninstall', 'upgrade', 'repair', 'recover', 'snapshots', 'rollback'].includes(action ?? '')) throw new Error('Invalid skills action');
    parsed.skillAction = action;
    if (action === 'check-updates') {
      if (cleaned.length === 4 && cleaned[2] === '--source' && cleaned[3]) parsed.skillSource = cleaned[3];
      else if (cleaned.length !== 2) throw new Error('skills check-updates accepts --source <file>');
    } else {
      const projectOnly = action === 'list' || action === 'recover' || action === 'snapshots';
      if (cleaned.length !== (projectOnly ? 3 : 4) || !cleaned[2] || (!projectOnly && !cleaned[3])) {
        throw new Error(`skills ${action} requires a project${projectOnly ? '' : ' and name'}`);
      }
      parsed.target = cleaned[2];
      parsed.skillName = cleaned[3];
      if (action === 'rollback') parsed.snapshotId = cleaned[3];
    }
    return parsed;
  }
  if (command === 'mcp') {
    const action = cleaned[1] as ParsedArguments['mcpAction'] | undefined;
    if (!['add', 'remove', 'list', 'check', 'repair'].includes(action ?? '')) {
      throw new Error('mcp requires add, remove, list, check, or repair');
    }
    parsed.mcpAction = action;
    if (action === 'add' || action === 'remove' || action === 'check' || action === 'repair') {
      const name = cleaned[2];
      if (!name) {
        throw new Error(`mcp ${action} requires a server name`);
      }
      parsed.mcpName = name;
    }
    if (cleaned.length !== (action === 'list' ? 2 : 3)) throw new Error('Unexpected mcp arguments');
    return parsed;
  }
  if (command === 'env' || command === 'project') {
    const action = cleaned[1] as ParsedArguments['action'] | undefined;
    const actions = command === 'project'
      ? ['init', 'check', 'uninstall', 'plan', 'upgrade', 'repair', 'snapshots', 'rollback']
      : ['init', 'check', 'uninstall', 'repair', 'plan', 'upgrade', 'snapshots', 'rollback', 'list'];
    if (!actions.includes(action ?? '')) {
      throw new Error(`${command} requires ${actions.join(', ')}`);
    }
    parsed.action = action;
    let index = 2;
    if (command === 'env') {
      if (action === 'init' || action === 'check') {
        const stack = cleaned[index];
        if (!stack) {
          throw new Error(`env ${action} requires python, typescript, or both`);
        }
        parsed.stack = parseStack(stack);
        index += 1;
      } else if (action === 'plan' || action === 'upgrade' || action === 'snapshots') {
        if (cleaned[index] !== 'uv') throw new Error(`env ${action} requires uv`);
        index += 1;
      } else if (action === 'rollback') {
        if (!cleaned[index]) throw new Error('env rollback requires a snapshot identifier');
        parsed.snapshotId = cleaned[index];
        index += 1;
      } else {
        parsed.stack = undefined;
      }
    } else {
      const target = cleaned[index];
      if (!target) {
        throw new Error(`project ${action} requires a project directory`);
      }
      parsed.target = target;
      index += 1;
      if (action === 'rollback') {
        if (!cleaned[index]) throw new Error('project rollback requires a snapshot identifier');
        parsed.snapshotId = cleaned[index];
        index += 1;
      }
    }
    for (; index < cleaned.length; index += 1) {
      const argument = cleaned[index] ?? '';
      const [name, inline] = splitOption(argument);
      const takeValue = (): string => {
        if (inline !== undefined) {
          return inline;
        }
        const value = cleaned[index + 1];
        if (!value) {
          throw new Error(`${name} requires a value`);
        }
        index += 1;
        return value;
      };
      if (
        command === 'env' && action === 'uninstall'
        && name === '--include-external' && inline === undefined
      ) {
        parsed.includeExternal = true;
      } else if (command === 'env' && (action === 'init' || action === 'check') && name === '--skip-codex') {
        parsed.skipCodex = true;
      } else if (command === 'env' && (action === 'init' || action === 'check') && name === '--skip-skills') {
        parsed.skipSkills = true;
      } else if (
        command === 'env'
        && (action === 'init' || action === 'check')
        && name === '--full'
      ) {
        parsed.full = true;
      } else if (command === 'project' && action === 'init' && name === '--with-deps') {
        parsed.withDeps = true;
      } else if (
        command === 'project'
        && (name === '--language' || name === '--语言')
      ) {
        if (action !== 'init') {
          throw new Error('--language is only valid for project init');
        }
        parsed.language = parseProjectStack(takeValue());
      } else if (command === 'project' && (action === 'init' || action === 'check') && name === '--browser') {
        const browser = parseBrowser(takeValue());
        if (action === 'check' && (browser === 'all' || browser === 'none')) {
          throw new Error('project check --browser requires chromium, firefox, or webkit');
        }
        parsed.browser = browser;
      } else {
        throw new Error(`Unknown option: ${argument}`);
      }
    }
    if (command === 'project' && action === 'init' && !parsed.language) {
      throw new Error('project init requires --language python|typescript');
    }
  }
  return parsed;
}

/** Executes one parsed lifecycle command and returns its process exit code. */
export async function execute(args: ParsedArguments): Promise<number> {
  if (args.command === 'help') {
    console.log(helpText());
    return 0;
  }
  if (args.command === 'update') {
    const results = await checkAllUpdates(loadUpdateConfig(args.updateSource));
    for (const result of results) {
      console.log(`${result.name}: ${result.status} | baseline=${result.current} | candidate=${result.candidate ?? 'unknown'}${result.message ? ` | ${result.message}` : ''}`);
    }
    return results.some((result) => result.status === 'error') ? 1 : 0;
  }
  if (args.command === 'template') {
    if (args.action === 'list') { console.log(JSON.stringify(listTemplates(), null, 2)); return 0; }
    const result = checkTemplates();
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }
  if (args.command === 'skills') {
    if (args.skillAction !== 'check-updates') {
      const target = args.target as string;
      if (args.skillAction === 'list') {
        console.log(JSON.stringify(listBuiltinSkills(target), null, 2));
        return 0;
      }
      if (args.skillAction === 'recover') {
        console.log(JSON.stringify(recoverBuiltinSkills(target), null, 2));
        return 0;
      }
      if (args.skillAction === 'snapshots') {
        console.log(JSON.stringify(listBuiltinSkillSnapshots(target), null, 2));
        return 0;
      }
      if (args.skillAction === 'rollback') {
        console.log(JSON.stringify(rollbackBuiltinSkill(target, args.snapshotId as string), null, 2));
        return 0;
      }
      const name = args.skillName as string;
      if (args.skillAction === 'check') {
        const status = listBuiltinSkills(target).find((item) => item.name === name);
        if (!status) throw new Error(`Unknown builtin Skill: ${name}`);
        console.log(JSON.stringify(status, null, 2));
        return status.status === 'installed' ? 0 : 1;
      }
      if (args.skillAction === 'install') {
        installBuiltinSkill(target, name);
        console.log(`Installed ${name}`);
        return 0;
      }
      if (args.skillAction === 'upgrade') {
        console.error('Automatic Skill upgrade is disabled. Review qa skills check and update files manually, then run qa skills check.');
        return 1;
      }
      if (args.skillAction === 'repair') {
        const result = repairBuiltinSkill(target, name);
        console.log(JSON.stringify(result, null, 2));
        return result.modified.length ? 1 : 0;
      }
      const result = uninstallBuiltinSkill(target, name);
      console.log(JSON.stringify(result, null, 2));
      return result.preserved.length ? 1 : 0;
    }
    const sources = loadSkillSources(args.skillSource);
    const results = await checkSkillUpdates(sources);
    for (const result of results) {
      const source = sources.find((item) => item.name === result.name)!;
      console.log(`${result.name}: ${result.status === 'update' ? 'changed' : result.status} | ${source.repository}/${source.path} | ref=${source.ref || '(default)'} | pinned=${result.installedCommit} | candidate=${result.candidateCommit ?? 'unknown'}${result.message ? ` | ${result.message}` : ''}`);
    }
    return results.some((result) => result.status === 'error') ? 1 : 0;
  }
  const env = new Environment({ root: args.root });
  if (args.command === 'env') {
    if (args.action === 'list') { console.log(JSON.stringify(environmentStatus(env), null, 2)); return 0; }
    if (args.action === 'plan') { console.log(JSON.stringify(planEnvironmentUv(env), null, 2)); return 0; }
    if (args.action === 'snapshots') { console.log(JSON.stringify(listEnvironmentUvSnapshots(env), null, 2)); return 0; }
    if (args.action === 'upgrade') { console.error('Automatic uv upgrade is disabled. Run qa env plan uv, update uv manually, then run qa env check.'); return 1; }
    if (args.action === 'rollback') { await rollbackEnvironmentUv(env, args.snapshotId as string); return 0; }
    return executeEnvironment(args, env, uninstallExternalTools);
  }
  if (args.command === 'project') {
    const target = args.target as string;
    if (args.action === 'snapshots') {
      console.log(JSON.stringify(projectSnapshots(env, target), null, 2));
      return 0;
    }
    if (args.action === 'rollback') return projectRollback(env, target, args.snapshotId as string);
    if (args.action === 'plan') {
      console.log(JSON.stringify(projectUpgradePlan(env, target), null, 2));
      return 0;
    }
    if (args.action === 'upgrade') { console.error('Automatic project template upgrade is disabled. Run qa project plan and update files manually, then run qa project check.'); return 1; }
    if (args.action === 'repair') {
      return projectUpgrade(env, target, args.action);
    }
    if (args.action === 'init') {
      const stack = args.language as 'python' | 'typescript';
      const projectArgs: ProjectInitArguments = {
        target,
        stack,
        browser: args.browser,
        withDeps: args.withDeps ?? false,
      };
      return await projectInit(env, projectArgs);
    }
    const projectArgs: ProjectTargetArguments = {
      target,
      browser:
        args.browser && !['all', 'none'].includes(args.browser)
          ? (args.browser as Exclude<Browser, 'all' | 'none'>)
          : 'chromium',
    };
    return args.action === 'check'
      ? projectCheck(env, projectArgs)
      : await projectUninstall(env, projectArgs);
  }
  if (args.command === 'doctor') {
    return executeDoctor(env);
  }
  if (args.command === 'shell') {
    console.log(
      `PowerShell: . "${resolve(env.root, 'activate.ps1')}"\n` +
        `Bash: source ${quoteShell(resolve(env.root, 'activate.sh'))}`,
    );
    return 0;
  }
  if (args.command === 'mcp') {
    if (args.mcpAction === 'list') {
      console.log(JSON.stringify(env.optionalMcpStatuses(), null, 2));
      return 0;
    }
    const name = args.mcpName as string;
    if (args.mcpAction === 'check') {
      const status = env.optionalMcpStatus(name);
      console.log(JSON.stringify(status, null, 2));
      return status.registration === 'present' && status.ownership === 'owned' && status.package.status === 'available' ? 0 : 1;
    }
    if (args.mcpAction === 'add') {
      const version = env.installOptionalMcp(name);
      console.log(`MCP ${name}@${version} installed`);
      return 0;
    }
    if (args.mcpAction === 'repair') {
      const version = env.repairOptionalMcp(name);
      console.log(`MCP ${name}@${version} repaired`);
      return 0;
    }
    env.removeOptionalMcp(name);
    console.log(`MCP ${name} removed`);
    return 0;
  }
  return runCommand(env, args.runArgs ?? []);
}

/** Runs one command inside the selected environment. */
export function runCommand(env: Environment, initial: string[]): number {
  const command = initial[0] === '--' ? initial.slice(1) : [...initial];
  if (command.length === 0) {
    throw new Error('qa run requires a command');
  }
  const executable = command[0] ?? '';
  if (executable === 'python' || executable === 'python3') {
    command[0] = env.python();
    env.run(command);
  } else if (executable === 'bun') {
    env.bun(command.slice(1));
  } else if (executable === 'pnpm') {
    env.pnpm(command.slice(1));
  } else if (executable === 'npm') {
    env.npm(command.slice(1));
  } else if (executable === 'playwright-cli') {
    env.playwrightCli(...command.slice(1));
  } else if (executable === 'agent-browser') {
    env.agentBrowserCli(...command.slice(1));
  } else if (executable === 'cc-switch') {
    env.ccSwitchCli(...command.slice(1));
  } else if (executable === 'codex') {
    env.codex(command.slice(1));
  } else {
    env.run(command);
  }
  return 0;
}

function helpText(): string {
  return [
    'qa env init <python|typescript|both> [--full]',
    'qa env list',
    'qa env repair',
    'qa env plan uv',
    'qa env upgrade uv  (manual-only guidance; no automatic upgrade)',
    'qa env snapshots uv',
    'qa env rollback <snapshot>',
    'qa env check <python|typescript|both> [--full]',
    'qa env uninstall [--include-external]',
    '  --include-external: unavailable while shared usage cannot be verified',
    'qa project init <project> --language <python|typescript> [--browser <name>]',
    '  --language alias: --语言',
    'qa project check <project> [--browser <name>]',
    'qa project plan <project>',
    'qa project uninstall <project>',
    'qa project upgrade <project>  (manual-only guidance; no automatic upgrade)',
    'qa project repair <project>',
    'qa project snapshots <project>',
    'qa project rollback <project> <snapshot>',
    'qa template list',
    'qa template check',
    'qa doctor',
    'qa shell',
    'qa mcp add <name>',
    'qa mcp remove <name>',
    'qa mcp list',
    'qa mcp check <name>',
    'qa mcp repair <name>',
    'qa skills list <project>',
    'qa skills recover <project>',
    'qa skills snapshots <project>',
    'qa skills rollback <project> <snapshot>',
    'qa skills check <project> <name>',
    'qa skills install <project> <name>',
    'qa skills uninstall <project> <name>',
    'qa skills upgrade <project> <name>  (manual-only guidance; no automatic upgrade)',
    'qa skills repair <project> <name>',
    'qa skills check-updates [--source <file>]',
    'qa update check [--source <file>]',
    'qa run <command> [...]',
  ].join('\n');
}

function splitOption(argument: string): [string, string | undefined] {
  const separator = argument.indexOf('=');
  return separator > 0
    ? [argument.slice(0, separator), argument.slice(separator + 1)]
    : [argument, undefined];
}

function parseStack(value: string): Stack {
  if (value === 'python' || value === 'typescript' || value === 'both') {
    return value;
  }
  throw new Error('Invalid stack');
}

function parseProjectStack(value: string): 'python' | 'typescript' {
  if (value === 'python' || value === 'typescript') {
    return value;
  }
  throw new Error('Project language must be python or typescript');
}

function quoteShell(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function parseBrowser(value: string): Browser {
  if (
    value === 'chromium' ||
    value === 'firefox' ||
    value === 'webkit' ||
    value === 'all' ||
    value === 'none'
  ) {
    return value;
  }
  throw new Error('Invalid browser');
}

if (
  process.argv[1] &&
  basename(process.argv[1]) === 'qa-cli.ts' &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    process.exitCode = await execute(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
