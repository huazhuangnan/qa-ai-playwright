import { expect, test } from '../fixtures/app.ts';

// 成员创建自己的工单，评论后刷新页面，确认记录可查询。
test('member creates, filters, comments, and reloads a ticket @smoke @integration', async ({
  page,
  loginAs,
  apiAs,
  uniqueId,
}) => {
  const title = `成员全链路 ${uniqueId()}`;
  await loginAs(page, 'alice');

  try {
    await test.step('创建工单并按标题查询', async () => {
      await page.getByRole('button', { name: '新建工单' }).click();
      const createDialog = page.getByRole('dialog', { name: '新建工单' });
      await createDialog.getByLabel('标题').fill(title);
      await createDialog
        .getByLabel('描述')
        .fill('通过浏览器创建并验证持久化。');
      await createDialog.getByLabel('优先级').click();
      await page.getByRole('option', { name: '高' }).click();
      await createDialog.getByRole('button', { name: '创建工单' }).click();

      await expect(page.getByText('工单已创建')).toBeVisible();
      await page.getByLabel('搜索工单').fill(title);
      const openButton = page.getByRole('button', {
        name: `查看 ${title}`,
      });
      await expect(openButton).toBeVisible();
      await openButton.click();
    });

    await test.step('添加评论并验证显示', async () => {
      await expect(
        page.getByRole('dialog').getByRole('heading', { name: title }),
      ).toBeVisible();
      await page.getByLabel('添加评论').fill('已经补充复现步骤。');
      await page.getByRole('button', { name: '提交评论' }).click();
      await expect(page.getByText('已经补充复现步骤。')).toBeVisible();
    });

    await test.step('刷新并按状态筛选', async () => {
      await page.getByRole('button', { name: 'Close' }).click();
      await page.reload();
      await page.getByLabel('搜索工单').fill(title);
      await expect(
        page.getByRole('button', { name: `查看 ${title}` }),
      ).toBeVisible();

      await page.getByLabel('状态').click();
      await page.getByRole('option', { name: '待处理' }).click();
      await expect(
        page.getByRole('button', { name: `查看 ${title}` }),
      ).toBeVisible();
    });
  } finally {
    // 通过唯一标题定位本用例创建的数据，避免清理其他人的工单。
    const api = await apiAs('alice');
    const list = await (
      await api.get(`/api/tickets?q=${encodeURIComponent(title)}&pageSize=50`)
    ).json();
    for (const ticket of list.items.filter(
      (item: { title: string }) => item.title === title,
    )) {
      await api.delete(`/api/tickets/${ticket.id}`);
    }
  }
});
// 同一工单由成员创建并评论，再由管理员分配、处理和关闭。
test('member and admin complete one ticket journey @smoke @integration', async ({
  page,
  loginAs,
  apiAs,
  uniqueId,
}) => {
  const title = `跨角色工单 ${uniqueId()}`;
  const adminApi = await apiAs('admin');

  try {
    await test.step('成员创建工单并补充评论', async () => {
      await loginAs(page, 'alice');
      await page.getByRole('button', { name: '新建工单' }).click();
      const createDialog = page.getByRole('dialog', { name: '新建工单' });
      await createDialog.getByLabel('标题').fill(title);
      await createDialog.getByLabel('描述').fill('跨角色验证完整处理流程。');
      await createDialog.getByRole('button', { name: '创建工单' }).click();
      await expect(page.getByText('工单已创建')).toBeVisible();
      await page.getByLabel('搜索工单').fill(title);
      await page.getByRole('button', { name: `查看 ${title}` }).click();
      await page.getByLabel('添加评论').fill('成员已补充复现步骤。');
      await page.getByRole('button', { name: '提交评论' }).click();
      await expect(page.getByText('成员已补充复现步骤。')).toBeVisible();
      await page.getByRole('button', { name: 'Close' }).click();
      await page.getByRole('button', { name: '退出' }).click();
    });

    await test.step('管理员分配并关闭同一工单', async () => {
      await loginAs(page, 'admin');
      await page.getByLabel('搜索工单').fill(title);
      await page.getByRole('button', { name: `查看 ${title}` }).click();
      const dialog = page.getByRole('dialog').filter({ hasText: title });
      await expect(dialog.getByText('成员已补充复现步骤。')).toBeVisible();
      await dialog.getByRole('button', { name: '编辑工单' }).click();
      await dialog.getByLabel('负责人').click();
      await page.getByRole('option', { name: 'alice' }).click();
      await dialog.getByRole('button', { name: '保存修改' }).click();
      await expect(dialog.getByText('负责人：alice')).toBeVisible();
      for (const status of ['处理中', '已解决', '已关闭']) {
        await dialog.getByRole('button', { name: status }).click();
        await expect(dialog.getByText(status, { exact: true })).toBeVisible();
      }
    });
  } finally {
    // 即使 UI 流程中断，也只清理标题完全匹配的测试工单。
    const response = await adminApi.get(
      `/api/tickets?q=${encodeURIComponent(title)}&pageSize=50`,
    );
    const list = await response.json();
    for (const ticket of list.items.filter(
      (item: { title: string }) => item.title === title,
    )) {
      await adminApi.delete(`/api/tickets/${ticket.id}`);
    }
  }
});
