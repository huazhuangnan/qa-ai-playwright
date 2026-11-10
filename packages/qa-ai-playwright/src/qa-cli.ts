#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  Environment,
  type EnvironmentCheckOptions,
  type EnvironmentInitOptions,
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
} from './cli/shared.ts';

/** Parsed command line used by the local QA lifecycle CLI. */
export interface ParsedArguments {
  root: string;
  command: 'env' | 'project' | 'doctor' | 'shell' | 'run' | 'mcp' | 'help';
  action?: 'init' | 'check' | 'uninstall';
  mcpAction?: 'add' | 'remove' | 'list';
  mcpName?: string;
  stack?: Stack;
  full?: boolean;
  skipCodex?: boolean;
  skipSkills?: boolean;
  target?: string;
  language?: 'python' | 'typescript';
  browser?: Browser;
  withDeps?: boolean;
  runArgs?: string[];
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
  if (!['env', 'project', 'doctor', 'shell', 'run', 'mcp'].includes(command)) {
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
  if (command === 'mcp') {
    const action = cleaned[1] as ParsedArguments['mcpAction'] | undefined;
    if (!['add', 'remove', 'list'].includes(action ?? '')) {
      throw new Error('mcp requires add, remove, or list');
    }
    parsed.mcpAction = action;
    if (action === 'add' || action === 'remove') {
      const name = cleaned[2];
      if (!name) {
        throw new Error(`mcp ${action} requires a server name`);
      }
      parsed.mcpName = name;
    }
    return parsed;
  }
  if (command === 'env' || command === 'project') {
    const action = cleaned[1] as ParsedArguments['action'] | undefined;
    if (!['init', 'check', 'uninstall'].includes(action ?? '')) {
      throw new Error(`${command} requires init, check, or uninstall`);
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
      if (command === 'env' && name === '--skip-codex') {
        parsed.skipCodex = true;
      } else if (command === 'env' && name === '--skip-skills') {
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
      } else if (command === 'project' && name === '--browser') {
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
  const env = new Environment({ root: args.root });
  if (args.command === 'env') {
    const envArgs: EnvironmentInitOptions = {
      stack: args.stack ?? 'typescript',
      profile: args.full ? 'full' : 'standard',
      skipCodex: args.skipCodex ?? false,
      skipSkills: args.skipSkills ?? false,
    };
    if (args.action === 'init') {
      return env.init(envArgs);
    }
    if (args.action === 'check') {
      const checkArgs: EnvironmentCheckOptions = {
        stack: envArgs.stack,
        profile: envArgs.profile,
        skipCodex: envArgs.skipCodex,
        skipSkills: envArgs.skipSkills,
      };
      return env.check(checkArgs);
    }
    if (!existsSync(env.marker)) {
      console.log('Nothing to uninstall');
      return 0;
    }
    // The native launcher removes the active managed Node after this process exits.
    return 20;
  }
  if (args.command === 'project') {
    const target = args.target as string;
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
    const components = (env.state.components ?? {
      codex: true,
      browser_tools: true,
    }) as {
      codex?: boolean;
      skills?: boolean;
      browser_tools?: boolean;
      agent_browser?: boolean;
    };
    return env.check({
      stack: (env.state.stack ?? 'both') as Stack,
      profile:
        env.state.profile === 'full' || components.agent_browser
          ? 'full'
          : 'standard',
      skipCodex: !components.codex,
      skipSkills: !(components.browser_tools ?? components.skills ?? true),
    });
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
      for (const name of env.optionalMcpNames()) {
        console.log(name);
      }
      return 0;
    }
    const name = args.mcpName as string;
    if (args.mcpAction === 'add') {
      const version = env.installOptionalMcp(name);
      console.log(`MCP ${name}@${version} installed`);
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
    'qa env check <python|typescript|both> [--full]',
    'qa env uninstall',
    'qa project init <project> --language <python|typescript> [--browser <name>]',
    '  --language alias: --语言',
    'qa project check <project> [--browser <name>]',
    'qa project uninstall <project>',
    'qa doctor',
    'qa shell',
    'qa mcp add <name>',
    'qa mcp remove <name>',
    'qa mcp list',
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
