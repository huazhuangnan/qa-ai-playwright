# AGENTS.md

1. 对可独立的读写任务使用少量 subagent 并行，优先不超过 3 个；同一文件由一个任务负责修改。
2. 对话中确定的项目边界与要求及时记录到本项目 AGENTS.md 或对应 Skill，不修改全局配置。
3. 优先使用 Plan 模式，先出方案再执行；已经确认的方案继续执行，范围变化时先更新方案。
4. 文档使用清楚、简洁的短句；一句话只表达一个主要意思。
5. 生成的代码应包含符合语言和项目习惯的维护性注释，例如 TypeScript 使用 TSDoc。
6. 仓库自身实现优先使用 TypeScript。Python 用于受支持的测试项目目标，或系统能力要求必须使用 Python 的场景。
7. 项目依赖统一使用 `pnpm` 和 `pnpm-lock.yaml`，不用 npm 管理项目包。
8. 仓库 TypeScript 脚本使用 Bun 执行。Python 测试使用项目 `.venv` 解释器。第三方工具按自身要求运行。
9. Node 只用于环境自举、安装 Bun/pnpm 和运行明确依赖 Node 的第三方工具。
10. CLI 不提供交互提示或菜单。`env init <语言>` 和 `project init <目录> --language <语言>` 使用位置参数。
11. `project` 命令先检查对应环境已完成 `env init`，缺失或语言不匹配时立即失败。
12. 功能和文档能精简就精简。保留必要约束、命令和迁移信息，不写重复背景或过程说明。

## 目录与生成文件

- 使用 pnpm workspace。可运行应用放在 `apps/`，交付包放在 `packages/`。
- 根目录保留 workspace 配置、公共文档、维护测试和 CI。
- 项目对外名称统一为 `QA + AI + Playwright`。
- 交付包名为 `qa-ai-playwright`，根维护包名为 `qa-ai-playwright-workspace`。
- CLI 启动器放 packages/qa-ai-playwright/src/bin/，不提供交互式双击入口。
- 入口脚本只负责引导、参数转发和退出码处理：解释器选择、解析 `--root`、自举 Node、按退出码 20 删除环境目录。其余业务逻辑集中在 packages/qa-ai-playwright/src/。
- 仓库自身的维护实现和测试统一使用 TypeScript。
- Python 只用于 Python 项目模板、Python 示例 QA 项目和系统能力要求的场景。
- 根目录提供 package.json、pnpm-lock.yaml 和 tsconfig.json。
- 维护测试使用 Bun test，代码使用 TSDoc。
- 程序入口、源码 Skills、交付模板和核心实现统一放在 packages/qa-ai-playwright/src/。
- 文档与测试放在项目根目录，与可交付程序资产分开。
- Codex 已有的网页搜索、浏览器、文件读取、上下文压缩和文档生成能力不在仓库内重写。
- 仓库通过 Skills、模板和路由告诉 AI 何时调用这些能力。
- 用户提供链接时，由 AI 调用现有能力发现相关文档。
- 仅在安装 `qa-docs` 时按该 Skill 归档精简资料。
- 上下文按索引、标题和相关章节逐级读取，确需完整文件时再读全文。
- 仓库只保存自有 Skill，不保存外部 Skill 的内容。记录其上游来源和安装方式。
- AI 按任务检查 QA、Bun、pnpm 和其他适用 Skill。会话、全局、环境与项目均不可用时，通过命令安装到业务项目。
- MCP 来源固定分为 packages/qa-ai-playwright/src/mcp/builtin 和 packages/qa-ai-playwright/src/mcp/external。
- 安装记录必须写入 scope。环境组件默认 scope 为 environment，按需 Skill 的 scope 为 project。
- 更新外部 Skill 安装方式时同步核对上游版本、许可证、引用和 CI 预期。
- 标准模式只安装 Microsoft Playwright CLI。
- full 模式增加 Agent Browser CLI 和 MCP。QA 与外部 Skill 均按任务安装。
- 外部应用清单放 packages/qa-ai-playwright/src/apps，保留上游版本、提交、许可证、官方资产和 SHA256。
- CC Switch 使用固定便携版，无论项目语言都随 env init 安装，安装不写注册表或系统应用目录。
- Agent Browser 复用 Playwright Chromium。socket、截图、下载和流程数据必须留在环境目录。
- 标准模式注册 Playwright MCP。full 模式再注册 Agent Browser MCP。
- MCP 必须写入环境内 `CODEX_HOME`，不得修改用户全局 Codex 配置。
- 默认 MCP 使用固定版本和局部状态。版本、配置、检查与卸载逻辑必须同步。
- 缓存、局部安装环境、依赖、报告、临时文件和凭证加入 .gitignore；生成项目的忽略规则限定根目录，不能误忽略 packages/qa-ai-playwright/src/skills/ 下的源码。
- 本仓库安装和测试统一交给 GitHub Actions，不在维护者本机执行。
- GitHub Actions 固定明确 runner 标签，不使用 `ubuntu-latest` 或 `macos-latest`。

