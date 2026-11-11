import { randomUUID } from 'node:crypto';
import {
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Page,
  test as base,
  expect,
} from '@playwright/test';
import { normalizeAuthRole, requireAuthState } from '../auth/state';

export interface CleanupRegistry {
  add: (name: string, action: () => Promise<void>) => void;
}

export interface QaFixtures {
  uniqueId: () => string;
  cleanup: CleanupRegistry;
  api: QaApiClient;
  requireWriteAccess: () => void;
  loginAs: (role: string) => Promise<Page>;
}

/**
 * Rejects writes to production-like profiles unless explicitly enabled.
 */
export function assertWriteAccess(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const profile = (environment.QA_ENV || 'dev').toLowerCase();
  const protectedProfiles = new Set(['prod', 'production', 'prd', 'live']);
  if (
    protectedProfiles.has(profile)
    && environment.QA_ALLOW_PRODUCTION_WRITES !== 'true'
  ) {
    throw new Error(
      'Production writes require QA_ALLOW_PRODUCTION_WRITES=true',
    );
  }
}

/** API client that applies production write protection to mutations. */
export class QaApiClient {
  private readonly readOnlyMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

  constructor(private readonly context: APIRequestContext) {}

  /** Send a request relative to the selected environment. */
  async request(
    method: string,
    path: string,
    options: NonNullable<Parameters<APIRequestContext['fetch']>[1]> = {},
  ): Promise<APIResponse> {
    if (!this.readOnlyMethods.has(method.toUpperCase())) {
      assertWriteAccess();
    }
    return this.context.fetch(path, {
      ...options,
      method,
    });
  }

  /** Send a GET request. */
  async get(
    path: string,
    options?: Parameters<APIRequestContext['get']>[1],
  ): Promise<APIResponse> {
    return this.context.get(path, options);
  }

  /** Send a POST request after applying the production write guard. */
  async post(
    path: string,
    options?: Parameters<APIRequestContext['post']>[1],
  ): Promise<APIResponse> {
    assertWriteAccess();
    return this.context.post(path, options);
  }

  /** Send a PUT request after applying the production write guard. */
  async put(
    path: string,
    options?: Parameters<APIRequestContext['put']>[1],
  ): Promise<APIResponse> {
    assertWriteAccess();
    return this.context.put(path, options);
  }

  /** Send a PATCH request after applying the production write guard. */
  async patch(
    path: string,
    options?: Parameters<APIRequestContext['patch']>[1],
  ): Promise<APIResponse> {
    assertWriteAccess();
    return this.context.patch(path, options);
  }

  /** Send a DELETE request after applying the production write guard. */
  async delete(
    path: string,
    options?: Parameters<APIRequestContext['delete']>[1],
  ): Promise<APIResponse> {
    assertWriteAccess();
    return this.context.delete(path, options);
  }
}

export const test = base.extend<QaFixtures>({
  uniqueId: async ({}, use) => {
    await use(() => `${process.env.QA_ENV || 'dev'}-${randomUUID()}`);
  },

  cleanup: async ({}, use) => {
    const actions: Array<{ name: string; action: () => Promise<void> }> = [];
    await use({
      add: (name, action) => actions.push({ name, action }),
    });

    const errors: string[] = [];
    for (const entry of [...actions].reverse()) {
      try {
        await entry.action();
      } catch (error) {
        errors.push(`${entry.name}: ${String(error)}`);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(
        errors.map((message) => new Error(message)),
        'QA cleanup failed',
      );
    }
  },

  api: async ({ playwright }, use) => {
    const token = process.env.QA_API_TOKEN;
    const header = process.env.QA_API_TOKEN_HEADER || 'Authorization';
    const scheme = process.env.QA_API_AUTH_SCHEME || 'Bearer';
    const timeoutSeconds = Number(process.env.QA_API_TIMEOUT || '15');
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
      throw new Error('QA_API_TIMEOUT must be a positive number');
    }
    const context = await playwright.request.newContext({
      baseURL: process.env.API_BASE_URL || process.env.BASE_URL,
      timeout: timeoutSeconds * 1_000,
      extraHTTPHeaders: token
        ? { [header]: `${scheme} ${token}`.trim() }
        : undefined,
    });
    try {
      await use(new QaApiClient(context));
    } finally {
      await context.dispose();
    }
  },

  requireWriteAccess: async ({}, use) => {
    await use(() => assertWriteAccess());
  },

  /** Opens an isolated page with a previously generated role state. */
  loginAs: async ({ browser, baseURL }, use) => {
    const contexts: BrowserContext[] = [];
    try {
      await use(async (role) => {
        const context = await browser.newContext({
          baseURL,
          storageState: requireAuthState(normalizeAuthRole(role)),
        });
        contexts.push(context);
        return context.newPage();
      });
    } finally {
      await Promise.all(contexts.reverse().map((context) => context.close()));
    }
  },
});

export { expect };
