import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { parse } from 'dotenv';
import {
  authStatePath,
  configuredAuthRoles,
  selectedAuthRole,
} from './tests/auth/state';

/**
 * Reads a dotenv file from the project root.
 * Missing files return an empty profile so fresh projects can initialize.
 */
function readEnvironmentFile(name: string): Record<string, string> {
  const filePath = resolve(process.cwd(), name);
  if (!existsSync(filePath)) {
    return {};
  }

  return parse(readFileSync(filePath));
}

/**
 * Loads common settings, then the selected environment file.
 * Existing process variables remain the highest-priority values.
 */
function loadProjectEnvironment(): string {
  const inherited = { ...process.env };
  const common = readEnvironmentFile('.env');
  const selected = (inherited.QA_ENV || common.QA_ENV || 'dev')
    .trim()
    .toLowerCase();
  if (!/^[a-z][a-z0-9_-]*$/.test(selected)) {
    throw new Error(`Invalid QA_ENV: ${selected}`);
  }

  const profileName = `.env.${selected}`;
  const profile = readEnvironmentFile(profileName);
  Object.assign(process.env, common, profile, inherited, { QA_ENV: selected });
  return selected;
}

const qaEnvironment = loadProjectEnvironment();
const uiBaseUrl = process.env.UI_BASE_URL || process.env.BASE_URL;
const apiBaseUrl = process.env.API_BASE_URL || process.env.BASE_URL;
const webServerCommand = process.env.PLAYWRIGHT_WEB_SERVER_COMMAND;
const configuredAuthState = process.env.QA_AUTH_STATE;
const authRoles = configuredAuthRoles();
const authRole = selectedAuthRole();
const authSetupEnabled = authRoles.length > 0;
const browserChannel = process.env.QA_BROWSER_CHANNEL?.trim() || undefined;
const browserExecutablePath = process.env.QA_BROWSER_EXECUTABLE_PATH?.trim() || undefined;
if (browserChannel && !['chrome', 'msedge'].includes(browserChannel)) {
  throw new Error('QA_BROWSER_CHANNEL must be chrome or msedge');
}
const chromiumLaunch = {
  ...(browserChannel ? { channel: browserChannel } : {}),
  ...(browserExecutablePath ? { launchOptions: { executablePath: browserExecutablePath } } : {}),
};
const authState = configuredAuthState || authSetupEnabled
  ? authStatePath(authRole)
  : undefined;
if (!authSetupEnabled && authState && !existsSync(authState)) {
  throw new Error(`Auth state does not exist: ${authState}`);
}

/** Adds the auth setup dependency only when role generation is enabled. */
function browserProject(
  name: string,
  device: (typeof devices)[string],
) {
  return {
    name,
    use: {
      ...device,
      ...(name === 'chromium' ? chromiumLaunch : {}),
      storageState: authState,
    },
    ...(authSetupEnabled ? { dependencies: ['auth-setup'] } : {}),
  };
}

export default defineConfig({
  metadata: {
    qaEnvironment,
    apiBaseUrl,
    authRole,
    authRoles,
  },
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  failOnFlakyTests: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'reports/junit.xml' }]],
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: uiBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
  },
  webServer: webServerCommand && uiBaseUrl
    ? {
        command: webServerCommand,
        url: uiBaseUrl,
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
  projects: [
    ...(authSetupEnabled
      ? [{ name: 'auth-setup', testMatch: /auth\.setup\.ts/, use: chromiumLaunch }]
      : []),
    browserProject('chromium', devices['Desktop Chrome']),
    browserProject('firefox', devices['Desktop Firefox']),
    browserProject('webkit', devices['Desktop Safari']),
  ],
});
