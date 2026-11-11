# QA + AI + Playwright 维护指南

[使用人员](../README.md) | **维护人员**

本页面向仓库维护者。
内容包括架构、不可变约束、发布门禁和回滚流程。
日常操作见[环境初始化](environment.zh-CN.md)。
组件管理基线和实施清单见[QA CLI 管理能力 TODO](qa-cli-management-todo.zh-CN.md)。

## 架构

```text
qa.cmd / qa.sh
      │
      ▼
packages/qa-cli/qa-cli.ts
      │
      ├── packages/qa-cli/cli/environment.ts  → 运行时、Skills、MCP
      ├── packages/qa-cli/cli/project.ts      → 项目生成、测试、卸载
      └── packages/qa-cli/cli/shared.ts       → 配置、哈希、路径和锁记录
      │
      ├── qa-docs                 → 按需使用的链接资料与静态导出
      ├── packages/skills/             → 来源包
      ├── packages/apps/               → 官方桌面应用清单
      ├── packages/templates/          → 项目模板
      └── .github/workflows/      → 验收矩阵
```

平台入口只负责引导和参数转发。
业务逻辑集中到 `packages/qa-cli/cli/`。
不要把安装、配置或删除逻辑复制到启动器。
项目对外名称统一为 `QA + AI + Playwright`。
仓库根包名为 qa-ai-playwright。
Codex CLI 的 npm 来源保存在 `packages/apps/codex/manifest.json`。优先复用已安装的 CLI。缺失时使用清单指定的包安装，并记录实际版本。Codex 桌面应用不由该清单安装。

仓库根目录使用 pnpm workspace 管理示例工作区。根锁文件管理维护工具和示例工作区。

| 目录 | 职责 |
| --- | --- |
| `packages/` | CLI、自有 Skill 和生成模板 |
| `docs/`、`tests/` | 公共指南与仓库维护测试 |
| `apps/qa-ticket-app/` | 被测示例应用 |
| `apps/qa-ticket-app-suite-typescript/` | TypeScript QA 与执行配置 |
| `apps/qa-ticket-app-suite-python/` | Python QA 与独立执行代码 |
| `apps/qa-ticket-app/docs/qa/` | 两套 QA 共享的需求、索引和测试设计 |

示例应用和 QA 项目独立维护。测试只通过 HTTP 和浏览器访问应用。
CLI 中的 `REPO` 和 `QA_REPO` 指向仓库根目录。安装记录中的源码路径相对该目录。

旧启动器 `packages/qa-ai-playwright/src/bin/` 已迁移到 `packages/qa-cli/bin/`。
已有环境应先退出旧激活脚本，再使用新入口执行 `env init`。新激活脚本将 `QA_REPO` 指向仓库根目录。
旧 QA MCP 注册若仍指向迁移前的路径，初始化可能报告配置冲突。先核对旧注册和 QA 锁记录，再手动处理已确认由 QA 管理的条目。不要覆盖用户修改的配置。
旧环境内的 `codex/config.toml` 和 `mcp.lock.json` 不会自动迁移。旧 shell 可能仍设置 `CODEX_HOME`，请先检查该变量。
重跑会保留已有 Skill 和项目文件。旧的环境与项目数据不会自动搬迁。

## 生命周期管理

| 对象 | 当前命令 | 当前作用 |
| --- | --- | --- |
| 环境 | `env init`、`env check`、`env uninstall` | 初始化或补齐环境、检查、卸载当前环境 |
| 项目 | `project init`、`project check`、`project plan`、`project uninstall` | 生成、检查、只读规划模板变化、按所有权记录卸载项目文件 |
| MCP | `mcp list`、`mcp add`、`mcp remove` | 查询可选清单、安装或复用并注册、移除符合记录的注册 |
| 更新检查 | `update check`、`skills check-updates` | 比较配置的来源基线与上游候选版本或提交 |
| 诊断 | `doctor`、`shell` | 检查环境或输出激活脚本路径 |