## QA Skills 边界

- 用户 Skills 按通用规则、测试设计/职责、语言适配、环境管理组合，不仅按语言划分。
- 通用规则集中在 qa-core 和公共执行边界。
- 业务理解由 qa-business-guide 承担。
- 测试职责由 qa-test-design、qa-api、qa-web、qa-triage 承担。
- qa-python 和 qa-typescript 只承担技术适配。
- 区分测试层级、验证目标与执行入口。功能测试可在 API/UI 层做。单元测试沿用业务项目已有运行器。
- 专项 Skills 按真实需求和可验证能力扩展，不用空壳宣称支持性能、安全或可访问性。
- 项目模板提供 Skill 按需检查的引导。AI 显式读取适用规则，不依赖多 Skill 自动同时触发。
- Skills 可来自本仓库 `.agents/skills/`、旧 QA 环境 `<root>/codex/skills/`、业务项目 `.agents/skills/` 和全局用户目录。缺失时只安装到业务项目。
- 项目自有 SKILL.md 用「## 规则 / ## 说明 / ## 示例」区分约束、解释和例子。
- 官方上游 Skill 由上游命令安装，不修改其内容。
- 生成测试前主动提醒补充必要资料。API 任务优先索取文档链接或脱敏 JSON，不要求直接提交凭证值。
- 用户不懂业务时先加载 qa-business-guide，再路由到测试职责。
- `qa-docs` 为可选 Skill，按任务需要检查并安装。
- 安装 `qa-docs` 后再按它处理资料归档和静态导出。
- 不因链接处理新增爬虫、搜索服务、tokenizer 或静态站生成器。
- 文档说明 Codex `/skills`、`$skill-name`、MCP 与项目 CLI 的调用边界。
- 不把项目 CLI 虚构成自定义 `/` 命令。
- 社区与生态新方案只作下个版本评估参考，不改变当前交付能力。
- 账号、Token、Cookie、私钥和真实客户数据通过测试环境、环境变量或密钥系统使用。
- 浏览器登录态使用 Playwright `storageState`，按角色写入被忽略的 `playwright/.auth/`。
- TypeScript 用 setup project 和 project dependencies 生成状态。
- Python 用生成脚本和 `login_as` fixture 复用状态。
- docs/qa/inputs 保存输入资料并默认只读。docs/qa/tasks 保存任务。docs/qa/generated 保存 AI 生成文档。
- QA 文档模板使用独立版本。生成文档记录文档版本、状态、输入基线和修订记录。

## 项目模板质量边界

