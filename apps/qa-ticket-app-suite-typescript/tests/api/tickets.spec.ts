import { expect, test } from '../fixtures/app.ts';

// 验证工单状态流转、乐观锁和评论审计，并在结束后清理数据。
test('ticket lifecycle enforces state and version rules @smoke @integration', async ({
  apiAs,
}) => {
  const api = await apiAs('alice');
  const createdResponse = await api.post('/api/tickets', {
    data: {
      title: `API 状态机-${Date.now()}`,
      description: '验证状态、评论和审计。',
      priority: 'high',
    },
  });
  expect(createdResponse.status()).toBe(201);
  const created = await createdResponse.json();

  try {
    await test.step('拒绝跨越处理中的状态变更', async () => {
      const invalid = await api.patch(`/api/tickets/${created.id}`, {
        data: { version: 1, status: 'resolved' },
      });
      expect(invalid.status()).toBe(409);
      expect(await invalid.json()).toMatchObject({
        error: { code: 'INVALID_TRANSITION' },
      });
    });

    await test.step('推进状态并验证版本递增', async () => {
      const moved = await api.patch(`/api/tickets/${created.id}`, {
        data: { version: 1, status: 'in_progress' },
      });
      expect(moved.status()).toBe(200);
      expect(await moved.json()).toMatchObject({
        status: 'in_progress',
        version: 2,
      });
    });

    await test.step('拒绝旧版本覆盖新数据', async () => {
      const stale = await api.patch(`/api/tickets/${created.id}`, {
        data: { version: 1, title: '旧版本覆盖' },
      });
      expect(stale.status()).toBe(409);
      expect(await stale.json()).toMatchObject({
        error: { code: 'VERSION_CONFLICT' },
      });
    });

    await test.step('添加评论并验证审计记录', async () => {
      const comment = await api.post(`/api/tickets/${created.id}/comments`, {
        data: { body: '已经补充复现步骤。' },
      });
      expect(comment.status()).toBe(201);

      const detail = await (await api.get(`/api/tickets/${created.id}`)).json();
      expect(detail.comments).toHaveLength(1);
      expect(detail.audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: 'comment.created' }),
        ]),
      );
    });
  } finally {
    await api.delete(`/api/tickets/${created.id}`);
  }
});

// 验证成员不能修改他人工单，管理员可以分配负责人。
test('member ownership and admin assignment are enforced @security @regression', async ({
  apiAs,
}) => {
  const bobApi = await apiAs('bob');
  const created = await (
    await bobApi.post('/api/tickets', {
      data: { title: `Bob 权限-${Date.now()}`, priority: 'medium' },
    })
  ).json();

  try {
    const aliceApi = await apiAs('alice');
    expect(
      (
        await aliceApi.patch(`/api/tickets/${created.id}`, {
          data: { version: 1, title: '越权修改' },
        })
      ).status(),
    ).toBe(403);
    expect(
      (await aliceApi.delete(`/api/tickets/${created.id}`)).status(),
    ).toBe(403);

    const adminApi = await apiAs('admin');
    const users = await (await adminApi.get('/api/users')).json();
    const alice = users.items.find(
      (item: { username: string }) => item.username === 'alice',
    );
    expect(alice).toBeDefined();

    const assigned = await adminApi.patch(`/api/tickets/${created.id}`, {
      data: { version: 1, assigneeId: alice.id },
    });
    expect(assigned.status()).toBe(200);
    expect(await assigned.json()).toMatchObject({
      assigneeName: 'alice',
      version: 2,
    });
  } finally {
    const adminApi = await apiAs('admin');
    await adminApi.delete(`/api/tickets/${created.id}`);
  }
});

// 验证筛选、分页边界和搜索输入的实际结果。
test('query filters and pagination boundaries are enforced @regression', async ({
  apiAs,
}) => {
  const api = await apiAs('alice');

  const all = await api.get('/api/tickets?page=1&pageSize=50');
  expect(all.status()).toBe(200);
  expect(await all.json()).toMatchObject({
    page: 1,
    pageSize: 50,
    total: 30,
  });

  expect((await api.get('/api/tickets?pageSize=51')).status()).toBe(400);

  const filtered = await api.get(
    '/api/tickets?status=in_progress&priority=high&pageSize=50',
  );
  expect(filtered.status()).toBe(200);
  const result = await filtered.json();
  expect(
    result.items.every(
      (item: { status: string; priority: string }) =>
        item.status === 'in_progress' && item.priority === 'high',
    ),
  ).toBe(true);

  const injection = await api.get(
    `/api/tickets?q=${encodeURIComponent("' OR 1=1 --")}`,
  );
  expect(injection.status()).toBe(200);
  expect((await injection.json()).total).toBe(0);
});

// 验证标题必填、长度上限和优先级枚举。
test('ticket creation rejects invalid field boundaries @regression', async ({
  apiAs,
}) => {
  const api = await apiAs('alice');

  expect(
    (
      await api.post('/api/tickets', {
        data: { title: ' ', priority: 'medium' },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await api.post('/api/tickets', {
        data: { title: 'x'.repeat(81), priority: 'medium' },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await api.post('/api/tickets', {
        data: { title: '非法优先级', priority: 'critical' },
      })
    ).status(),
  ).toBe(400);
});

// 验证关键词查询不会匹配无关数据，成员也不能自行分配负责人。
test('search and member assignment boundary @regression', async ({
  apiAs,
}) => {
  const api = await apiAs('alice');
  const keyword = `唯一搜索-${Date.now()}`;
  const created = await (
    await api.post('/api/tickets', {
      data: {
        title: keyword,
        description: '验证关键词搜索和清理。',
        priority: 'low',
      },
    })
  ).json();

  try {
    const searched = await api.get(
      `/api/tickets?q=${encodeURIComponent(keyword)}`,
    );
    expect(searched.status()).toBe(200);
    expect((await searched.json()).items).toHaveLength(1);

    const assign = await api.patch(`/api/tickets/${created.id}`, {
      data: { version: 1, assigneeId: 1 },
    });
    expect(assign.status()).toBe(403);
  } finally {
    await api.delete(`/api/tickets/${created.id}`);
  }
});

// 验证空评论被拒绝，删除后工单不再可查询。
test('comment validation and delete visibility @regression', async ({
  apiAs,
  uniqueId,
}) => {
  const api = await apiAs('alice');
  const created = await (
    await api.post('/api/tickets', {
      data: {
        title: uniqueId(),
        description: '验证评论与删除。',
        priority: 'low',
      },
    })
  ).json();

  try {
    const emptyComment = await api.post(
      `/api/tickets/${created.id}/comments`,
      { data: { body: '  ' } },
    );
    expect(emptyComment.status()).toBe(400);

    expect((await api.delete(`/api/tickets/${created.id}`)).status()).toBe(
      204,
    );
    expect((await api.get(`/api/tickets/${created.id}`)).status()).toBe(404);
  } finally {
    await api.delete(`/api/tickets/${created.id}`);
  }
});
