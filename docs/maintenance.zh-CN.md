# QA + AI + Playwright 维护指南

[使用人员](../README.md) | **维护人员**

本页面向仓库维护者。
内容包括架构、不可变约束、发布门禁和回滚流程。
日常操作见[环境初始化](environment.zh-CN.md)。

## 架构

```text
qa.cmd / qa.sh
      │
      ▼
packages/qa-ai-playwright/src/qa-cli.ts
      │
      ├── packages/qa-ai-playwright/src/cli/environment.ts  → 运行时、Skills、MCP
      ├── packages/qa-ai-playwright/src/cli/project.ts      → 项目生成、测试、卸载
      └── packages/qa-ai-playwright/src/cli/shared.ts       → 配置、哈希、路径和锁记录
      │
      ├── qa-docs                 → 按需使用的链接资料与静态导出
      ├── packages/qa-ai-playwright/src/skills/             → 来源包
      ├── packages/qa-ai-playwright/src/apps/               → 官方桌面应用清单
      ├── packages/qa-ai-playwright/src/templates/          → 项目模板
      └── .github/workflows/      → 验收矩阵
```

平台入口只负责引导和参数转发。
业务逻辑集中到 `packages/qa-ai-playwright/src/cli/`。
不要把安装、配置或删除逻辑复制到启动器。
项目对外名称统一为 `QA + AI + Playwright`。
交付包名为 `qa-ai-playwright`。根维护包名为 `qa-ai-playwright-workspace`。

仓库使用 pnpm workspace。根锁文件管理维护工具、交付包和示例工作区。

| 目录 | 职责 |
| --- | --- |
| `packages/qa-ai-playwright/src/` | CLI、自有 Skill 和生成模板 |
| `docs/`、`tests/` | 公共指南与仓库维护测试 |
| `apps/qa-ticket-app/` | 被测示例应用 |
| `apps/qa-ticket-app-suite-typescript/` | TypeScript QA 与执行配置 |
| `apps/qa-ticket-app-suite-python/` | Python QA 与独立执行代码 |
| `docs/examples/qa-ticket-app/` | 两套 QA 共享的需求、OpenAPI 索引、计划和报告 |

示例应用和 QA 项目独立维护。测试只通过 HTTP 和浏览器访问应用。
CLI 中的 `REPO` 和 `QA_REPO` 指向交付包根目录。安装记录中的源码路径相对该目录。

旧路径 `src/bin/` 已迁移到 `packages/qa-ai-playwright/src/bin/`。
已有环境应使用新入口重新执行 `env init`，以刷新激活脚本中的 `QA_REPO`。
重跑会保留已有 Skill 和项目文件。旧的环境与项目数据不会自动搬迁。

## 维护语言

- 仓库自身的 CLI、工具和测试统一使用 TypeScript。
- 根目录的 `package.json`、`pnpm-lock.yaml` 和 `tsconfig.json` 是维护工具链入口。
- 项目依赖统一使用 pnpm。
- 脚本统一使用 Bun 执行。
- 维护测试使用 Bun test。
- TypeScript 代码使用 TSDoc，并接受 `tsc --noEmit` 检查。
- Python 只用于 Python 项目模板和系统能力要求的场景。
- 启动器只使用 PowerShell 或 Bash 完成运行时引导。
- Codex 已有的网页搜索、浏览器、文件读取、上下文压缩和文档生成能力不在仓库内重写。

维护检查命令：

```powershell
pnpm install --frozen-lockfile
bun run typecheck
bun run test:unit
```

`bun run test:ci env` 可执行环境集成套件。
完整套件仍由 GitHub Actions 运行。

## 来源边界

Skill：

- `packages/qa-ai-playwright/src/skills/builtin/`：仓库自己创建和维护。
- 外部 Skill 不随仓库交付。AI 按任务使用上游安装命令。

MCP：

- `packages/qa-ai-playwright/src/mcp/builtin/`：自建 server 清单。
- `packages/qa-ai-playwright/src/mcp/external/`：下载 server 清单。

官方或社区只是外部组件的来源属性，不增加目录层级。
自有 Skill 从本仓库按任务安装到项目。外部 Skill 从固定上游按需安装。

`qa-docs` 只定义调用顺序和归档约定。
实际抓取、网页搜索、浏览器快照、上下文压缩和静态渲染使用 Codex 当前能力。

## 作用域

| scope | Skill | MCP | 本仓库行为 |
| --- | --- | --- | --- |
| `global` | 用户 Skill 目录 | 用户 Codex 配置 | 不写 |
| `project` | 项目 `.agents/skills/` | 项目自己的 Codex 配置 | AI 按需安装 Skill |
| `environment` | 旧环境 `<root>/codex/skills/` | `<root>/codex/config.toml` | 保留旧 Skill，管理 MCP |

环境 CLI 默认只写 `environment`。AI 按需安装 QA 与外部 Skill 到项目。
锁文件必须记录 `scope`、`source_type`、来源路径和实际版本。
不要把环境级组件升级成全局组件。

## 不可变约束

- 项目目录必须与环境目录分离。
- 已有项目文件使用 `KEEP`，禁止静默覆盖。
- 写入操作必须有清理路径。
- 卸载只能删除所有权记录内且未被用户修改的内容。
- 外部 Skill 必须固定上游提交或版本。
- MCP 必须固定包版本，并写入局部 `CODEX_HOME`。
- 外部桌面应用必须记录版本、提交、许可证、官方资产和 SHA256。
- 所有缓存、socket、输出和凭证保存在环境或项目边界内。
- `QA_ENV` 选择环境。
- `UI_BASE_URL` 和 `API_BASE_URL` 分离页面与接口入口。
- `BASE_URL` 只作兼容回退。
- 项目变量名登记到 `docs/qa/inputs/input-index.md`。
- 外部资料精简副本放 `docs/qa/inputs/external/`。
- 外部资料记录来源、抓取时间、版本或哈希、敏感级别和使用范围。
- 静态导出放 `docs/qa/generated/`，Markdown 或输入资料仍是源。
- 生成项目只复制可执行或可填写的模板，不复制目录介绍 README。
- Windows 优先 PowerShell 7，随后降级到 Windows PowerShell 5.1。
- 安装和测试验证以 GitHub Actions 结果为准。

