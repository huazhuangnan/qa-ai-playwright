import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { API_BASE_URL, expect, test } from '../fixtures/app.ts';

// 链接、文件和文档页面使用同一份契约，避免输入来源漂移。
test('OpenAPI link, local file and rendered page agree @contract', async ({
  page,
  request,
}) => {
  const response = await request.get(`${API_BASE_URL}/openapi.json`);
  expect(response.status()).toBe(200);
  const remote = await response.json();
  const localPath = resolve(
    import.meta.dirname,
    '../../../qa-ticket-app/src/server/openapi.json',
  );
  const local = JSON.parse(await readFile(localPath, 'utf8'));
  expect(remote).toEqual(local);
  expect(remote.openapi).toBe('3.0.3');
  expect(remote.components.securitySchemes.sessionCookie.name).toBe(
    'qa_ticket_session',
  );

  await page.goto(`${API_BASE_URL}/api-docs`);
  await expect(
    page.getByRole('heading', { name: 'POST /api/tickets · 创建工单' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: '下载 OpenAPI JSON' })).toHaveAttribute(
    'href',
    '/openapi.json',
  );
});

// 用契约中的关键状态和字段验证匿名拒绝及登录后的创建流程。
test('ticket creation follows the OpenAPI contract @contract', async ({
  apiAs,
  playwright,
  uniqueId,
}) => {
  const anonymous = await playwright.request.newContext({ baseURL: API_BASE_URL });
  const api = await apiAs('alice');
  let ticketId: number | undefined;
  try {
    const specResponse = await anonymous.get('/openapi.json');
    expect(specResponse.status()).toBe(200);
    const spec = await specResponse.json();
    const operation = spec.paths['/api/tickets'].post;
    expect(operation.responses).toHaveProperty('401');
    expect((await anonymous.post('/api/tickets', { data: { title: uniqueId() } })).status()).toBe(401);

    const title = uniqueId();
    const createdResponse = await api.post('/api/tickets', { data: { title } });
    expect(operation.responses).toHaveProperty(String(createdResponse.status()));
    expect(createdResponse.status()).toBe(201);
    const ticket = await createdResponse.json();
    ticketId = ticket.id;
    for (const field of spec.components.schemas.Ticket.required) {
      expect(ticket).toHaveProperty(field);
    }
    expect(ticket).toMatchObject({ title, status: 'open', version: 1 });
  } finally {
    if (ticketId !== undefined) {
      expect((await api.delete(`/api/tickets/${ticketId}`)).status()).toBe(204);
    }
    await anonymous.dispose();
  }
});
