import { expect, test } from '../fixtures/app.ts';

// 成员可以查看他人工单，但不能看到编辑和删除入口。
test('member cannot see destructive controls for another user ticket @security', async ({
  page,
  loginAs,
  apiAs,
  uniqueId,
}) => {
  const title = `Bob 私有工单 ${uniqueId()}`;
  const bobApi = await apiAs('bob');
  const created = await (
    await bobApi.post('/api/tickets', {
      data: { title, priority: 'medium' },
    })
  ).json();

  try {
    await loginAs(page, 'alice');
    await page.getByLabel('搜索工单').fill(title);
    await page.getByRole('button', { name: `查看 ${title}` }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: title });
    await expect(
      dialog.getByRole('button', { name: '编辑工单' }),
    ).not.toBeVisible();
    await expect(
      dialog.getByRole('button', { name: '删除工单' }),
    ).not.toBeVisible();
  } finally {
    const bobCleanup = await apiAs('bob');
    await bobCleanup.delete(`/api/tickets/${created.id}`);
  }
});

// 评论按纯文本显示，脚本内容不得触发浏览器对话框。
test('stored XSS text is rendered without execution @security', async ({
  page,
  loginAs,
  apiAs,
  uniqueId,
}) => {
  const title = `XSS 评论 ${uniqueId()}`;
  const aliceApi = await apiAs('alice');
  const created = await (
    await aliceApi.post('/api/tickets', {
      data: { title, priority: 'high' },
    })
  ).json();
  let dialogOpened = false;
  page.on('dialog', async (dialog) => {
    dialogOpened = true;
    await dialog.dismiss();
  });

  try {
    await loginAs(page, 'alice');
    await page.getByLabel('搜索工单').fill(title);
    await page.getByRole('button', { name: `查看 ${title}` }).click();
    const payload = '<img src=x onerror=alert(1)>';
    await page.getByLabel('添加评论').fill(payload);
    await page.getByRole('button', { name: '提交评论' }).click();
    await expect(page.getByText(payload, { exact: true })).toBeVisible();
    expect(dialogOpened).toBe(false);
  } finally {
    await aliceApi.delete(`/api/tickets/${created.id}`);
  }
});
