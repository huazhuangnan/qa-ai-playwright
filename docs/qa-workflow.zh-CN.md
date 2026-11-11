# 从需求到执行

[使用人员](../README.md) | [维护人员](maintenance.zh-CN.md)

本仓库是 pnpm workspace。`apps/qa-ticket-app/` 是被测应用。`apps/qa-ticket-app-suite-typescript/` 与 `apps/qa-ticket-app-suite-python/` 是独立 QA 项目。`packages/qa-ai-playwright/src/` 包含 CLI、Skill 和生成模板。公共指南位于 `docs/`。

先阅读[AI 测试整体模型](ai-testing-model.zh-CN.md)了解 AI 的输入、职责路由、测试层级和证据闭环。本页补充一次具体任务如何落地。
## 输入与调用

1. 在 `docs/qa/inputs/input-index.md` 登记 PRD、验收标准、环境、角色和接口契约的来源及版本。不要记录凭证值。
2. 向 AI 描述目标、范围和测试环境。不熟悉业务时先使用 `qa-business-guide`，整理角色、状态、主流程、异常及待确认项。
3. API 任务使用 `qa-api`。提供接口文档页面、OpenAPI JSON/YAML 链接或本地文件。AI 读取相关操作、认证、参数、响应和引用，列出缺口。普通 JSON 样例不是完整契约。
4. 使用 `qa-test-design` 形成计划和用例。建立需求、接口操作、用例和执行结果的对应关系。待确认的预期不能当作已验证事实。
5. 选择 `qa-typescript` 或 `qa-python` 生成测试。代码说明业务目标和非显然约束。确认测试环境、写入授权和清理策略后执行。
6. 使用 `qa-triage` 记录命令、环境、实际结果和脱敏证据。失败、跳过与未执行分别记录。

## 工单示例

示例使用独立的应用和 QA 项目。先查看以下资料：

| 环节 | 文件 | 作用 |
| --- | --- | --- |
| 输入索引 | [input-index.md](examples/qa-ticket-app/inputs/input-index.md) | 定位需求、环境和契约 |
| 需求 | [requirements.md](examples/qa-ticket-app/inputs/requirements.md) | 工单角色、字段、状态和权限 |
| 接口契约 | [openapi.json](../apps/qa-ticket-app/src/server/openapi.json) | 请求、认证和响应定义 |
| 计划与用例 | [test-plan.md](examples/qa-ticket-app/generated/test-plan.md)、[test-cases.md](examples/qa-ticket-app/generated/test-cases.md) | 共享范围和可观察预期 |
| TypeScript 自动化 | [openapi.spec.ts](../apps/qa-ticket-app-suite-typescript/tests/api/openapi.spec.ts) | Playwright Test 契约与业务流程 |
| Python 自动化 | [test_ticket_flow.py](../apps/qa-ticket-app-suite-python/tests/test_ticket_flow.py) | pytest 契约与浏览器流程 |
| 历史报告 | [execution-report.md](examples/qa-ticket-app/generated/execution-report.md) | 先前结果，不能代替当前执行 |

选择 `apps/qa-ticket-app-suite-typescript/` 或 `apps/qa-ticket-app-suite-python/` 作为 AI 工作目录，可提供以下任务：

```text
读取 docs/examples/qa-ticket-app/inputs/input-index.md 中的需求和 OpenAPI 契约。
针对 POST /api/tickets，整理角色、输入、认证和预期状态码。
先对照需求列出待确认项，再检查现有测试和覆盖缺口。
只使用本地测试环境。运行契约测试，记录命令、结果、清理和证据路径。
```

该任务应关联需求中的标题长度和角色规则，及契约中的认证与响应。
当前自动化检查未认证返回 401，并用成员会话创建后清理工单。
创建响应的检查只覆盖契约中列出的关键必填字段，不代表完整 schema 校验。

OpenAPI 可以用于生成交互式文档页面，例如 Swagger UI。页面和 JSON/YAML 可以指向同一契约。文档渲染、生成测试和实际执行是不同步骤，任何一步都不能代替业务预期确认。

示例应用提供以下契约入口：

