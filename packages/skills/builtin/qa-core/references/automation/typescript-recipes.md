# TypeScript QA 操作卡

在项目目录、已激活本地环境后执行。文件名用真实目标替换；不要直接运行未安装的浏览器项目。
本地配置放 `.env`；系统和 CI 中的同名变量优先。

```bash
pnpm install --frozen-lockfile
pnpm exec playwright test tests/e2e/browser.spec.ts --project=chromium
pnpm exec playwright test tests/api --project=chromium
pnpm exec playwright test --grep @smoke
pnpm exec playwright test --grep @regression
pnpm exec playwright test tests/e2e/browser.spec.ts --project=chromium --workers=1
pnpm exec playwright show-report
pnpm exec playwright show-trace test-results/实际目录/trace.zip
bun run typecheck
```

pnpm 管理依赖。
Bun 执行项目脚本。
Playwright 使用 Node.js 运行。

怀疑并行污染时比较单 worker 与默认配置；复现偶现失败可对目标用例少量重复，次数根据成本决定。单 worker 通过只提供线索，不证明修好了。重试后通过仍记录 flaky。

常见判断：连接拒绝先查服务与地址；locator 多匹配先限制范围；点击后无结果查用户可见状态及请求证据；并行时冲突检查账号/唯一数据；只在 CI 失败比较浏览器、依赖、时区和资源。
API 门禁设置 `REQUIRE_API_TESTS=1` 后，缺少 `API_BASE_URL` 必须失败。
创建或修改数据的测试使用 `uniqueId`、`cleanup` 和 `requireWriteAccess` fixtures。

稳定断言示例：

```typescript
await page.getByRole('button', { name: '保存', exact: true }).click();
await expect(page.getByRole('status')).toHaveText('保存成功');
```

“保存成功”必须来自业务需求；不要照抄到不匹配的系统。不要只断言按钮被点击或响应 200。

复杂流程按业务动作分组，步骤名描述用户能观察到的结果：

```typescript
await test.step('提交合法表单并看到保存结果', async () => {
  await page.getByLabel('名称').fill('测试数据');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('保存成功');
});
```

单个断言不需要包装 step。失败时的数据清理放在 `finally` 或 fixture teardown。

来源：

- [Playwright 实践](https://playwright.dev/docs/best-practices)
- [自动等待](https://playwright.dev/docs/actionability)
- [隔离](https://playwright.dev/docs/browser-contexts)
- [认证](https://playwright.dev/docs/auth)
