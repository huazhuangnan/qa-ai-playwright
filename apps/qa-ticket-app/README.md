# QA Ticket App

一个用于验证完整 QA 流程的全栈示例。

技术栈：

- Hono
- Drizzle ORM
- SQLite
- React
- Vite
- shadcn/ui
- Playwright

## 目录边界

本目录只放示例应用。QA 项目分别维护：

- [TypeScript QA](../qa-ticket-app-suite-typescript/README.md)
- [Python QA](../qa-ticket-app-suite-python/README.md)

应用架构见[架构](docs/architecture.md)。

## 本地运行

在仓库根目录安装锁定依赖：

```powershell
pnpm install --frozen-lockfile
```

进入 `apps/qa-ticket-app/`，直接启动开发服务：

```powershell
bun run dev
```

`dev` 会先自动执行 seed，再启动 API 和页面服务。

如果只启动 API 或使用其他命令，先执行 `bun run db:seed`。

页面：<http://127.0.0.1:5173>

本地演示账号见[架构说明](docs/architecture.md#手动运行)。

API 契约：<http://127.0.0.1:8787/openapi.json>

只读 API 文档：<http://127.0.0.1:8787/api-docs>

本地契约文件为 `src/server/openapi.json`。文档页面读取同一份契约。

- 页面展示路径、请求和响应说明，不提供在线写入操作。
- 契约重点描述创建工单请求和关键响应字段。其余响应字段仍需补充。
- 契约变更时，同步检查实际接口和 QA 用例。

## 应用检查

在 `apps/qa-ticket-app/` 执行：

```powershell
bun run typecheck
bun run build
```

## 交互模式

| 场景 | 模式 |
| --- | --- |
| 新需求验收 | QA 目录交互式探索和补用例 |
| 稳定 smoke | QA 目录自动执行 |
| 完整回归 | CI 自动执行 |

只在范围、写权限和业务预期不明确时暂停确认。