- Python 与 TypeScript 项目模板分别维护 `VERSION` 和 `CHANGELOG.md`。
- 首次提交前，仓库自有包、builtin Skills 和项目模板版本固定为 `0.0.1`。
- 外部 Skill、MCP 和下载应用记录实际来源与版本，不虚构上游版本。
- 项目清单记录 QA 文档模板版本和语言模板版本。
- TypeScript 使用锁定依赖与 `pnpm-lock.yaml`。Python 使用带哈希的 `requirements.lock`。
- `env init` 在 Node 安装完成后安装固定版本的 Bun 和 pnpm。
- 生成项目的安装使用 `pnpm install --frozen-lockfile`。
- 生成项目的脚本通过 Bun 执行。
- 生成项目只保留可执行或可填写的模板，不复制重复的目录介绍 README。
- `QA_ENV` 是环境选择器。
- `UI_BASE_URL` 和 `API_BASE_URL` 分别配置页面和接口入口。
- `BASE_URL` 只保留兼容回退。
- 项目变量名集中在 `docs/qa/inputs/input-index.md` 登记，不发明跨项目通用变量。
- API 测试通过显式门禁运行。缺少环境契约时不能把跳过当作覆盖。
- 模板提供认证、API、唯一数据与清理 fixture。
- 生产写入默认禁止。需要写入时使用独立开关，并记录测试环境。
- CI 限制只读权限、执行时长和并发，并归档失败证据。
- 生成项目 CI 使用 PR 快速验证、夜间或手动完整矩阵。
- 测试使用 smoke、regression、contract、integration 等标签区分执行范围。

## 文档规范

- 使用指南分公共入口 README.md、环境页、Skills/MCP 页和语言子页。
- README 只保留简介、入口、快速开始、语言选择、范围摘要和文档索引。
- 顶部只放使用人员 / 维护人员。语言选择放在快速开始之后。
- 公共流程只在 README 写摘要。详细参数与环境内容放专门文档。
- 语言页只放该语言命令、项目结构和报告方式，不重复公共说明。
- 系统差异用可展开块切换。不重复粘贴两条 Windows / macOS 命令。
- 使用简洁、客观的中文和按任务组织的导航。命令标明平台及执行目录。
- 删除“命令不会提问”“看到通过结果”等不改变用户操作的空泛说明。
- 使用指南不加入仓库职责、开发过程或重复的维护说明。
- 保持文档路径、Skill 职责和版本与源码一致；避免过宽表格、重复历史记录及无用途的生成产物。
- Markdown 模板使用 `［待填写］` 等可见占位符，不使用可能被当作 HTML 隐藏的尖括号占位符。
- 句子宜短，一个意思一句。避免用分号把多个动作或条件串成一句。

## 示例应用与 QA 分离

- 全栈示例应用放在 `apps/qa-ticket-app/`，只维护应用、迁移和运行说明。
- TypeScript QA 项目放在 `apps/qa-ticket-app-suite-typescript/`。
- Python QA 项目放在 `apps/qa-ticket-app-suite-python/`。
- 两套项目共享 `docs/examples/qa-ticket-app/` 中的业务需求与 OpenAPI，各处只维护对应语言测试。
- QA 测试通过 HTTP 和浏览器访问示例应用，不导入服务端业务实现。
- 交互验收、稳定 smoke 和自动回归分别组织，不把所有步骤做成固定菜单。

## 工作流要求

- QA 与外部 Skill 由 AI 按任务检查。缺少可用 Skill 时通过命令安装到业务项目。仓库不保存上游 Skill 内容。
- 修改安装方式时同步安装、检查、旧环境、锁记录、文档和 CI。
- 测试输入支持 PRD、接口文档链接和 OpenAPI JSON/YAML 文件。业务理解、用例与执行证据应可追踪。
- 生成的测试说明业务目标和非显然约束。完整流程文档展示命令、输出形式和证据位置。
- 工单示例分别提供 TypeScript 与 Python QA 项目，均通过 HTTP 和浏览器验证同一业务流程。
- 生成用例记录步骤、每步可观察结果、清理和测试代码映射。自动化的复杂流程展示可辨识步骤。
