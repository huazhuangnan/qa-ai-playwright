---
name: qa-maintainer
description: 维护本 QA + AI + Playwright 仓库的 CLI、Skills、测试模板、使用文档和发布验证；适用于修改仓库实现、版本或资产布局，不用于业务项目的日常测试执行。
metadata:
  version: "0.0.1"
---

# QA + AI + Playwright 仓库维护

先读取 docs/maintenance.zh-CN.md、相关实现和测试。README.md 面向使用人员；架构、版本、来源和验证记录写入维护指南。沿用现有工具，不把个人机器已有插件当用户依赖。

## 资产边界

- 项目对外名称统一为 QA + AI + Playwright。
- pnpm workspace 管理 apps/ 中的示例项目。仓库根目录为 QA 项目根目录。
- CLI 的 REPO 和 QA_REPO 指向交付包根目录。
- npm 名称使用 qa-ai-playwright。
- .agents/skills/ 只放维护本仓库的 Skills；它们不随 env init 交付。
- packages/ 放程序入口、核心实现、运行时配置、用户 Skills 和交付模板。
- packages/qa-cli/bin/ 只放跨平台命令行入口。
- 仓库自身维护实现和测试统一使用 TypeScript。
- Python 用于 Python 项目模板、Python 示例 QA 和系统能力要求的场景。
- 工单示例的 TypeScript 与 Python QA 分别位于 apps/qa-ticket-app-suite-typescript/ 和 apps/qa-ticket-app-suite-python/。
- 工单应用维护共享业务输入和测试设计。各 QA 项目在自己的 docs/qa/ 下维护专属任务、用例映射和执行报告。
- 根目录使用 package.json、pnpm-lock.yaml 和 tsconfig.json。
- 维护测试使用 Bun test。TypeScript 使用 TSDoc。
- Codex 已有的网页搜索、浏览器、文件读取、上下文压缩和文档生成能力不在仓库内重写。
- 仓库通过 Skills、模板和路由告诉 AI 何时调用这些能力。
- 用户提供链接时，由 AI 调用现有能力发现相关文档。
- 安装 qa-docs 时再按该 Skill 归档精简资料。
- 上下文按索引、标题和相关章节逐级读取，确需完整文件时再读全文。
- 资料归档或静态导出需要 qa-docs 时，按需检查并加载。
- 不因链接处理新增爬虫、搜索服务、tokenizer 或静态站生成器。
- packages/skills/builtin/ 放仓库自己创建和维护的 Skills。
- 外部 Skill 不随仓库交付。AI 按 qa-core 规则检查并按需安装到业务项目。
- packages/mcp/builtin/ 和 packages/mcp/external/ 分别保存自建和下载的 MCP 清单。
- 软件和 MCP 优先复用系统或用户级安装。缺失时才全局安装，并在执行命令前提示。QA 和外部 Skill 按任务检查，缺失时安装到业务项目。
- 标准模式安装 Playwright CLI 和 Playwright MCP。启用 Codex 时注册内置 QA MCP。
- full 模式增加 Agent Browser CLI 和 Agent Browser MCP。qa-docs 按需安装。
- 业务项目级配置放项目目录。MCP 注册使用用户级 Codex 配置，保留用户已有配置。
- `playwright-cli` 来自 Microsoft 官方仓库。已有时复用，缺失时安装清单版本。
- `agent-browser` 来自 Vercel 官方仓库，仅 full 模式安装。
- 外部 Skill 来源、固定提交和安装命令保存在 qa-core 的引用文件中。
- packages/apps/ 保存官方桌面应用清单、许可证和固定资产哈希。
- CC Switch 优先复用已有安装。缺失时使用清单中的官方资产安装到用户级共享目录。
- Agent Browser 复用 Playwright Chromium，不另建用户级浏览器缓存。
- 默认使用已有 `@playwright/mcp`，缺失时安装清单版本。
- 启用 Codex 时默认注册 `qa`。标准模式注册 `playwright`，full 模式增加 `agent-browser`。
- 浏览器和运行输出保持在环境根目录。MCP 程序和注册可跨环境复用。
- qa-core 路由到职责及语言适配。跨作用域按名称重新定位 QA Skill，不假设同级目录。
- 公共规则集中在 qa-core/references/common-workflow.md。
- qa-business-guide 负责解释陌生业务和指导下一步操作。
- 包不能依赖维护人员的私有路径。
- QA Skill 按名称在会话、项目、环境和全局中查找。跨作用域引用按名称重新定位。
- packages/templates/python、packages/templates/typescript 放运行器项目。
- packages/templates/qa 放复制到项目 docs/qa 的工作模板。输入、AI 任务和生成文档分别位于 inputs/、tasks/、generated/。
- packages/templates/qa/VERSION 与 CHANGELOG.md 管理模板版本。项目初始化记录实际使用的 qa_template_version。
- QA Skill 缺失时从 packages/skills/builtin/ 安装到业务项目。保留旧环境内容和锁记录。
- CLI 不使用交互菜单。环境与项目命令使用位置参数。卸载非 QA 安装的软件前必须明确征得用户同意。
- project 命令执行前检查环境已初始化且语言匹配。
- 更新外部 Skill 安装方式时同步核对上游提交、许可证和安装锁定文件。
- 更新 MCP 时同步 `QA_PLAYWRIGHT_MCP_VERSION`、安装配置、CI 断言和文档。
- 语言项目模板提供 `.env.example` 并自动加载本地 `.env`。真实 `.env` 不提交，进程环境和 CI secrets 优先。
- 项目使用 `QA_ENV` 选择 `.env.<环境>` 文件。各环境文件使用相同变量名。
- `QA_ENV` 选择环境。`UI_BASE_URL` 和 `API_BASE_URL` 分离页面与接口入口。
- `BASE_URL` 只作兼容回退。其他变量按项目契约增加。
- 生成项目只保留可执行或可填写的模板，不放重复目录介绍的 README。
- 项目变量名集中登记到 `docs/qa/inputs/input-index.md`，不发明跨项目通用业务变量。
- Python 与 TypeScript 项目模板分别维护 VERSION 和 CHANGELOG，项目清单记录语言模板版本。
- TypeScript 使用 pnpm-lock.yaml。Python 使用带哈希的 requirements.lock。
- 项目模板提供 API、认证、唯一数据、LIFO 清理和生产写保护 fixtures。
- API 测试使用显式门禁。CI 归档证据并限制权限、超时和并发。
- 生成项目 CI 分离 PR 快速验证与夜间或手动完整矩阵。
- 测试用 smoke、regression、contract、integration 标签区分执行范围。
- 仓库根目录的 .gitignore 只按根目录限定生成环境和示例项目，并全局忽略依赖、缓存、报告、凭证和临时文件；不能用宽泛的目录名误忽略 packages/skills/ 源码或模板。

