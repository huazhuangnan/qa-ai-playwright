# TypeScript 风格与架构

[使用文档](README.md) | [维护文档](https://github.com/huazhuangnan/qa-ai-playwright/blob/main/docs/maintainers/README.md)

适用于 TypeScript QA 项目。先读[公共架构与边界](code-style-architecture-common.zh-CN.md)。

适用对象：TypeScript QA 项目开发与维护人员。阅读顺序：先读公共规则，再读本页风格、架构和最低检查。

## 风格

- 使用 Playwright Test 统一承载 API、功能和 E2E 测试。
- 开启 `strict` 和 `noUncheckedIndexedAccess`。禁止用 `any` 绕过契约。外部响应先做窄化或 schema 校验。
- 类型、接口和不可变配置使用 `PascalCase`。函数、fixture 和变量使用 `camelCase`。常量使用 `UPPER_SNAKE_CASE`。
- 文件和目录使用小写。目录多词使用 `kebab-case`，符号多词使用 `camelCase`。
- 公共 fixture、页面对象、API 客户端和复杂分支使用 TSDoc。
- TSDoc 说明用途、输入、输出、副作用和非显然约束。
- 复杂用例使用业务化 `test.step`，让准备、操作、断言和清理可读。
- 简单步骤不加逐行注释，复杂分支解释为什么和顺序。

## 架构

- fixture 通过 `test.extend` 注入。页面对象和 API 客户端通过 fixture 创建，避免隐式单例。
- 异步 Playwright 调用必须 `await`。跨页面业务流程使用业务化 `test.step`。
- `playwright.config.ts` 只负责运行器、项目依赖、报告和环境接入。业务流程放在 `tests/`。
- API 测试使用 request fixture。UI 测试使用 locator 和 `await expect` 等待业务结果。
- 多角色切换使用 `loginAs`，每个角色使用独立 context。

## 最低检查

```bash
pnpm typecheck
pnpm exec playwright test
```

模板使用 pnpm 管理依赖，使用 Bun 执行维护脚本，Playwright 运行在 Node.js 上。