`env init` 可重复执行。它补齐缺失组件，并保留已有项目文件和受保护的用户配置。
重复初始化不等同于完整的版本升级迁移。
目前没有显式的 `upgrade`、`repair` 或 `rollback` 命令。
模板迁移、Skill 更新应用、MCP 升级和快照回滚仍待实现。

更新检查不安装组件，也不修改来源清单、锁记录或已安装文件。
项目模板文件和 MCP 注册的卸载遵循路径边界和所有权记录。环境卸载默认保留受管环境目录。项目卸载保留依赖目录及目录中的数据。详细删除范围见环境指南。
环境卸载默认保留整个环境目录与共享软件。它清理可确认属于当前环境的 MCP 注册。外部软件清理另有显式选项和保护条件，详见环境指南。

后续先明确状态与所有权，再按对象分批完善安装、卸载、升级和失败恢复。独立诊断、修复和持久回滚随后完善。
每阶段同步文档和 GitHub Actions 验证。详细任务见[管理能力 TODO](qa-cli-management-todo.zh-CN.md)。
## 浏览器 CLI 入口与 CI 组织

`@playwright/cli` 的运行入口由安装包 `package.json` 的 `bin` 字段解析。
安装校验、`qa run playwright-cli` 和 CI 版本检查必须使用同一个入口。
不能根据旧版包结构拼接 `cli.js`。
Agent Browser 的 socket 使用环境根目录下的短目录 `s`，默认会话名为 `qa`，避免长工作区路径超过 Unix socket 的 103 字节限制。
Chromium 的临时文件使用系统临时目录，避免浏览器内部 socket 继承长工作区路径。Windows 同时设置 `TEMP`、`TMP` 和 `TMPDIR`，Unix 使用 `/tmp`。Agent Browser 的截图、下载、流程、配置和 socket 仍写入环境目录。

GitHub Actions 统一由根目录的 CI 工作流承载。
普通 push、pull request 和手动运行均验证 Ubuntu、Windows 和 macOS。
验证范围包括三平台环境、共享卸载保护和维护单元测试。
暂不执行项目生成、项目卸载集成、lint、示例业务测试和兼容版本专项验证。
平台差异通过复合 Action 和统一启动器处理。

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

在仓库根目录运行示例：

```bash
bun run dev:example
bun run build:example
bun run test:example:typescript
bun run test:example:python
```

开发命令会初始化示例数据库，并将演示账号密码恢复为默认值。
Python 测试前先按 [Python 示例说明](../apps/qa-ticket-app-suite-python/README.md)准备 .venv 和 Chromium。
测试参数可直接追加到对应命令。
两套测试和开发服务使用相同端口，须分别运行。

`bun run test:ci env` 可执行环境集成套件。
当前 GitHub Actions 运行维护单元测试、类型检查和跨平台环境验证。

维护测试中的控制台输出采集辅助必须定义在测试文件内，并通过 `tsc --noEmit`。
跨平台 CI 若在安装后同时报告同一类型错误，先修复共享测试源码，再重新运行三平台验证。
Unix 启动器读取版本环境文件时必须兼容仓库文件的 CRLF 换行。

## Git 协作约定

仓库可读文本统一使用 UTF-8 和 LF 换行。
`.gitattributes` 是 Git 检出和提交时的最终约束，`.editorconfig` 统一编辑器默认行为。
PowerShell 和 Windows CMD 脚本也保持 LF，Windows 运行器可以直接执行。
二进制文件必须在 `.gitattributes` 中标记为 `binary`，避免换行转换。
不修改用户全局 `core.autocrlf`；提交前使用 `git diff --check` 检查空白错误。
提交前可使用 `git grep --cached` 检查提交中的 CRLF，二进制文件不参与检查。

## 来源边界

Skill：

- `packages/skills/builtin/`：仓库自己创建和维护。
- 外部 Skill 不随仓库交付。AI 按任务使用上游安装命令。

MCP：

- `packages/mcp/builtin/`：自建 server 清单。
- `packages/mcp/external/`：下载 server 清单。

