import { resolve } from 'node:path';
import type { Browser, Stack } from './shared.ts';

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
  withCcSwitch?: boolean;
  environmentName?: string;
  includeExternal?: boolean;
  target?: string;
  snapshotId?: string;
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
    parsed.updateSource = parseSource(cleaned.slice(2), 'update check');
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
      parsed.skillSource = parseSource(cleaned.slice(2), 'skills check-updates');
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
      throw new Error('mcp requires add, remove, or list; check and repair are also supported');
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
      if (command === 'env' && action === 'init' && name === '--name') {
        parsed.environmentName = takeValue();
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(parsed.environmentName)) throw new Error('--name must contain lowercase letters, digits, and single hyphens');
      } else if (
        command === 'env' && action === 'uninstall'
        && name === '--include-external' && inline === undefined
      ) {
        parsed.includeExternal = true;
      } else if (command === 'env' && (action === 'init' || action === 'check') && name === '--skip-codex') {
        parsed.skipCodex = true;
      } else if (command === 'env' && (action === 'init' || action === 'check') && name === '--skip-skills') {
        parsed.skipSkills = true;
      } else if (command === 'env' && (action === 'init' || action === 'check') && name === '--with-cc-switch' && inline === undefined) {
        parsed.withCcSwitch = true;
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
          throw new Error('project check --browser requires chromium, chrome, msedge, firefox, or webkit');
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

/** Parse the shared source option while preserving its existing argument syntax. */
function parseSource(args: string[], command: string): string | undefined {
  if (args.length === 0) return undefined;
  if (args.length !== 2 || args[0] !== '--source' || !args[1]) {
    throw new Error(`${command} accepts --source <file>`);
  }
  return args[1];
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

function parseBrowser(value: string): Browser {
  if (
    value === 'chromium' ||
    value === 'chrome' ||
    value === 'msedge' ||
    value === 'firefox' ||
    value === 'webkit' ||
    value === 'all' ||
    value === 'none'
  ) {
    return value;
  }
  throw new Error('Invalid browser');
}

