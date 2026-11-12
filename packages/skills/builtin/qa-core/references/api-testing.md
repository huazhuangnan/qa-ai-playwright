# API 与服务交互测试

先应用 `qa-core` 已加载的公共执行边界。
需要设计用例时读取[测试设计](test-design.md)。
需要自动化时按项目语言读取[TypeScript](automation/typescript.md)或[Python](automation/python.md)。

## 规则

- 契约来源为需求、OpenAPI 或确认的接口文档，实际响应只是观察。
- 支持用户提供 API 文档页面、OpenAPI JSON/YAML 链接或本地文件。先确认来源、版本、环境和访问范围。
- 按输入实际版本解析 OpenAPI，不默认固定版本或字段能力。最新版是 3.2.1。
- 文档页面若引用 OpenAPI 定义，读取该定义及任务所需的授权引用。普通请求响应 JSON 只是样例，不等同完整契约。
- 有源码时检查路由、中间件、认证、校验、schema、错误映射和数据访问。源码用于发现候选行为，不覆盖正式契约。
- 现有接口测试、OpenAPI 和实现冲突时分别记录来源，不静默选择。
- 提取目标接口、参数、认证、状态码和 schema，标记缺失规则及契约与实现的差异。不得仅凭 schema 宣称业务覆盖。
- 检查合法/缺失/边界/类型错误输入的状态码、响应类型、结构和业务字段。
- 检查 method、路径编码、query、header、content type、字符集、响应 envelope 和错误结构。
- 列表接口检查分页、游标、过滤、排序、总数、边界页和数据变化后的结果。
- 契约演变更新的版本、未知字段、可选字段和向后兼容，使用已有客户端或契约测试验证。
- 消费者驱动契约只覆盖消费者实际使用的交互，不能替代真实提供方集成。
- 验证未认证、角色与资源归属、跨账号操作，拒绝后没有意外写入。
- 检查创建/更新/删除的可观察副作用与幂等约定。
- 为每个 API 用例记录 method、path、角色、脱敏参数、状态码、content type、schema、关键业务字段、错误码、correlation ID 和副作用。
- 异步接口明确轮询条件、超时、最终一致性窗口和失败证据；请求与响应证据关联 CASE-ID、STEP-ID、ASSERT-ID 和 RUN-ID。
- 用唯一数据与独立会话，显式设置网络超时。失败也清理并校验结果。
- 独立 HTTP 客户端与浏览器不默认共享认证。
- API 门禁开启时，未配置环境或未实际执行不能计为覆盖。
- 使用共享 API fixture、认证变量、唯一数据和 LIFO 清理。
- 需要启动本地接口时按[源码与本地运行发现](project-discovery.md)定位项目命令、健康检查、依赖和清理方式。
- 没有服务可交付计划或草稿，标注未执行。API-only 无需浏览器。

## 说明

- 权限功能验证不等于完整安全审计。
- Mock/契约通过不能证明真实集成或完整 E2E 通过。
- 第三方服务只验证自己控制的边界，外部站点和真实副作用按需求使用 mock、沙箱或授权环境。
- 服务间调用说明真实依赖和替身范围。

## 示例

生成前按[输入清单](input-checklist.md)提醒补充资料：API 文档链接、OpenAPI/Swagger 或脱敏请求响应 JSON、认证方式、角色和状态码。
项目使用 `docs/qa` 时，将产物写入 `docs/qa/generated/`。失败分析读取[失败分析](triage.md)。

```text
契约: POST /orders 需要 Bearer Token，缺 Token 返回 401，成功返回 201 与订单号。

用例 API-001 创建订单
  前置: 已取得最小权限 Token，订单体符合契约
  步骤: POST /orders，携带合法 Token 与订单体
  预期: 状态码 201，响应含 orderId 且可再次查询到
  清理: 删除该订单并确认删除成功

用例 API-002 缺 Token
  前置: 不携带 Authorization
  步骤: POST /orders
  预期: 状态码 401，响应符合契约，未产生订单
  清理: 无需清理
```

## 参考

[Playwright API 测试](https://playwright.dev/docs/api-testing) ·
[OpenAPI Specification](https://spec.openapis.org/oas/latest.html) ·
[Pact 消费者驱动契约](https://docs.pact.io/) ·
[requests 超时](https://requests.readthedocs.io/en/latest/user/quickstart/#timeouts) ·
[webapp-testing（服务生命周期）](https://www.skills.sh/anthropics/skills/webapp-testing)