官方或社区只是外部组件的来源属性，不增加目录层级。
自有 Skill 从本仓库按任务安装到项目。外部 Skill 从固定上游按需安装。

`qa-docs` 只定义调用顺序和归档约定。
实际抓取、网页搜索、浏览器快照、上下文压缩和静态渲染使用 Codex 当前能力。

## 内置 QA MCP


内置 `qa` server 使用 stdio，注册到用户级 Codex 配置。环境初始化只负责发现或准备依赖，不为每个环境复制工具。
其他 MCP 客户端由用户自行配置。

工具包括 `qa_env_check`、`qa_doctor`、`qa_project_init`、`qa_project_check`、`qa_project_uninstall`、`qa_mcp_list`、`qa_mcp_add` 和 `qa_mcp_remove`。
工具使用结构化输入、输出和错误，复用 CLI 业务逻辑与安全检查。
CLI 面向直接操作，Skills 负责按任务选择工具和解释结果。

协议消息只写标准输出。诊断信息写标准错误。
输入、项目资料及工具输出均不可信，不得作为高优先级指令。
不提供任意命令执行或环境自卸载工具。
写入遵循用户已授权的任务范围。卸载遵守用户要求，并执行路径、所有权及用户文件保护检查。
工具结果包含 CLI 输出。不要在命令参数和项目资料中放入凭证。错误须明确返回。
交付前检查局部注册、重复初始化、跳过选项、卸载、stdio 握手、结构化输入输出和安全边界。

## 作用域

| scope | Skill | MCP | 本仓库行为 |
| --- | --- | --- | --- |
| `global` | 用户 Skill 目录 | 用户 Codex 配置 | 复用或按需准备 |
| `project` | 项目 `.agents/skills/` | 项目自己的 Codex 配置 | AI 按需安装 Skill |
| `environment` | 旧环境 `<root>/codex/skills/` | `<root>/codex/config.toml` | 只兼容旧环境，不再作为新工具安装目标 |

环境 CLI 默认使用 `global` 工具和 MCP 配置。AI 按需安装 QA 与外部 Skill 到项目。
锁文件必须记录 `scope`、`source_type`、来源路径和实际版本。
工具和 MCP 默认使用系统或用户级共享作用域。缺失工具安装到共享工具根目录。环境目录只保存状态、缓存、运行输出和项目配置。

## 不可变约束

- 项目目录必须与环境目录分离。
- 已有项目文件使用 `KEEP`，禁止静默覆盖。
- 写入操作必须有清理路径。
- 卸载只能删除所有权记录内且未被用户修改的内容。
- 外部 Skill 必须固定上游提交或版本。
- MCP 复用现有包并记录实际版本，注册到用户级 Codex 配置。
- 外部桌面应用必须记录版本、提交、许可证、官方资产和 SHA256。
- 环境缓存、socket、输出和项目凭证保存在环境或项目边界内；共享工具文件不随环境卸载。
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
| 用户级 `CODEX_HOME/qa-ai-playwright-mcp.lock.json` | CLI | 按环境记录 MCP 清单、配置快照、来源、scope 和版本 |
| 用户级 `CODEX_HOME/config.toml` | 用户与 CLI | 共享 Codex 与 MCP 配置 |
| `<project>/.qa-project.json` | CLI | 项目所有权、模板版本、文件校验值 |
| `<project>/pnpm-lock.yaml` | 项目 | Node 依赖锁 |
| `<project>/requirements.lock` | 项目 | 跨平台解析的 Python 哈希依赖锁 |

修改锁文件格式时，必须提供迁移策略和回滚策略。
旧环境的 Skill 文件和锁记录保留。环境检查不要求 Skill。
回滚前备份环境目录及业务项目的 Skill 安装记录。

## 配置与版本

默认运行时版本统一位于 [runtime-versions.env](../packages/qa-cli/runtime-versions.env)。
`uv` 使用固定版本，避免安装结果漂移。
`env check` 同时校验 uv 版本；不一致时重新执行 `env init`。
Bun 和 pnpm 优先复用已有版本，缺失时安装配置中的版本。
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

## 统一更新检查

