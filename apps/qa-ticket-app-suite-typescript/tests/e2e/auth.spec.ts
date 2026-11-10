import { expect, test } from '../fixtures/app.ts';

// 成员登录后刷新仍保持会话，退出后回到登录页。
test('member can log in, refresh the session, and log out @smoke', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('用户名').fill('alice');
  await page.getByLabel('密码').fill('demo1234');
  await page.getByRole('button', { name: '登录' }).click();

  await expect(
    page.getByRole('heading', { name: '工单工作台' }),
  ).toBeVisible();
  await expect(page.getByText('alice', { exact: true })).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('heading', { name: '工单工作台' }),
  ).toBeVisible();

  await page.getByRole('button', { name: '退出' }).click();
  await expect(page.getByRole('button', { name: '登录' })).toBeVisible();
});

// 错误凭证显示错误，用户仍可重新提交。
test('invalid credentials show a recoverable error @regression', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('用户名').fill('alice');
  await page.getByLabel('密码').fill('wrong-password');
  await page.getByRole('button', { name: '登录' }).click();

  await expect(page.getByText('用户名或密码错误')).toBeVisible();
  await expect(page.getByRole('button', { name: '登录' })).toBeEnabled();
});
