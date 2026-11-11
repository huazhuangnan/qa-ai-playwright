# QA + AI + Playwright

用一套本地 CLI 准备测试环境、生成项目、运行 API 与浏览器测试，并通过 Codex Skills、MCP 和桌面辅助工具维护。

**使用人员** | [维护人员](docs/maintenance.zh-CN.md)

## 快速开始

Windows 优先使用 PowerShell 7；未安装时自动降级到 Windows PowerShell 5.1。

```powershell
.\packages\qa-ai-playwright\src\bin\qa.cmd env init typescript
.\packages\qa-ai-playwright\src\bin\qa.cmd project init my-qa --language typescript
```

macOS / Linux / WSL：

```bash
bash packages/qa-ai-playwright/src/bin/qa.sh env init typescript
bash packages/qa-ai-playwright/src/bin/qa.sh project init my-qa --language typescript
```

首次运行需联网；CLI 会在隔离环境中安装 Python 和 Node。

环境位于当前目录 `.qa-env`。测试项目必须放在环境目录之外。
完整参数和目录说明见[环境初始化](docs/environment.zh-CN.md)。
想先看完整例子，可直接阅读[工单示例：从需求到执行](docs/qa-workflow.zh-CN.md#工单示例)。

完整流程：

| 步骤 | 操作 | 入口 |
| --- | --- | --- |
| 1 | 准备环境 | `qa.cmd env init <语言>` |
| 2 | 生成项目 | `qa.cmd project init <项目目录> --language <语言>` |
| 3 | 配置测试环境 | 复制 `.env*.example`；`QA_ENV` 选择配置，业务变量按项目契约补充 |
| 4 | 接入测试 | 修改项目 `tests/` 与 `docs/qa/` |
| 5 | 执行测试 | 按所选语言运行 |
| 6 | 查看报告 | 打开 `reports/`、`test-results/` 或语言报告 |

JavaScript/TypeScript 依赖使用 pnpm。
仓库 TypeScript 脚本使用 Bun。
TypeScript Playwright 与原生 SQLite 使用 Node.js。
Python 示例使用 `requirements.lock` 和 Playwright Python。

仓库是 pnpm monorepo：

- `packages/qa-ai-playwright/`：CLI、自有 Skills 和项目模板。
- `apps/qa-ticket-app/`：全栈示例应用。
- `apps/qa-ticket-app-suite-typescript/`：TypeScript QA 项目。
- `apps/qa-ticket-app-suite-python/`：Python QA 项目。

`QA_ENV` 选择环境。
`UI_BASE_URL` 和 `API_BASE_URL` 分别配置页面和接口入口。
`BASE_URL` 只作兼容回退。
认证、角色、租户、资源、测试数据、清理和功能开关等变量按实际项目添加。
浏览器多角色登录态使用官方 `storageState` 方案，状态文件不提交。
变量名登记在生成项目的 `docs/qa/inputs/input-index.md`。

## 选择语言

按已有用例、维护语言和团队工具选择一种即可。

| 方案 | 适用情况 | 文档 |
| --- | --- | --- |
| TypeScript | 使用 Playwright Test 维护 API、功能和 E2E | [TypeScript 指南](docs/typescript.zh-CN.md) |
| Python | 复用 pytest，使用 requests 与 pytest-playwright | [Python 指南](docs/python.zh-CN.md) |

两种语言也可以使用 `env init both` 同时安装。

## 安装范围

默认只写隔离的 `environment` 作用域。
MCP 配置写入 `<root>/codex/config.toml`。

环境 CLI 默认安装 Playwright CLI 和 Playwright MCP。
`env init <语言> --full` 只在需要 Agent Browser CLI 或 MCP 时使用。
QA、Bun、pnpm 和其他 Skill 由 AI 按任务检查。缺失时安装到业务项目，不写全局配置。
不熟悉业务时使用 `$qa-business-guide` 获取步骤、边界和下一步。
所有语言方案都会安装 CC Switch。可用 `qa.cmd run cc-switch` 启动。
CC Switch 程序位于环境目录，运行后的用户数据仍按上游设计写入 `~/.cc-switch`。
来源分类、项目级与全局级边界见 [Skills 与 MCP](docs/skills-mcp.zh-CN.md)。

## 文档

- [环境初始化](docs/environment.zh-CN.md)：系统要求、参数、目录和卸载
- [TypeScript 指南](docs/typescript.zh-CN.md)：快速开始、测试和报告
- [Python 指南](docs/python.zh-CN.md)：快速开始、测试和报告
- [Skills 与 MCP](docs/skills-mcp.zh-CN.md)：组件、来源和作用域
- [AI 文档与上下文](docs/ai-docs.zh-CN.md)：链接资料、静态导出和上下文控制
- [从需求到执行](docs/qa-workflow.zh-CN.md)：输入、调用、执行和证据
- [参考来源](docs/references.zh-CN.md)：官方文档和许可证
- [版本记录](docs/version-history.zh-CN.md)：组件、验证范围与迁移变化
- [维护指南](docs/maintenance.zh-CN.md)：实现、版本、发布、CI 矩阵与验证缓存
- [全栈示例](apps/qa-ticket-app/README.md)：Hono、Drizzle、SQLite、React 和 shadcn/ui
- [示例 QA 文档](docs/examples/qa-ticket-app/inputs/input-index.md)：共享需求、契约、计划和报告
- [TypeScript 示例 QA](apps/qa-ticket-app-suite-typescript/README.md)：Playwright Test、fixtures 和 E2E
- [Python 示例 QA](apps/qa-ticket-app-suite-python/README.md)：pytest、requests 和 pytest-playwright