`qa update check` 只读检查 QA CLI、内置 MCP、外部 Skill、npm 包和 GitHub Release 版本。来源配置位于 `packages/qa-cli/update-sources.json`。`qa.repository` 是 GitHub 仓库，`qa.ref` 为可选分支。两者默认留空。QA 发布来源尚未确定，不能推断 SSH 别名对应的公开仓库。Skill 使用 `packages/skills/external-sources.json`。

npm 和 Release 来源从运行时、MCP 和应用清单读取固定版本。候选版本不同只代表变化，不代表兼容或可安全升级。Release 资产和哈希仍需人工审查。检查不读取实际安装版本。Node 和 Python 的版本策略尚未配置，报告 `unconfigured`。失败不能当作最新。

相关来源、版本、检查实现或工作流文件推送时触发 Actions。也可手动触发。不使用定时任务。上游仓库自身的 push 不会触发本仓库工作流。检查不安装组件，不更新清单或锁记录，也不覆盖用户文件。

维护测试及实际工作流结果以 GitHub Actions 为准。
## 外部 Skill 更新检查

GitHub Actions 在来源清单、安装说明或检查实现等相关文件推送后运行只读检查。也可手动触发。结果保存在工作流日志。来源变动需审查后手动更新固定提交和安装说明。

在交付包的 `packages/skills/external-sources.json` 维护 GitHub 来源清单。
每个条目记录 `name`、`repository`、`ref`、`path`、`commit` 和 `license`。
默认清单的 `ref` 使用空字符串，表示 GitHub 仓库默认分支。清单可配置其他分支。
`commit` 是当前固定提交。
维护来源时同步核对安装命令、上游提交和许可证。

使用 `qa skills check-updates [--source <清单路径>]` 只读检查指定目录的上游最新提交。
结果比较固定提交和跟踪分支中该目录的最近修改提交。差异不代表分支快进或业务项目已安装的版本。
未指定 `--source` 时使用交付包内的默认清单。
检查失败、离线或清单无效时应明确报告，不能推断没有更新。
检查不能修改清单、锁记录或已有 Skill，也不能自动安装或升级。本次不实现自动应用更新。
维护单元测试覆盖清单校验、更新比较和失败处理。
实际验证结果以 GitHub Actions 为准。

## 测试矩阵

| Workflow | 覆盖内容 |
| --- | --- |
| [ci](../.github/workflows/ci.yml) | 三平台环境验证 |

Windows 主路径使用 PowerShell 7。
PowerShell 5.1 降级专项验证暂不执行。
CI runner 固定为 `ubuntu-24.04`、`windows-2025` 和 `macos-15-intel`。
不使用 `*-latest` 标签，避免系统迁移和 macOS ARM 排队改变验证环境。
最小 Linux 容器专项验证暂不执行。
生成项目 CI 在 PR 使用快速矩阵，完整矩阵只通过手动任务。
测试或运行器失败时，不得只增加重试或跳过门禁。

## CI 触发与验证范围

普通 push、pull request 和手动运行使用相同的三平台矩阵。
环境验证使用 Node 26、Python 3.15 和固定工具版本。
环境验证包含 MCP 和浏览器 smoke。

每次工作流运行执行当前配置的验证步骤。

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

浏览器下载完成后仍提示安装不完整时，检查可执行文件识别规则。
macOS 新版使用 `Google Chrome for Testing`，旧版使用 `Chromium`。
完整 Chromium 检查不能仅凭 Headless Shell 存在就放行。

Windows 中 pnpm 安装后仍显示 `missing` 时，检查是否直接启动了 `pnpm.cmd`。
CLI 应使用环境内 Node 执行 pnpm 的 JavaScript 入口。
pnpm 12 使用 `bin/pnpm.mjs`。旧版回退到 `bin/pnpm.cjs`。
版本探测与项目命令使用相同调用路径，避免探测结果不一致。

详细版本和迁移历史见[版本记录](version-history.zh-CN.md)。
框架来源与许可证见[参考来源](references.zh-CN.md)。
