# AGENTS.md

项目的目标是管理和便捷使用 Codex 完成 QA。新增能力应降低 QA 准备、执行或排错成本，或降低相关失败风险。

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
   `qa` 短命令由用户在每个终端会话中手动设置。不自动修改 PATH 或 shell 启动配置。
11. `project` 命令先检查对应环境已完成 `env init`，缺失或语言不匹配时立即失败。
12. 功能和文档能精简就精简。保留必要约束、命令和迁移信息，不写重复背景或过程说明。
13. 按任务范围节约 token。先定位文件和相关段落，限制日志与工具输出，按需展开。复用已有结论，保留完成任务所需的证据与验证。
14. 跨平台变更检查路径语义、空格、命令启动和参数传递。按目标平台配置 CI 验证，未执行的平台如实报告。

## 版本记录与提交

- 每次修改前检查受影响组件的版本和变更日志，先记录预期变化。完成后根据实际 diff 核对并修订日志。
- 仓库功能、维护脚本和 CI 的有效变化记录到 `docs/version-history.zh-CN.md` 的“未发布”章节。纯格式调整和重复说明无需记录。
- 模板行为或内容变化同步更新对应模板的 `CHANGELOG.md`。涉及多个组件时分别更新其记录，不重复无关内容。
- 记录实际行为、兼容性和必要迁移步骤。不虚构版本、发布日期或验证结果。
- 首次提交前自有组件保持 `0.0.1`。发布或版本调整时按既有版本规则同步版本、日志和引用。
- 完成修改后根据实际 diff 按功能拟定 commit 信息，并告知用户。优先遵循项目已指定的语言和历史 commit 风格；当前项目使用英文，未指定且无历史参考时使用中文。未经用户明确要求，不执行 commit 或 push。
- `tom-local-dev` 是本地开发分支，永远不 push。push 前必须完成 build 和测试。

## 目录与生成文件