## 版本与验证

首次提交前，仓库自有 package、builtin Skills、维护 Skill 和项目模板版本固定为 0.0.1。
此阶段修改内容不递增版本，也不建立虚假历史。
外部 Skill、MCP 和下载应用记录真实上游来源与版本。
首次提交后再按 SemVer 更新 metadata.version（MAJOR.MINOR.PATCH）。
版本变化、兼容性和迁移记录写入维护指南。
不能因源版本变更就把已安装版本记成新版。
校验值覆盖实际安装的全部文件。
没有版本的本地定制标记为未知。

本仓库不在维护者本机执行安装或测试，验证统一交给 GitHub Actions。
GitHub Actions 固定明确 runner 标签，不使用 ubuntu-latest 或 macos-latest。按变更范围更新 env-ci.yml、project-ci.yml、uninstall-ci.yml 及相关测试，再静态审阅；未获得远程结果前不得宣布通过。涉及模板/运行器时覆盖项目生成、重跑保留、失败证据及卸载保留。Skill 格式检查不代表行为验证。用 tests/skill-cases/scenarios.json 做行为复核，区分真实执行和情景演练。

修改 Skills 分层、安装名单或同级引用时，同步检查用户指南、维护指南、锁文件断言和 CI 预期。
调整 `qa-docs` 时检查按需路由、项目安装和链接资料模板。
新增或调整业务引导、快捷调用说明时，同步检查 qa-core 路由和用户文档。
测试层级、验证目标、执行入口及负责人分别建模。功能测试可由 API 或 UI 执行。单元测试沿用业务项目运行器。
专项能力按真实需求增加。不以空壳 Skill 宣称性能、安全或可访问性已交付。

QA Skills 主动检查当前任务所需的输入。
缺失的 API 契约、脱敏样例、环境、角色、数据生命周期和预期结果应集中列出。
不要求用户在对话中提交密码、Token、Cookie、私钥或真实客户数据。
只索取环境变量名、密钥系统位置、测试环境和最小权限账号。

涉及独立读写任务时可用少量 subagent 并行；避免多个 agent 同时修改同一文件。
提交前检查相关文档的本地链接、源文件路径、版本及安装清单一致。
只记录实际执行的平台和命令，不替用户发布。

## 协作与文档

先给出简短方案再执行；可使用 Plan 模式时优先采用。独立任务使用少量 subagent 并行，优先不超过三个，同一文件由一个任务修改。

对话中新增的项目边界、目录约定和文档要求及时沉淀到根 AGENTS.md 或相关项目 Skill，不修改全局规则。

README 保持简短，只保留快速开始、语言选择和文档索引。
顶部只放使用人员与维护人员，语言选择放在快速开始之后。
环境细节放 environment 页，Skills/MCP 细节放 skills-mcp 页，语言命令放语言页。
维护指南保存目录、版本、发布及验证规则。
使用简洁、客观的中文，避免重复历史记录和过宽表格；模板使用可见的中文占位符。

- 文档使用清楚、简洁的短句。一句话只表达一个主要意思。
- 删除“命令不会提问”“看到通过结果”等不改变操作的说明。
- 项目自有 SKILL.md 用「## 规则 / ## 说明 / ## 示例」组织内容。
- 官方上游 SKILL.md 保留原结构，只增加来源元数据和必要的项目级冲突说明。
- 生成的代码遵循语言与项目注释习惯。TypeScript 使用 TSDoc，Python 使用 docstring。
- 仓库自身实现优先 TypeScript。Python 只用于支持的测试项目目标或系统能力必需场景。
- 功能和文档以简洁明确为先。保留必要约束、命令和迁移信息，删除重复背景与过程说明。
