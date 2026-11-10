import { randomUUID } from 'node:crypto';
import {
  test as base,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

interface AppFixtures {
  uniqueId: () => string;
  apiAs: (username: string) => Promise<APIRequestContext>;
  loginAs: (page: Page, username: string) => Promise<void>;
}

export const API_BASE_URL =
  process.env.API_BASE_URL ||
  process.env.BASE_URL ||
  'http://127.0.0.1:8787';

/**
 * Logs a browser page into the example application.
 */
async function loginAs(page: Page, username: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码').fill('demo1234');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(
    page.getByRole('heading', { name: '工单工作台' }),
  ).toBeVisible();
}

export const test = base.extend<AppFixtures>({
  uniqueId: async ({}, use) => {
    await use(() => `QA-${randomUUID().slice(0, 8)}`);
  },

  apiAs: async ({ playwright }, use) => {
    const contexts: APIRequestContext[] = [];
    await use(async (username) => {
      const context = await playwright.request.newContext({
        baseURL: API_BASE_URL,
      });
      const response = await context.post('/api/auth/login', {
        data: { username, password: 'demo1234' },
      });
      expect(
        response.status(),
        `API login failed for ${username}`,
      ).toBe(200);
      contexts.push(context);
      return context;
    });
    await Promise.all(contexts.map((context) => context.dispose()));
  },

  loginAs: async ({}, use) => {
    await use(loginAs);
  },
});

export { expect };
