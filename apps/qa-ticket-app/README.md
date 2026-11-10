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

本目录只放示例应用。
TypeScript QA 位于 [`qa-ticket-app-suite-typescript`](../qa-ticket-app-suite-typescript/README.md)。
Python QA 位于 [`qa-ticket-app-suite-python`](../qa-ticket-app-suite-python/README.md)。

应用架构见[架构](docs/architecture.md)。

## 本地运行

在仓库根目录安装锁定依赖：

```powershell
pnpm install --frozen-lockfile
```

进入 `apps/qa-ticket-app/`，初始化示例数据并启动服务：

```powershell
bun run db:seed
bun run dev
```

页面：<http://127.0.0.1:5173>

本地演示账号见[架构说明](docs/architecture.md#手动运行)。

API 契约：<http://127.0.0.1:8787/openapi.json>

只读 API 文档：<http://127.0.0.1:8787/api-docs>

本地契约文件为 `src/server/openapi.json`。页面从该接口读取同一份契约。
它展示路径、请求和响应说明，不提供在线写入操作。
当前重点描述创建工单请求和关键响应字段。其余响应的字段结构需要进一步补充。
契约变更时同步检查实际接口和 QA 用例。

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
