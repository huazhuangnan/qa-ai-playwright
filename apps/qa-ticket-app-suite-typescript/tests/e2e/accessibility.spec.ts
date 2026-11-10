import AxeBuilder from '@axe-core/playwright';

import { expect, test } from '../fixtures/app.ts';

// 对登录页和工作台执行指定规则的自动扫描，不代表完整无障碍验收。
test('login and dashboard have no serious accessibility violations @a11y', async ({
  page,
  loginAs,
}) => {
  await page.goto('/');
  const loginResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    loginResults.violations.filter(
      (violation) =>
        violation.impact === 'serious' || violation.impact === 'critical',
    ),
  ).toEqual([]);

  await loginAs(page, 'alice');
  const dashboardResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    dashboardResults.violations.filter(
      (violation) =>
        violation.impact === 'serious' || violation.impact === 'critical',
    ),
  ).toEqual([]);
});