- 使用 pnpm workspace 管理示例应用。仓库根目录就是 `qa-ai-playwright` 项目，示例应用放在 `apps/`。
- 根目录保留 workspace 配置、公共文档、维护测试和 CI。
- 项目对外名称统一为 `QA + AI + Playwright`。
- 仓库根包名为 `qa-ai-playwright`。
- CLI 启动器放 packages/qa-cli/bin/，不提供交互式双击入口。
- 入口脚本只负责引导、参数转发和退出码处理：解释器选择、解析 `--root`、自举 Node、按退出码 20 报告环境目录已保留。其余业务逻辑集中在 packages/qa-cli/cli/。
- 跨平台入口负责发现或准备 Node，再启动 TypeScript 命令。环境管理与 QA 项目、Skill 和 MCP 的业务分派按职责分离，复用共同实现。保留现有 `qa` 命令兼容。
- 仓库自身的维护实现和测试统一使用 TypeScript。
- Python 只用于 Python 项目模板、Python 示例 QA 项目和系统能力要求的场景。
- 根目录提供 package.json、pnpm-lock.yaml 和 tsconfig.json。
- 维护测试使用 Bun test，代码使用 TSDoc。
- 程序入口、MCP、Skills、模板和应用资产分别放在 packages/qa-cli/、packages/mcp/、packages/skills/、packages/templates/ 和 packages/apps/。
- 文档与测试放在项目根目录，与可交付程序资产分开。
- Codex 已有的网页搜索、浏览器、文件读取、上下文压缩和文档生成能力不在仓库内重写。
- 仓库通过 Skills、模板和路由告诉 AI 何时调用这些能力。
- 用户提供链接时，由 AI 调用现有能力发现相关文档。
- 仅在安装 `qa-docs` 时按该 Skill 归档精简资料。
- 上下文按索引、标题和相关章节逐级读取，确需完整文件时再读全文。
- 仓库只保存自有 Skill，不保存外部 Skill 的内容。记录其上游来源和安装方式。
- AI 按任务检查 QA、Bun、pnpm 和其他适用 Skill。会话、全局、环境与项目均不可用时，通过命令安装到业务项目。
- MCP 来源固定分为 packages/mcp/builtin 和 packages/mcp/external。
- 安装记录必须写入 scope 和来源。系统级工具记录复用或由 QA 安装；按需 Skill 的 scope 为 project。
- 更新外部 Skill 安装方式时同步核对上游版本、许可证、引用和 CI 预期。
- 标准模式检查并准备 Microsoft Playwright CLI。
- full 模式增加 Agent Browser CLI 和 MCP。QA 与外部 Skill 均按任务安装。
- 外部应用清单放 packages/apps，保留上游版本、提交、许可证、官方资产和 SHA256。
- Codex、CC Switch、Bun、pnpm、Playwright CLI、MCP 和 Agent Browser 先检查系统或用户级安装；已有则复用，不覆盖。缺失才全局安装，并在执行安装命令前告知。
- CC Switch 仅在显式选择时准备。环境安装记录不作为卸载共享软件的唯一依据。
- 浏览器先检测用户已安装的兼容版本。已有则复用，确认缺失后才安装。用户指定浏览器时按其选择处理。不得覆盖用户浏览器或复用日常登录配置。
- Agent Browser 复用选定的兼容浏览器。socket、截图、下载和流程数据必须留在环境目录。
- 启用 Codex 时注册内置 QA MCP。标准模式注册 Playwright MCP。full 模式再注册 Agent Browser MCP。
- MCP 使用用户级 Codex 配置注册，版本、配置、检查与卸载逻辑必须同步。
- 默认环境的 MCP 使用可读名称。额外环境使用显式名称，迁移旧注册时核对归属并保留冲突配置。
- MCP 使用实际安装版本和环境运行状态。安装来源、配置、检查与卸载逻辑必须同步。
- 缓存、局部安装环境、依赖、报告、临时文件和凭证加入 .gitignore；生成项目的忽略规则限定根目录，不能误忽略 packages/skills/ 下的源码。
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
- `env init` 复用已有 Bun 和 pnpm。缺失时安装指定版本，并记录实际使用的版本。
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
- 生成项目 CI 使用 PR 快速验证和手动完整矩阵。
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
- 检查 Markdown 渲染后的段落。并列信息优先使用紧凑列表或表格，避免相邻行合成过长段落。

## 示例应用与 QA 分离

- 全栈示例应用放在 `apps/qa-ticket-app/`，维护应用、迁移、运行说明和共享资料。
- TypeScript QA 项目放在 `apps/qa-ticket-app-suite-typescript/`。
- Python QA 项目放在 `apps/qa-ticket-app-suite-python/`。
- 业务需求、OpenAPI 和两套项目共享的测试设计放在 `apps/qa-ticket-app/`。各 QA 项目的任务、专属用例映射和执行报告放在各自的 `docs/qa/`。
- QA 测试通过 HTTP 和浏览器访问示例应用，不导入服务端业务实现。
- 交互验收、稳定 smoke 和自动回归分别组织，不把所有步骤做成固定菜单。

## 工作流要求

- QA 与外部 Skill 由 AI 按任务检查。缺少可用 Skill 时通过命令安装到业务项目。仓库不保存上游 Skill 内容。
- 修改安装方式时同步安装、检查、旧环境、锁记录、文档和 CI。
- 测试输入支持 PRD、接口文档链接和 OpenAPI JSON/YAML 文件。业务理解、用例与执行证据应可追踪。
- 生成的测试说明业务目标和非显然约束。完整流程文档展示命令、输出形式和证据位置。
- 工单示例分别提供 TypeScript 与 Python QA 项目，均通过 HTTP 和浏览器验证同一业务流程。
- 生成用例记录步骤、每步可观察结果、清理和测试代码映射。自动化的复杂流程展示可辨识步骤。
