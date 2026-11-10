import { expect, test } from '../fixtures/app.ts';

// 移动视口中，成员可以进入新建工单表单。
test('mobile user can log in and open the create dialog @smoke', async ({
  page,
  loginAs,
}) => {
  await loginAs(page, 'alice');
  await expect(
    page.getByRole('heading', { name: '工单工作台' }),
  ).toBeVisible();

  await page.getByRole('button', { name: '新建工单' }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: '新建工单' }),
  ).toBeVisible();
  await expect(page.getByLabel('标题')).toBeVisible();
  await expect(page.getByLabel('描述')).toBeVisible();
});