## 状态与所有权

| 文件 | 所有权 | 关键字段 |
| --- | --- | --- |
| `<root>/state.json` | CLI | 运行时版本、组件、policy |
| `<root>/codex/skills.lock.json` | 旧环境 | 已安装 Skill 的来源、scope、版本和文件 SHA256 |
| `<root>/codex/mcp.lock.json` | CLI | MCP 清单、来源、scope、版本 |
| `<root>/codex/config.toml` | CLI | 局部 Codex 与 MCP 配置 |
| `<project>/.qa-project.json` | CLI | 项目所有权、模板版本、文件校验值 |
| `<project>/pnpm-lock.yaml` | 项目 | Node 依赖锁 |
| `<project>/requirements.lock` | 项目 | 跨平台解析的 Python 哈希依赖锁 |

修改锁文件格式时，必须提供迁移策略和回滚策略。
旧环境的 Skill 文件和锁记录保留。环境检查不要求 Skill。
回滚前备份环境目录及业务项目的 Skill 安装记录。

## 配置与版本

默认运行时版本统一位于 [runtime-versions.env](../packages/qa-ai-playwright/src/runtime-versions.env)。
`uv` 使用固定版本，避免安装结果漂移。
`env check` 同时校验 uv 版本；不一致时重新执行 `env init`。
Bun 和 pnpm 使用固定版本。
`env init` 在 Node 安装完成后安装这两个工具。

版本变更必须同步：

- CLI 默认值。
- 外部 Skill 的来源、版本和安装方式。
- CLI/MCP 运行依赖。
- Skill、MCP 和模板锁文件断言。
- 用户文档中的可见版本。
- QA 模板变量清单和语言模板 `.env` 示例。

Skill 使用 SemVer。
首次提交前，仓库自有项目、Skill 和模板版本固定为 `0.0.1`。
此阶段修改规则或资源时不递增版本。
外部组件继续保留真实上游版本。
首次提交后，用户 Skill 修改规则或随包资源时按 SemVer 提升版本。
已安装目录保留本地修改，不因源版本变化被覆盖。

## 测试矩阵

| Workflow | 覆盖内容 |
| --- | --- |
| [env-ci](../.github/workflows/env-ci.yml) | Actions lint、冷启动、版本组合、PowerShell 7/5.1、类型检查、CLI、MCP 和 CC Switch |
| [project-ci](../.github/workflows/project-ci.yml) | 两套模板、TypeScript/Python 完整示例、项目生成、浏览器和类型检查 |
| [uninstall-ci](../.github/workflows/uninstall-ci.yml) | 所有权、路径边界、清理和卸载保留 |

Windows 主路径使用 PowerShell 7。
独立任务通过 `QA_POWERSHELL=powershell.exe` 验证 5.1 降级。
CI runner 固定为 `ubuntu-24.04`、`windows-2025` 和 `macos-15-intel`。
不使用 `*-latest` 标签，避免系统迁移和 macOS ARM 排队改变验证环境。
最小 Linux 容器同样固定为 `ubuntu:24.04`。
生成项目 CI 在 PR 使用快速矩阵，完整矩阵放在夜间或手动任务。
测试或运行器失败时，不得只增加重试或跳过门禁。

## 变更门禁

| 变更 | 最低验证 |
| --- | --- |
| 文档 | 相对链接、命令目录、锚点和范围描述 |
| builtin Skill | frontmatter、版本、引用、锁文件、行为场景 |
| 链接资料与 qa-docs | 来源、相关性、归档字段、上下文读取顺序和静态输出路径 |
| external Skill | 上游来源、固定版本、安装范围、重复执行及失败行为 |
| external App | 上游提交、许可证、官方资产、平台映射和 SHA256 |
| MCP 清单 | 版本一致性、局部配置、`initialize`、`tools/list` |
| 项目模板 | 生成、重跑、依赖锁、测试、卸载 |
| CLI / 启动器 | PowerShell 7/5.1、Bash、路径边界、退出码 |
| CI | 权限、超时、并发、失败证据和清理 |

提交前检查完整 diff。
不要在提交信息或 CI 中放入真实凭证。

## 发布与回滚

1. 更新源码、固定版本和迁移说明。
2. 运行受影响 Actions，保留日志和失败证据。
3. 在干净 `--root` 中验证升级和重复执行。
4. 发布自有 Skill、模板和锁文件，不只发布单个 `SKILL.md`。
5. 回滚时恢复完整目录和清单，再重新执行验收。

已有环境升级前备份整个 `CODEX_HOME` 和项目所有权文件。
禁止通过删除整个项目来替代模板迁移。

## 故障定位顺序

1. 检查 `state.json` 和对应 lock 文件。
2. 执行 `env check` 并确认 `missing`。
3. 检查 `CODEX_HOME` 和 `config.toml` 是否在正确环境。
4. 运行目标 CLI 的 `--version` 或 `--help`。
5. 对 MCP 执行协议握手。
6. 运行目标项目的测试并保留 Trace、JUnit 和截图。

详细版本和迁移历史见[版本记录](version-history.zh-CN.md)。
框架来源与许可证见[参考来源](references.zh-CN.md)。
