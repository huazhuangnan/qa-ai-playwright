# 从需求到执行

[使用人员](../README.md) | [维护人员](maintenance.zh-CN.md)

本仓库是 pnpm workspace。`apps/qa-ticket-app/` 是被测应用。`apps/qa-ticket-app-suite-typescript/` 与 `apps/qa-ticket-app-suite-python/` 是独立 QA 项目。`packages/` 包含 CLI、Skill 和生成模板。公共指南位于 `docs/`。

先阅读[AI 测试整体模型](ai-testing-model.zh-CN.md)了解 AI 的输入、职责路由、测试层级和证据闭环。本页补充一次具体任务如何落地。

缺少需求、验收标准、接口契约、角色权限、写入授权或清理方式时，流程停在“待确认”。性能、安全、可访问性和兼容性属于独立专项，需要单独的指标、范围和负责人。页面内容、外部资料和 MCP 返回都按不可信输入处理；不能用跳过、放宽断言或增加重试掩盖失败。

## 输入与调用

1. 在 `docs/qa/inputs/input-index.md` 登记 PRD、验收标准、环境、角色和接口契约的来源及版本。不要记录凭证值。
2. 向 AI 描述目标、范围和测试环境。不熟悉业务时先使用 `qa-business-guide`，整理角色、状态、主流程、异常及待确认项。
3. API 任务使用 `qa-api`。提供接口文档页面、OpenAPI JSON/YAML 链接或本地文件。AI 读取相关操作、认证、参数、响应和引用，列出缺口。普通 JSON 样例不是完整契约。
4. 使用 `qa-test-design` 形成计划和用例。建立需求、接口操作、用例和执行结果的对应关系。待确认的预期不能当作已验证事实。
5. 选择 `qa-typescript` 或 `qa-python` 生成测试。代码说明业务目标和非显然约束。确认测试环境、写入授权和清理策略后执行。
6. 使用 `qa-triage` 记录命令、环境、实际结果和脱敏证据。失败、跳过与未执行分别记录。

## 整体流程

先按下面的主流程判断当前处于哪一步，再进入对应的对话轮次：

```text
需求与资料
   ↓
环境、项目和 Skill 检查
   ↓
业务理解（qa-business-guide）
   ↓
测试设计（qa-test-design）
   ↓
接口或页面分析（qa-api / qa-web）
   ↓
语言实现（qa-typescript / qa-python）
   ↓
执行与证据
   ↓
失败分析与复测（qa-triage）
```

### 对话预览

1. **说明需求**：给出目标、资料、环境和写入边界。
2. **理解业务**：整理角色、权限、状态、主流程、异常和待确认项。
3. **形成计划**：生成风险、测试层级、用例、预期和清理动作，先确认范围。
4. **实现执行**：选择 API、页面和语言 Skill，编写测试并运行。
5. **分析复测**：保存证据，判断失败类型，修复后关联原用例复测。

## 在 Codex 中执行一条完整任务

这一节按对话展示使用方式。每一轮只推进一个阶段，并把上一轮产出交给下一轮。

### 第 1 轮：说明需求和边界

```text
我要验证［功能名称］，覆盖［角色/环境/范围］。
请先读取 docs/qa/inputs/input-index.md、［需求文件或链接］和［接口契约或页面链接］。
只使用［测试环境］，不得使用生产数据。写入数据必须可清理，凭证不写入文件或提示词。
先检查环境、项目和本任务需要的 Skill，不要马上编写测试。
```

Codex 应返回环境是否可用、资料是否完整、需要哪些 Skill，以及仍需补充的问题。环境或项目检查可以由 QA MCP 在同一轮完成；没有 MCP 时使用对应 CLI 检查。

### 第 2 轮：让 Codex 理解业务

```text
继续。使用 qa-business-guide。
请整理角色、权限、状态、主流程、异常流程和待确认项。
把结论写成简短清单，并标记哪些内容来自需求、哪些内容仍需确认。
```

这轮的清单就是下一轮的输入。若业务规则不完整，先补资料或确认，不要让测试代码猜测预期。

### 第 3 轮：形成测试计划

