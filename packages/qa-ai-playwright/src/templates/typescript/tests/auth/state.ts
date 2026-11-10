import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const AUTH_DIRECTORY = 'playwright/.auth';
const ROLE_PATTERN = /^[a-z][a-z0-9_-]*$/;

/** Credentials required to generate one role's browser state. */
export interface AuthCredentials {
  username: string;
  password: string;
}

/** Normalizes a role used in file names and environment variable names. */
export function normalizeAuthRole(role: string): string {
  const normalized = role.trim().toLowerCase();
  if (!ROLE_PATTERN.test(normalized)) {
    throw new Error(`Invalid QA auth role: ${role}`);
  }
  return normalized;
}

/** Reads the unique roles configured for auth setup. */
export function configuredAuthRoles(
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  const configured = environment.QA_AUTH_ROLES?.trim();
  if (!configured) {
    return [];
  }

  return [...new Set(
    configured
      .split(',')
      .filter((role) => role.trim())
      .map((role) => normalizeAuthRole(role))
  )];
}

/** Returns the role selected for the default browser projects. */
export function selectedAuthRole(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const roles = configuredAuthRoles(environment);
  const requested = environment.QA_AUTH_ROLE?.trim();
  const selected = normalizeAuthRole(requested || roles[0] || 'user');
  if (roles.length > 0 && !roles.includes(selected)) {
    throw new Error(
      `QA_AUTH_ROLE must be one of QA_AUTH_ROLES: ${roles.join(', ')}`,
    );
  }
  return selected;
}

/** Builds the environment variable name for one role, for example QA_AUTH_ADMIN_USERNAME. */
export function authRoleVariable(role: string, suffix: string): string {
  const normalizedRole = normalizeAuthRole(role).replaceAll('-', '_');
  return `QA_AUTH_${normalizedRole.toUpperCase()}_${suffix}`;
}

/** Reads one role's credentials without exposing them in logs. */
export function authCredentials(
  role: string,
  environment: NodeJS.ProcessEnv = process.env,
): AuthCredentials {
  const usernameVariable = authRoleVariable(role, 'USERNAME');
  const passwordVariable = authRoleVariable(role, 'PASSWORD');
  const username = environment[usernameVariable]?.trim();
  const password = environment[passwordVariable];
  if (!username || !password) {
    throw new Error(
      `Missing auth credentials: ${usernameVariable} and ${passwordVariable}`,
    );
  }
  return { username, password };
}

/** Resolves one role's ignored storage state file. */
export function authStatePath(
  role: string,
  environment: NodeJS.ProcessEnv = process.env,
  projectRoot = process.cwd(),
): string {
  const normalizedRole = normalizeAuthRole(role);
  const manualState = environment.QA_AUTH_STATE?.trim();
  if (
    manualState
    && normalizedRole === selectedAuthRole(environment)
  ) {
    return resolve(projectRoot, manualState);
  }
  return resolve(projectRoot, AUTH_DIRECTORY, `${normalizedRole}.json`);
}

/** Requires a previously generated role state file. */
export function requireAuthState(
  role: string,
  environment: NodeJS.ProcessEnv = process.env,
  projectRoot = process.cwd(),
): string {
  const statePath = authStatePath(role, environment, projectRoot);
  if (!existsSync(statePath)) {
    throw new Error(
      `Auth state does not exist: ${statePath}. Run pnpm run auth:setup first.`,
    );
  }
  return statePath;
}
