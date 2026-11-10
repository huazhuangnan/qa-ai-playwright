import { test, expect } from '@playwright/test';

// 本地页面只验证浏览器可用，不代表业务验收。
test('@smoke 本地页面验证浏览器安装（非业务验收）', async ({ page }) => {
  await test.step('打开本地测试页面', async () => {
    await page.setContent('<button type="button">Ready</button>');
  });
  await test.step('确认测试元素可见', async () => {
    await expect(
      page.getByRole('button', { name: 'Ready', exact: true }),
    ).toBeVisible();
  });
});
