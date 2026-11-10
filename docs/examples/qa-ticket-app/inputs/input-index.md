# 输入索引

| 项目 | 位置 |
| --- | --- |
| 产品需求 | `requirements.md` |
| 交互任务 | `../tasks/interactive-demo.md` |
| API 与数据结构 | `../../../../apps/qa-ticket-app/docs/architecture.md` |
| OpenAPI 链接 | `http://127.0.0.1:8787/openapi.json` |
| OpenAPI 本地文件 | `../../../../apps/qa-ticket-app/src/server/openapi.json` |
| API 文档页面 | `http://127.0.0.1:8787/api-docs` |
| 测试账号 | 本地 seed，见示例应用架构 |
| 页面入口 | `http://127.0.0.1:5173` |
| API 入口 | `http://127.0.0.1:8787` |
| 数据库 | 每次测试运行使用 `.tmp/e2e.db`，启动时重建 |

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `PORT` | API 端口，默认 8787 |
| `DATABASE_URL` | SQLite 文件路径 |
| `NODE_ENV` | 运行环境 |
| `QA_ENV` | 选择测试配置文件 |
| `UI_BASE_URL` | Playwright 页面地址，仅允许 `http://127.0.0.1:5173` |
| `API_BASE_URL` | API 地址，仅允许 `http://127.0.0.1:8787` |
| `BASE_URL` | API 地址的兼容回退，仅允许 `http://127.0.0.1:8787` |
