import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { parse } from 'dotenv';
import { localTarget } from './tests/support/local-targets.ts';

function readEnvironmentFile(name: string): Record<string, string> {
  const filePath = resolve(process.cwd(), name);
  return existsSync(filePath) ? parse(readFileSync(filePath)) : {};
}

function loadProjectEnvironment(): string {
  const inherited = { ...process.env };
  const common = readEnvironmentFile('.env');
  const selected = (inherited.QA_ENV || common.QA_ENV || 'dev')
    .trim()
    .toLowerCase();
  if (!/^[a-z][a-z0-9_-]*$/.test(selected)) {
    throw new Error(`Invalid QA_ENV: ${selected}`);
  }
  const profile = readEnvironmentFile(`.env.${selected}`);
  Object.assign(process.env, common, profile, inherited, { QA_ENV: selected });
  return selected;
}

const qaEnvironment = loadProjectEnvironment();
const uiBaseUrl = localTarget(
  process.env.UI_BASE_URL || 'http://127.0.0.1:5173',
  'http://127.0.0.1:5173',
);
const apiBaseUrl = localTarget(
  process.env.API_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:8787',
  'http://127.0.0.1:8787',
);
process.env.API_BASE_URL = apiBaseUrl;

export default defineConfig({
  metadata: { qaEnvironment, uiBaseUrl, apiBaseUrl },
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  failOnFlakyTests: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
  ],
  expect: { timeout: 7_000 },
  use: {
    baseURL: uiBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'bun tests/support/start-example-api.ts',
      url: `${apiBaseUrl}/api/health`,
      reuseExistingServer: false,
      timeout: 45_000,
    },
    {
      command: 'bun tests/support/start-example-web.ts',
      url: uiBaseUrl,
      reuseExistingServer: false,
      timeout: 45_000,
    },
  ],
});
