import { API_BASE_URL, expect, test } from '../fixtures/app.ts';

// 匿名访问和错误凭证都不能建立有效会话。
test('authentication rejects anonymous and invalid credentials @security', async ({
  playwright,
}) => {
  const api = await playwright.request.newContext({
    baseURL: API_BASE_URL,
  });

  const anonymous = await api.get('/api/tickets');
  expect(anonymous.status()).toBe(401);
  expect(await anonymous.json()).toMatchObject({
    error: { code: 'UNAUTHORIZED' },
  });

  const invalid = await api.post('/api/auth/login', {
    data: { username: 'alice', password: 'wrong' },
  });
  expect(invalid.status()).toBe(401);
  expect(await invalid.json()).toMatchObject({
    error: { code: 'INVALID_CREDENTIALS' },
  });

  await api.dispose();
});

// 登录后可查询身份，退出后会话失效。
test('login establishes a session and logout invalidates it @smoke', async ({
  apiAs,
}) => {
  const api = await apiAs('alice');

  const me = await api.get('/api/auth/me');
  expect(me.status()).toBe(200);
  expect(await me.json()).toMatchObject({
    user: { username: 'alice', role: 'member' },
  });

  expect((await api.post('/api/auth/logout')).status()).toBe(204);
  expect((await api.get('/api/auth/me')).status()).toBe(401);
});
