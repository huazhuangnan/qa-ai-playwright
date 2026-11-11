import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  authCredentials,
  authRoleVariable,
  authStatePath,
  configuredAuthRoles,
  normalizeAuthRole,
  selectedAuthRole,
} from '../auth/state';

// 角色配置去重，并限制登录态文件留在受忽略的目录。
test('@unit reads unique auth roles from the environment', () => {
  expect(configuredAuthRoles({
    QA_AUTH_ROLES: 'admin,user,admin',
  })).toEqual(['admin', 'user']);
});

test('@unit selects an explicitly configured auth role', () => {
  expect(selectedAuthRole({
    QA_AUTH_ROLES: 'admin,user',
    QA_AUTH_ROLE: 'user',
  })).toBe('user');
});

test('@unit keeps role state files under the ignored auth directory', () => {
  expect(authStatePath('admin', {}, '/project')).toBe(
    join('/project', 'playwright/.auth/admin.json'),
  );
});

test('@unit maps role credentials to environment variable names', () => {
  const credentials = authCredentials('tenant-admin', {
    QA_AUTH_TENANT_ADMIN_USERNAME: 'admin@example.test',
    QA_AUTH_TENANT_ADMIN_PASSWORD: 'secret',
  });
  expect(authRoleVariable('tenant-admin', 'USERNAME'))
    .toBe('QA_AUTH_TENANT_ADMIN_USERNAME');
  expect(credentials.username).toBe('admin@example.test');
});

test('@unit rejects auth roles that could escape the state directory', () => {
  expect(() => normalizeAuthRole('../admin')).toThrow('Invalid QA auth role');
});
