import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test as setup } from '@playwright/test';
import {
  authCredentials,
  authStatePath,
  configuredAuthRoles,
} from './auth/state';

/**
 * Generates one storage state file per configured role.
 * Login selectors are environment-driven because they depend on the app under test.
 */
for (const role of configuredAuthRoles()) {
  setup(`authenticate ${role}`, async ({ page }) => {
    const usernameSelector = process.env.QA_AUTH_USERNAME_SELECTOR?.trim();
    const passwordSelector = process.env.QA_AUTH_PASSWORD_SELECTOR?.trim();
    const submitSelector =
      process.env.QA_AUTH_SUBMIT_SELECTOR?.trim() || 'button[type="submit"]';
    const successSelector = process.env.QA_AUTH_SUCCESS_SELECTOR?.trim();
    const successUrl = process.env.QA_AUTH_SUCCESS_URL?.trim();
    if (!usernameSelector || !passwordSelector || (!successSelector && !successUrl)) {
      throw new Error(
        'Auth setup requires username/password selectors and a success selector or URL',
      );
    }

    const credentials = authCredentials(role);
    await page.goto(process.env.QA_AUTH_LOGIN_PATH?.trim() || '/login');
    await page.locator(usernameSelector).fill(credentials.username);
    await page.locator(passwordSelector).fill(credentials.password);
    await page.locator(submitSelector).click();

    if (successSelector) {
      await expect(page.locator(successSelector)).toBeVisible();
    } else {
      await page.waitForURL(successUrl!);
    }

    const statePath = authStatePath(role);
    mkdirSync(dirname(statePath), { recursive: true });
    await page.context().storageState({
      path: statePath,
      indexedDB: process.env.QA_AUTH_INDEXED_DB === 'true',
    });
  });
}
