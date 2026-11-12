# 测试维护规则

## 代码风格与架构

- 测试按 `api/`、`functional/`、`e2e/` 和 `unit/` 分层。依赖方向由测试用例指向 fixtures 和 HTTP/浏览器边界。
- 公共 fixture、页面对象、API 客户端和复杂分支使用 TSDoc。测试名称说明业务行为和结果。
- 开启 TypeScript `strict`。禁止使用 `any` 绕过接口契约；异步 Playwright 调用必须 `await`。
- fixture 通过 `test.extend` 注入。`playwright.config.ts` 只放运行器和环境接入，不放业务流程。
- 文件和目录使用小写；符号使用 `camelCase`、类型使用 `PascalCase`、常量使用 `UPPER_SNAKE_CASE`。

- QA 任务先按名称查找 `qa-core`，然后按任务查找其他 QA Skill。
- 执行依赖 QA 环境的测试前，按名称查找并读取 `qa-setup`。确认语言、环境根目录和所需组件，先用 QA MCP 或 CLI 检查。环境缺失或语言不匹配时，用交付包的 `packages/qa-cli/bin/qa.cmd` 或 `packages/qa-cli/bin/qa.sh` 执行 `env init`，再用相同条件执行 `env check`。安装缺失的共享工具前告知用户。找不到启动器或必要信息时报告阻塞。
- 处理 Bun 运行、脚本或测试时检查 `bun-runtime`。处理 pnpm 配置、依赖、锁文件或 workspace 时检查 `pnpm`。这些检查不限于 QA 任务。
- 复用的旧版 `qa-core` 可能缺少 Bun、pnpm 路由。需要安装外部 Skill 时，读取 `QA_REPO/packages/skills/builtin/qa-core/references/external-skills.md`。`QA_REPO` 未设置时先激活 QA 环境。
- 每个 Skill 单独检查：当前会话、项目 `.agents/skills/`、`CODEX_HOME/skills/`、`~/.codex/skills/`、`~/.agents/skills/`。已有可用项直接读取，不安装或覆盖。
- 跨作用域的 QA Skill 的同级链接不一定存在。按 Skill 名称重新查找，缺失时只安装所需项。
- 缺少 QA Skill 时，从本仓库 `QA_REPO/packages/skills/builtin/` 对应目录安装到业务项目。先激活 QA 环境以设置 `QA_REPO`。找不到源或安装失败时报告，不伪造成功。
- 在业务项目根目录安装缺失的 `qa-core`：PowerShell 使用 `bunx skills@1.7.6 add "$env:QA_REPO/packages/skills/builtin/qa-core" --skill qa-core --agent codex --copy --yes`；Bash 使用 `bunx skills@1.7.6 add "$QA_REPO/packages/skills/builtin/qa-core" --skill qa-core --agent codex --copy --yes`。其他 QA Skill 替换目录名与 `--skill` 名称。安装后确认项目文件并读取。
- 项目目标目录已存在但不完整时不要覆盖。安装失败或权限不足时报告，并继续不依赖它的工作。无需为了 Skill 写全局目录。
- 成功安装到项目后，在 `docs/qa/tasks/skill-installs.md` 记录 Skill 名称、`scope=project`、来源及实际版本或提交。不修改第三方锁文件。复用已有 Skill 时不新增安装记录。
- 公共 API、fixture、页面对象和复杂分支使用 TSDoc 注释，说明用途、输入、输出与非显然约束。
- 生成的测试用例用简短注释说明业务目标、关键前置条件和非显然断言，不逐行复述代码。
- API、功能集成、E2E 使用 @playwright/test；组件测试需另配框架适配包。
- 定位器优先 role、label、test id，禁止固定 sleep 和深层 CSS。
- 改动后运行目标测试；未运行、失败、重试后通过和跳过分别报告。
- Healer 的行为由提示词与审查约束，不保证自动遵守。业务回归保留失败，不得自动 fixme、skip、删用例或放宽断言。
- 数据按 worker/用例隔离，写操作使用唯一数据并在 finally/fixture teardown 清理。
- page 与独立 request fixture 不自动共享登录 Cookie；按需使用 page.request 或显式 storageState。
- 凭证使用环境变量；认证状态和 trace 不得提交。禁止指向生产环境。
- 从公共和环境示例文件复制 `.env`、`.env.dev`、`.env.stg`。真实文件已被忽略。
- 用 `QA_ENV` 选择 `.env.<环境>` 文件。各环境文件使用相同的变量名。
- `QA_ENV`、`UI_BASE_URL` 和 `API_BASE_URL` 是基础示例。项目变量按契约增加并登记到 `docs/qa/inputs/input-index.md`。
- UI 与 API 地址不同时分别配置。`BASE_URL` 仅用于兼容旧项目。
- 依赖维护在 `package.json`。使用 pnpm 安装并提交 `pnpm-lock.yaml`。
- 脚本使用 Bun 执行。Playwright 运行在 Node.js 上。
- 不使用 npm 管理项目依赖。
- API 使用 `api` fixture。写入数据前调用 `requireWriteAccess`，并使用 `uniqueId` 与 `cleanup`。
- 生产写入默认拒绝。只有显式设置 `QA_ALLOW_PRODUCTION_WRITES=true` 才允许。
- `REQUIRE_API_TESTS=1` 时缺少环境配置直接失败，跳过的 API 不计为覆盖。
- 多角色 UI 登录态使用 `QA_AUTH_ROLES` 与 `auth-setup` project 生成。
- 状态文件位于 `playwright/.auth/<role>.json`，不得提交。
- `QA_AUTH_STATE` 保留为单个手工状态文件的兼容入口。
- 同一用例切换角色使用 `loginAs` fixture，不复用可变共享会话。
- 使用 `unit`、`smoke`、`regression`、`contract`、`integration` 标签区分执行范围。
- Agent 生成前审阅计划和业务预期，生成后运行测试并审查 diff。
- 先观察当前页面和失败证据再操作或修改；不使用 networkidle、force 点击或增加重试代替真实就绪与根因排查。
- docs/qa/inputs 保存测试资料并默认只读。docs/qa/tasks 保存 AI 任务。docs/qa/generated 保存生成文档。
- 生成文档记录模板版本、文档版本、状态、输入基线和修订记录。缺需求时列出待确认项。
