# QA + AI + Playwright

帮助使用 Codex 完成 QA 任务。CLI 用于准备环境和项目，Skills 与 MCP 协助测试设计、执行和结果分析。

**使用人员** | [维护人员](docs/maintenance.zh-CN.md)

## 快速开始

### 下载交付包

1. 打开 [GitHub Releases](https://github.com/huazhuangnan/qa-ai-playwright/releases)。如需权限，请联系仓库维护人员。
2. 选择已发布的版本。在 Assets 中下载 `qa-ai-playwright-v版本号.zip`。
   该包面向使用者，包含运行 QA CLI 所需的文件。
3. 解压 ZIP，进入其中的 `qa-ai-playwright-版本号` 目录。以下命令均在该目录执行。

Windows、macOS 和 Linux 使用同一个使用者 ZIP。如果没有可下载的 Release，请向维护人员获取交付包。

Release 的 Assets 中还会显示 GitHub 自动生成的 `Source code (zip)` 和
`Source code (tar.gz)`。开发和维护时使用这两个源码快照。它们不是 QA 用户交付包，
也没有纳入 `SHA256SUMS.txt`。

### 初始化环境和项目

使用顺序：准备环境和项目，向 Codex 提供任务资料，再执行测试并查看结果。

Windows 优先使用 PowerShell 7；未安装时自动降级到 Windows PowerShell 5.1。

```powershell
.\packages\qa-cli\bin\qa.cmd env init typescript
.\packages\qa-cli\bin\qa.cmd project init my-qa --language typescript
```

macOS / Linux / WSL：

```bash
bash packages/qa-cli/bin/qa.sh env init typescript
bash packages/qa-cli/bin/qa.sh project init my-qa --language typescript
```

首次运行可能需要联网。CLI 优先复用系统工具，缺少时提示安装。

环境默认位于当前目录的 `.qa-env`，测试项目须放在环境目录之外。

参数和目录说明见[环境初始化](docs/environment.zh-CN.md)。

配置测试环境、角色、数据和清理方式后，按[从需求到执行](docs/qa-workflow.zh-CN.md#在-codex-中执行一条完整任务)开展测试。

报告位置见语言指南。完整示例见[工单示例](docs/qa-workflow.zh-CN.md#工单示例)。

运行时和依赖：

- JavaScript/TypeScript 依赖使用 pnpm，仓库 TypeScript 脚本使用 Bun。
- TypeScript Playwright 与原生 SQLite 使用 Node.js。
- Python 示例使用 `requirements.lock` 和 Playwright Python。

仓库是 pnpm monorepo：

- `packages/`：按 CLI、MCP、Skills、模板和应用资产划分的项目能力。
- `apps/qa-ticket-app/`：全栈示例应用。
- `apps/qa-ticket-app-suite-typescript/`：TypeScript QA 项目。
- `apps/qa-ticket-app-suite-python/`：Python QA 项目。

项目配置要点：

- `QA_ENV` 选择环境。
- `UI_BASE_URL` 和 `API_BASE_URL` 分别配置页面和接口入口。`BASE_URL` 仅作兼容回退。
- 认证、角色、租户、数据和清理等变量按项目需要添加，并登记在 `docs/qa/inputs/input-index.md`。
- 多角色浏览器登录态使用 `storageState`。状态文件不提交。

## 选择语言

按已有用例、维护语言和团队工具选择一种即可。

| 方案 | 适用情况 | 文档 |
| --- | --- | --- |
| TypeScript | 使用 Playwright Test 维护 API、功能和 E2E | [TypeScript 指南](docs/typescript.zh-CN.md) |
| Python | 复用 pytest，使用 requests 与 pytest-playwright | [Python 指南](docs/python.zh-CN.md) |

两种语言也可以使用 `env init both` 同时安装。

## 安装范围

工具优先复用系统或用户级安装。QA 环境保存运行状态和缓存。
MCP 注册写入用户级 `CODEX_HOME`，各 QA 环境使用独立的注册名称。

环境 CLI 默认安装 Playwright CLI，并注册 QA MCP 和 Playwright MCP。
`env init <语言> --full` 只在需要 Agent Browser CLI 或 MCP 时使用。

- **浏览器**：优先复用已有兼容浏览器。确认缺失后才下载。用户指定浏览器时按其选择处理。
- **Skill**：AI 按任务检查 QA、Bun、pnpm 等 Skill。缺失时安装到业务项目。不熟悉业务时可使用 `$qa-business-guide`。
- **CC Switch**：需要时添加 `--with-cc-switch`。已有时复用，缺失时安装到用户级共享目录。用户数据写入 `~/.cc-switch`。
- **管理命令**：环境、项目、可选 MCP 和项目内置 Skill 提供检查或修复命令。`update check` 只检查来源更新。

详细范围见[环境初始化](docs/environment.zh-CN.md)和 [Skills 与 MCP](docs/skills-mcp.zh-CN.md)。

## 文档

文档按三类阅读：

- 最终使用人员看环境、语言和工作流页面。
- 业务项目 QA 开发与维护人员看架构和语言规范。
- 仓库维护人员看版本、发布和维护页面。

- [环境初始化](docs/environment.zh-CN.md)：系统要求、参数、目录和卸载
- [TypeScript 指南](docs/typescript.zh-CN.md)：快速开始、测试和报告
- [Python 指南](docs/python.zh-CN.md)：快速开始、测试和报告
- [代码风格与架构规范](docs/code-style-architecture.zh-CN.md)：跨语言边界、分层和语言差异
- [Skills 与 MCP](docs/skills-mcp.zh-CN.md)：组件、来源和作用域
- [AI 文档与上下文](docs/ai-docs.zh-CN.md)：链接资料、静态导出和上下文控制
- [AI 测试整体模型](docs/ai-testing-model.zh-CN.md)：整体概念、主流程、Skill 路由、测试层级和证据闭环
- [从需求到执行](docs/qa-workflow.zh-CN.md)：输入、调用、执行和证据
- [参考来源](docs/references.zh-CN.md)：官方文档和许可证
- [版本记录](docs/version-history.zh-CN.md)：组件、验证范围与迁移变化
- [Release 发布指南](docs/release.zh-CN.md)：版本说明、资产和发布前检查
- [全栈示例](apps/qa-ticket-app/README.md)：Hono、Drizzle、SQLite、React 和 shadcn/ui
- [示例 QA 文档](apps/qa-ticket-app/docs/qa/inputs/input-index.md)：共享需求、契约与测试设计
- [TypeScript 示例 QA](apps/qa-ticket-app-suite-typescript/README.md)：Playwright Test、fixtures 和 E2E
- [Python 示例 QA](apps/qa-ticket-app-suite-python/README.md)：pytest、requests 和 pytest-playwright
