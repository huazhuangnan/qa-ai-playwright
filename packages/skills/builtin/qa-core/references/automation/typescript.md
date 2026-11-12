# TypeScript QA 技术适配

先读项目 AGENTS.md、package.json、Playwright 配置、fixture 和目标用例。
公共执行边界和测试设计由 `qa-core` 按需加载。缺失时按项目引导，不伪造预期或结果。
实现前应用 TypeScript 专属的命名、fixture 注入、TSDoc、严格类型和 Playwright 门禁规则。
常用命令见[操作卡](typescript-recipes.md)。
生成代码前读取并按需应用[TSDoc、流程注释和可维护结构规则](../generated-code-quality.md)。

## 规则

- 遵循 TypeScript 专属命名、fixture 注入、TSDoc、严格类型和 Playwright 门禁规则。

- 沿用现有依赖和目录，不为通用测试设计引入运行器。
- 生成前检查现有测试、脚本、`webServer` 和 fixtures。用户要求自动测试时先运行最小基线或目标用例，生成后按确认范围运行新增用例。
- 生成测试写明业务目标和关键前置条件。复杂流程用业务化 `test.step`，注释说明准备、操作、断言和清理。公共辅助写 TSDoc。
- Playwright 配置自动加载项目根目录 `.env`。系统和 CI 环境变量优先。
- `QA_ENV` 选择 `.env.<环境>` 文件，各环境文件使用相同变量名。
- UI 和 API 分别使用 `UI_BASE_URL` 与 `API_BASE_URL`。
- API 用 request fixture。独立 request 与 page 不共享 Cookie，需要时显式 storageState 或 page.request。
- 使用模板提供的 API、认证、唯一数据和 LIFO 清理 fixtures。
- 依赖使用 pnpm 从 pnpm-lock.yaml 安装。
- 脚本使用 Bun 执行。
- Playwright 运行在 Node.js 上。
- API 门禁使用 REQUIRE_API_TESTS=1。
- 用 unit、smoke、regression、integration 标签选择执行范围。
- CI 将重试后通过视为失败，生产写入默认拒绝。
- API-only 不引入浏览器，按[API 测试](../api-testing.md)确认的契约写断言。
- UI 用 locator 与 await expect(locator) 等待业务结果。期望响应或弹窗先注册等待再触发。
- 用独立 context、唯一数据和 fixture teardown 隔离。准备中途失败也清理，保留原错误。
- 认证状态只复用于不会产生服务端状态冲突的测试。共享账号有写入竞争时使用独立账号。
- 认证状态按角色管理且不提交。优先用`auth-setup` project生成 `playwright/.auth/<role>.json`。
- 同一用例切换角色使用 `loginAs` fixture，每个角色使用独立 context。
- 不通过 skip/fixme、删断言、放宽预期或提高重试掩盖失败。

## 说明

- 业务单元测试沿用项目现有栈。组件测试需对应适配。
- 单 worker 与并行对比只提供线索，不证明污染已修复。重试后通过按不稳定结果报告。
- 官方 Test Agents 为可选工具，使用前核对版本和真实 seed。

## 示例

命令及示例见[操作卡](typescript-recipes.md)，需要时读取。
仅装 Chromium 时显式 --project=chromium。先执行目标用例，再按影响回归。

## 参考

[Playwright 最佳实践](https://playwright.dev/docs/best-practices) ·
[自动等待](https://playwright.dev/docs/actionability) ·
[定位器](https://playwright.dev/docs/locators) ·
[Playwright 隔离](https://playwright.dev/docs/browser-contexts) ·
[Playwright 认证](https://playwright.dev/docs/auth) ·
[playwright-best-practices（专项模式）](https://www.skills.sh/currents-dev/playwright-best-practices-skill) ·
[tdd（先写失败用例）](https://www.skills.sh/mattpocock/skills/tdd)