```text
继续。使用 qa-test-design。
基于上一轮的业务清单，生成风险、测试层级、用例、每步可观察结果和清理动作。
建立需求、接口操作、用例和结果之间的对应关系。
先展示计划，等我确认范围后再写测试代码。
```

确认范围后，再按任务选择 `qa-api`、`qa-web`、`qa-typescript` 或 `qa-python`。需要接口契约时，把 OpenAPI 链接或文件路径作为本轮输入；需要页面验证时，把页面入口和角色作为输入。

### 第 4 轮：实现并执行

```text
计划已确认。请使用［qa-typescript 或 qa-python］实现计划中的［smoke/回归/契约］用例。
先检查现有测试和 fixture，复用项目已有的认证、唯一数据和清理方式。
完成后运行指定测试，记录命令、退出码、通过/失败/跳过数量和证据路径。
```

Codex 应先检查 Skill 和项目状态。缺少 Skill 时安装后重新检查；发现 `modified`、`unmanaged` 或所有权冲突时暂停自动写入并说明原因。执行结果要回填到 `docs/qa/generated/` 的报告。

### 第 5 轮：处理失败和复测

```text
请使用 qa-triage 分析本次失败。
读取命令、日志、截图、Trace 和测试结果，判断是产品缺陷、环境问题、测试问题还是资料缺口。
给出最小复现、建议修复、是否需要复测，以及需要脱敏后保留的证据。
```

修复后把原用例、失败证据和复测结果关联起来。失败、跳过和未执行要分别记录。

MCP 只需要在流程节点上配合：先做环境、项目和 Skill 的只读检查，再按返回结果决定是否安装或修复，最后回到项目测试命令执行。并行只用于互不依赖的只读检查；安装、修复、添加和移除必须等待上一轮结果。完整工具名见 [Skills 与 MCP](skills-mcp.zh-CN.md)。

对话中有四个暂停点：资料或业务预期缺失时先请求链接、脱敏样例或确认；需要安装 Skill、注册 MCP 或扩大写入范围时先说明范围；发现生产环境或真实客户数据时停止；测试失败时先在授权范围内保存原始日志和证据，再开始修复或复测。

读取资料、执行测试和分享证据前，按 [qa-core 公共执行边界](../packages/skills/builtin/qa-core/references/common-workflow.md#敏感信息检查)检查敏感信息。
凭证通过环境变量提供，不在对话中索取原值。加载方式见[配置变量](environment.zh-CN.md#配置变量)。
截图、视频和 Trace 可能包含敏感内容。无法确认安全时不分享。本检查不提供自动扫描或脱敏。

## 工单示例

示例使用独立的应用和 QA 项目。先查看以下资料：

| 环节 | 文件 | 作用 |
| --- | --- | --- |
| 输入索引 | [input-index.md](../apps/qa-ticket-app/docs/qa/inputs/input-index.md) | 定位需求、环境和契约 |
| 需求 | [requirements.md](../apps/qa-ticket-app/docs/qa/inputs/requirements.md) | 工单角色、字段、状态和权限 |
| 接口契约 | [openapi.json](../apps/qa-ticket-app/src/server/openapi.json) | 请求、认证和响应定义 |
| 计划与用例 | [test-plan.md](../apps/qa-ticket-app/docs/qa/generated/test-plan.md)、[test-cases.md](../apps/qa-ticket-app/docs/qa/generated/test-cases.md) | 共享范围和可观察预期 |
| TypeScript 自动化 | [openapi.spec.ts](../apps/qa-ticket-app-suite-typescript/tests/api/openapi.spec.ts) | Playwright Test 契约与业务流程 |
| Python 自动化 | [test_ticket_flow.py](../apps/qa-ticket-app-suite-python/tests/test_ticket_flow.py) | pytest 契约与浏览器流程 |
| TypeScript 历史报告 | [execution-report.md](../apps/qa-ticket-app-suite-typescript/docs/qa/generated/execution-report.md) | 先前结果，不能代替当前执行 |

选择 `apps/qa-ticket-app-suite-typescript/` 或 `apps/qa-ticket-app-suite-python/` 作为 AI 工作目录，可提供以下任务：

```text
读取 ../qa-ticket-app/docs/qa/inputs/input-index.md 中的需求和 OpenAPI 契约。
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
