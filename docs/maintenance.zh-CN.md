# QA + AI + Playwright 维护指南

[使用人员](../README.md) | **维护人员**

本页面向仓库维护者。
内容包括架构、不可变约束、发布门禁和回滚流程。
日常操作见[环境初始化](environment.zh-CN.md)。
组件管理基线和实施清单见[QA CLI 管理能力 TODO](qa-cli-management-todo.zh-CN.md)。

## 获取源码与验证

1. 打开 [GitHub 仓库](https://github.com/huazhuangnan/qa-ai-playwright)，获取仓库访问权限。
2. 克隆源码并进入仓库根目录。HTTPS 示例适用于 Windows、macOS 和 Linux：

   ```bash
   git clone https://github.com/huazhuangnan/qa-ai-playwright.git
   cd qa-ai-playwright
   ```

   也可使用仓库页面提供的 SSH 地址。
3. 阅读根目录 `AGENTS.md` 和 `.agents/skills/qa-maintainer/SKILL.md`，再查看本页的架构与生命周期。
4. 在 GitHub 仓库的 **Actions** 查看 CI 结果。需要时手动运行主 CI，并查看各平台日志。

安装和测试由 GitHub Actions 执行，不在维护者本机运行。
纯文档变更不会自动触发主 CI；需要验证时可在 Actions 手动运行。
本机可使用 `git diff --check` 检查补丁空白。只有实际成功的 Actions 结果才能作为通过证据。

## 架构

```text
qa.cmd / qa.sh  →  发现或引导 Node
      │
      ▼
packages/qa-cli/bootstrap.ts  →  Node 兼容入口
      │
      ▼
packages/qa-cli/qa-cli.ts    →  参数解析和命令分派
      │
      ├── cli/environment-commands.ts → 环境命令分派
      ├── cli/environment.ts          → 运行时、共享工具和 MCP 管理
      ├── cli/project.ts              → 项目生成、测试、卸载
      └── cli/shared.ts               → 配置、哈希、路径和锁记录
      │
      ├── qa-docs                 → 按需使用的链接资料与静态导出
      ├── packages/skills/             → 来源包
      ├── packages/apps/               → 官方桌面应用清单
      ├── packages/templates/          → 项目模板
      └── .github/workflows/      → 验收矩阵
```

- **入口**：平台入口只负责引导和参数转发。业务逻辑集中在 `packages/qa-cli/cli/`。
- **运行时**：平台入口使用 Node 22.18 或更高版本。QA MCP 和项目维护脚本使用 Bun。
- **分派**：环境、项目、Skill 和 MCP 共用 `qa` 命令。QA MCP 复用同一分派。
- **名称**：项目对外名称为 `QA + AI + Playwright`，根包名为 `qa-ai-playwright`。
- **Codex CLI**：npm 来源位于 `packages/apps/codex/manifest.json`。优先复用已有安装，缺失时按清单安装并记录实际版本。该清单不安装桌面应用。

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

旧启动器 `packages/qa-ai-playwright/src/bin/` 已迁移到 `packages/qa-cli/bin/`。迁移旧环境时：

1. 退出旧激活脚本，检查 shell 中的 `CODEX_HOME`。
2. 使用新入口执行 `env init`。新激活脚本将 `QA_REPO` 指向仓库根目录。
3. 如果旧 MCP 注册产生冲突，核对注册和 QA 锁记录。只手动处理已确认由 QA 管理的条目。

重跑会保留已有 Skill 和项目文件。旧环境与项目数据、旧 `codex/config.toml` 和 `mcp.lock.json` 不会自动迁移。

## 生命周期管理

| 对象 | 当前命令 | 当前作用 |
| --- | --- | --- |
| 环境 | `env init/list/check/repair/uninstall`，`env plan/upgrade/snapshots uv`，`env rollback` | 环境生命周期和 uv 升级规则。详见[环境组件升级](environment-managed-upgrades.zh-CN.md) |
| 项目 | `project init/check/plan/upgrade/repair/snapshots/rollback/uninstall` | 项目模板生命周期和迁移规则。详见[项目模板管理](project-template-management.zh-CN.md) |
| 模板 | `template list/check` | 查看仓库内语言模板和 QA 文档模板的版本及文件状态 |
| MCP | `mcp list`、`mcp check`、`mcp add`、`mcp repair`、`mcp remove` | 查询状态、安装或复用、修复缺失项、移除符合记录的注册 |
| 内置 Skill | `skills list/check/install/upgrade/repair/snapshots/rollback/recover/uninstall` | 检查项目内置 Skill，`upgrade` 只给出人工变更建议。外部 Skill 按上游方式管理 |
| 更新检查 | `update check`、`skills check-updates` | 比较配置的来源基线与上游候选版本或提交 |
| 诊断 | `doctor`、`shell` | 检查环境或输出激活脚本路径 |

QA MCP 使用对应 CLI 操作，并传递退出码和输出。升级相关工具只检测并返回人工操作建议，不安装、替换或修改版本。

`env init` 可重复执行。它补齐缺失组件，并保留已有项目文件和受保护的用户配置。
重复初始化不等同于完整的版本升级迁移。
项目模板提供只读升级检测和修复。环境修复沿用已记录配置。
共享工具和 MCP 的通用升级及快照回滚不在这些命令中执行。

- **更新检查**：不安装组件，也不修改来源清单、锁记录或已安装文件。
- **MCP 状态**：分别报告注册、所有权和共享包。包版本取自实际发现的包元数据。未记录全局 npm 位置时报告未知。
- **MCP 修复**：需要完整的本环境所有权记录。缺失共享包按记录版本补装。注册已修改、共享包损坏或所有权未知时停止。
- **浏览器迁移**：注册、所有权记录和配置快照一致，且差异仅限浏览器配置时才更新注册。无法确认时保留原配置并报告。
- **迁移中断**：旧注册已移除而新注册尚未写入时，可按原配置重跑。新注册已写入但所有权记录未更新时，需要人工核对。处理残留的并发保护目录前，先确认没有其他初始化进程。
- **卸载**：项目卸载保留依赖目录。环境卸载保留环境目录和共享软件，只清理可确认归属的 MCP 注册。`--include-external` 当前拒绝执行。详细范围见环境指南。

共享组件和外部 Skill 只提供检测结果。版本升级由维护者使用其原有工具人工执行。
每阶段同步文档和 GitHub Actions 验证。详细任务见[管理能力 TODO](qa-cli-management-todo.zh-CN.md)。
## 浏览器 CLI 入口与 CI 组织

- **Playwright CLI**：从安装包 `package.json` 的 `bin` 字段解析入口。安装校验、`qa run playwright-cli` 和 CI 检查使用同一入口。不能拼接旧版 `cli.js` 路径。
- **浏览器检查**：发现阶段只检查可执行文件存在且可访问。CI 的启动检查只验证所测组合。
- **Agent Browser**：socket 使用环境根目录下的短目录 `s`，默认会话名为 `qa`。截图、下载、流程、配置和 socket 留在环境目录。
- **Chromium 临时文件**：使用系统临时目录，避免 Unix socket 路径超出 103 字节。Windows 设置 `TEMP`、`TMP` 和 `TMPDIR`。Unix 使用 `/tmp`。

根目录的 GitHub Actions 工作流承担验证：

- **触发**：代码、配置、模板行为、测试和工作流变更启动主 CI。纯文档变更不启动，手动运行不受路径过滤影响。
- **覆盖**：验证三平台环境、项目生成与检查、共享卸载保护和维护单元测试。
- **项目 smoke**：覆盖 TypeScript、Python、带空格路径和 Chromium 检查。失败时归档可用证据；未生成证据时查看 Actions 日志。
- **暂未执行**：项目卸载集成、lint、示例业务测试和兼容版本专项验证。
- **平台差异**：通过复合 Action 和统一启动器处理。

## 维护语言

生成项目的跨语言分层和风格规范见[代码风格与架构规范](code-style-architecture.zh-CN.md)。
该规范统一测试边界、fixture 生命周期、数据隔离和依赖方向。
TypeScript 与 Python 分别使用各自的类型、fixture 和运行器约定。

- 仓库自身的 CLI、工具和测试统一使用 TypeScript。
- 根目录的 `package.json`、`pnpm-lock.yaml` 和 `tsconfig.json` 是维护工具链入口。
- 项目依赖统一使用 pnpm。
- 项目维护脚本使用 Bun 执行。CLI 的跨平台启动入口使用 Node。
- 维护测试使用 Bun test。
- TypeScript 代码使用 TSDoc，并接受 `tsc --noEmit` 检查。
- Python 只用于 Python 项目模板和系统能力要求的场景。
- 启动器只使用 PowerShell 或 Bash 完成运行时引导。
- Codex 已有的网页搜索、浏览器、文件读取、上下文压缩和文档生成能力不在仓库内重写。

维护依赖安装、类型检查和单元测试由主 CI 执行。执行步骤及日志见 GitHub Actions。

示例应用和两套 QA 项目的命令见[从需求到执行](qa-workflow.zh-CN.md)。
各项目的具体说明见：

- [示例应用](../apps/qa-ticket-app/README.md)
- [TypeScript 示例 QA](../apps/qa-ticket-app-suite-typescript/README.md)
- [Python 示例 QA](../apps/qa-ticket-app-suite-python/README.md)
本页只维护仓库自身的检查和发布门禁。

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

工具覆盖环境检查与修复、项目管理、内置 Skill 管理和可选 MCP 管理。工具调用对应 CLI 命令。
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

`qa update check` 只读检查 QA CLI、内置 MCP、外部 Skill、npm 包和 GitHub Release 版本。
来源配置位于 `packages/qa-cli/update-sources.json`。
`qa.repository` 是 GitHub 仓库，`qa.ref` 是可选分支。
当前 QA Release 来源为 `huazhuangnan/qa-ai-playwright`。
未设置分支时检查默认分支。
Skill 使用 `packages/skills/external-sources.json`。

npm 和 Release 来源从运行时、MCP 和应用清单读取固定版本。
候选版本不同只代表变化，不代表兼容或可安全升级。
Release 资产和哈希仍需人工审查。
检查不读取实际安装版本。
Node 和 Python 的版本策略尚未配置，报告 `unconfigured`。
检查失败时，不能当作最新。

执行 `pnpm upstream:sync` 同步已配置的运行时、MCP 和 CC Switch 发布基线。使用范围与审查步骤见[上游版本同步](upstream-sync.zh-CN.md)。

相关来源、版本、检查实现或工作流文件推送时触发 Actions。
也可手动触发。不使用定时任务。
上游仓库自身的 push 不会触发本仓库工作流。
检查不安装组件，不更新清单或锁记录，也不覆盖用户文件。

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
| [ci](../.github/workflows/ci.yml) | 三平台环境验证、项目 smoke 和 Tag 发布门禁 |
| [skill-updates](../.github/workflows/skill-updates.yml) | 来源清单、安装说明和更新检查 |

Windows 主路径使用 PowerShell 7。
PowerShell 5.1 降级专项验证暂不执行。
CI runner 固定为 `ubuntu-24.04`、`windows-2025` 和 `macos-15-intel`。
不使用 `*-latest` 标签，避免系统迁移和 macOS ARM 排队改变验证环境。
最小 Linux 容器专项验证暂不执行。
Tag 发布使用主 CI 的完整矩阵。普通 push 和 pull request 使用相同的三平台验证；纯文档变更由路径过滤跳过。
测试或运行器失败时，不得只增加重试或跳过门禁。

## CI 触发与验证范围

普通 push 和 pull request 只有在涉及代码、配置、模板行为、测试或工作流时才启动主 CI。
README、AGENTS、CHANGELOG、`.agents/`、`.github/**/*.md` 和 `docs/` 变更不会启动主 CI。
手动运行始终执行主 CI。`v<版本>` Tag 不受文档过滤影响，并进入发布门禁。
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
4. 由 Release 工作流生成使用者包，并上传 SHA256 清单。
5. 发布完整交付目录，包括自有 Skill、模板、MCP 清单和运行入口，不只发布单个 `SKILL.md`。
6. 回滚时恢复完整目录和清单，再重新执行验收。

Release 不发布 npm 包。
当前交付提供一个使用者 ZIP。开发和维护使用 GitHub 自动提供的源码快照。
用户解压后直接运行 `packages/qa-cli/bin/qa.cmd` 或 `packages/qa-cli/bin/qa.sh`。
以后如果加入平台二进制，再按平台增加 ZIP 或 `tar.gz` 资产。

每个版本的用户变更说明维护在 `docs/releases/v<版本>.md`。
Release 工作流将该文件作为正文前缀，再追加 GitHub 自动生成的变更。
说明格式和发布前检查见[Release 发布指南](release.zh-CN.md)。

主 CI 的触发边界见[CI 触发与验证范围](#ci-触发与验证范围)。

手动打包使用独立的 `Package` 工作流。它从 GitHub Actions 中所选分支运行
`package:release` 对应的 Bun 脚本生成使用者包，校验 ZIP 并上传 ZIP 与
`SHA256SUMS.txt`。默认只保存 Actions Artifact。
启用 `publish_release` 后按 `package.json` 版本创建 GitHub Release。
同名 Release 只有在同时启用 `force_overwrite` 时才会更新用户包和校验文件。

Tag 必须与根 `package.json` 的版本一致。
例如版本 `0.0.1` 对应 `v0.0.1`。
主 CI 的质量、三平台环境 smoke 和双语言项目 smoke 全部成功后，Release 检查才会运行。
发布前会在干净目录中启动 CLI、初始化环境并生成项目。
同名 Release 已存在时，检查成功，发布 job 跳过，不覆盖原版本。

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