| 输入方式 | 地址或文件 |
| --- | --- |
| 文档页面 | `http://127.0.0.1:8787/api-docs` |
| OpenAPI 链接 | `http://127.0.0.1:8787/openapi.json` |
| 本地文件 | [openapi.json](../apps/qa-ticket-app/src/server/openapi.json) |

示例页面为只读页面，从同一 JSON 渲染。示例只对创建工单定义了较详细的响应字段。
其余操作的响应结构仍需补充，不能把示例称为完整契约验证。
参见 [TypeScript 示例](../apps/qa-ticket-app-suite-typescript/README.md)或 [Python 示例](../apps/qa-ticket-app-suite-python/README.md)的执行说明。
链接和页面需要应用服务正在运行。本地文件可离线读取。
手动查看页面时，按[应用运行说明](../apps/qa-ticket-app/README.md#本地运行)启动服务。
自动化测试会自己启动服务。运行测试前请停止手动启动的服务，避免端口冲突。

## 可观察的执行示例

先按[环境初始化](environment.zh-CN.md)准备工具并激活环境。
在仓库根目录安装锁定依赖：

```powershell
pnpm install --frozen-lockfile
```

TypeScript 示例安装 Chromium 后执行：

```powershell
pnpm --filter qa-ticket-app-suite-typescript exec playwright install chromium
```

进入 TypeScript 项目并执行：

```powershell
Set-Location .\apps\qa-ticket-app-suite-typescript
pnpm exec playwright test tests/api/openapi.spec.ts --project=chromium
pnpm run test:api
```

回到仓库根目录后，Python 示例使用哈希锁运行：

```powershell
Set-Location ..\..
Set-Location .\apps\qa-ticket-app-suite-python
uv venv .venv
uv pip sync requirements.lock --python .venv/Scripts/python.exe
.\.venv\Scripts\python.exe -m playwright install chromium
.\.venv\Scripts\python.exe -m pytest
```

示例测试只使用本机的 `127.0.0.1:5173` 和 `127.0.0.1:8787`。
Playwright 配置启动 API 和页面服务。
API 启动脚本在每次测试运行开始时重建 `.tmp/e2e.db`，该次运行中的用例共享此文件。
测试结束后服务停止。数据库文件保留，并在下一次运行开始时重建。
契约用例比较链接与本地 JSON，打开文档页，并验证匿名拒绝和创建工单。
创建的数据在测试结束时清理。其他 API 用例随后执行。

终端显示用例名称、结果和汇总。数量、耗时和端口依实际执行变化。
以下只是输出格式示意，不是执行记录：

```text
Running … tests using … workers
  ✓ … OpenAPI link, local file and rendered page agree
  ✓ … ticket creation follows the OpenAPI contract
  … passed
```

Python 示例会输出业务步骤：

```text
[STEP] 成员登录并创建工单
[STEP] 拒绝跨状态更新和旧版本覆盖
… passed
```

TypeScript 使用 `pnpm run report` 打开 HTML 报告。
两套项目的 JUnit 报告都位于各自目录的 `reports/junit.xml`。
失败时检查 `test-results/` 中按配置保留的 Trace、截图或视频。分享前先脱敏。
报告记录实际命令、退出状态、通过、失败、跳过数量及证据路径。跳过不计为覆盖。

## 项目接入时的缺口检查

| 检查项 | 需要确认的内容 |
| --- | --- |
| 需求与追踪 | PRD、验收标准和版本是否明确；规则是否关联用例与结果 |
| 契约与变更 | OpenAPI 与实际服务是否一致；变更是否影响已有用例 |
| 环境与数据 | 环境、角色权限、数据隔离、清理和外部依赖是否可用 |
| 执行与证据 | CI 门禁、跳过原因、失败证据、脱敏与保留期限是否明确 |
| 非功能需求 | 按业务确认性能、安全、可访问性和兼容性指标及负责人 |

现有模板提供基础机制，不代表所有业务项目已满足以上条件。
专项测试需要独立的范围和指标。普通功能测试不能代替专项评估。

参考：[OpenAPI 规范](https://spec.openapis.org/oas/) · [Swagger UI](https://swagger.io/open-source/swagger-ui/) · [Playwright 最佳实践](https://playwright.dev/docs/best-practices) · [OWASP 测试指南](https://owasp.org/projects/owasp-web-security-testing-guide/)
