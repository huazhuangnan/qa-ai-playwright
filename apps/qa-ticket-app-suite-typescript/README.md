# QA Ticket App TypeScript 测试项目

本目录使用 Playwright Test 验证独立示例应用。
被测项目位于 [`qa-ticket-app`](../qa-ticket-app/README.md)。
同一业务需求的 Python 实现在 [`qa-ticket-app-suite-python`](../qa-ticket-app-suite-python/README.md)。

## 文档

共享资料位于 `../qa-ticket-app/docs/qa/`。本项目的任务和历史报告位于 `docs/qa/`：

1. [需求输入](../qa-ticket-app/docs/qa/inputs/requirements.md)
2. [交互任务](docs/qa/tasks/interactive-demo.md)
3. [测试计划](../qa-ticket-app/docs/qa/generated/test-plan.md)
4. [测试用例](../qa-ticket-app/docs/qa/generated/test-cases.md)及[自动化映射](docs/qa/generated/test-mapping.md)
5. [执行报告](docs/qa/generated/execution-report.md)
6. [缺陷报告](docs/qa/generated/defect.md)

## 执行

在仓库根目录安装依赖和 Chromium：

```powershell
pnpm install --frozen-lockfile
pnpm --filter qa-ticket-app-suite-typescript exec playwright install chromium
```

进入 `apps/qa-ticket-app-suite-typescript/` 执行：

```powershell
bun run typecheck
pnpm run test:api
pnpm run test:smoke
pnpm run test:e2e
pnpm run test:security
pnpm run test:a11y
pnpm run test:mobile
```

测试配置会自动启动示例应用。
每次测试运行共用一个临时 SQLite 数据库，启动时重建。
示例套件仅允许默认的本地页面和 API 地址。不得指向其他服务。
运行 `pnpm run report` 查看 HTML 报告。JUnit 结果位于 `reports/junit.xml`。

## OpenAPI 输入与测试

服务启动后，可提供文档页 `http://127.0.0.1:8787/api-docs` 或契约链接 `http://127.0.0.1:8787/openapi.json`。
离线输入使用 `../qa-ticket-app/src/server/openapi.json`。
向 AI 提供输入索引和任务目标，让它读取契约与需求，列出接口、预期和待确认项，再设计测试。
契约页面只展示文档，测试不会因导入而自动生成。

在本目录运行：

```powershell
pnpm exec playwright test tests/api/openapi.spec.ts --project=chromium
```

该用例比较链接与本地文件，检查页面展示，并验证匿名拒绝和创建工单。
终端列出用例结果，`playwright-report/` 保存 HTML 报告。
失败时按配置保留 Trace、截图或视频；分享前应脱敏。
命令输出取决于实际执行，不把未执行记为通过。
仓库中的执行报告记录先前执行，不能作为当前代码的执行结果。

## 边界

- 测试通过 HTTP 和浏览器访问应用。
- 不导入服务端实现。
- 测试数据和会话按用例隔离。
- 临时数据库、报告和 Trace 不提交。
