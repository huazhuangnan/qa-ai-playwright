# 公共架构与边界

这部分规则同时适用于 Python 和 TypeScript QA 项目。

## 分层

```text
测试用例（unit / api / functional / e2e）
        ↓
fixtures 与页面或 API 辅助
        ↓
环境配置、认证状态、数据工厂与清理
        ↓
被测系统的 HTTP 或浏览器边界
```

- `tests/api/` 只验证 HTTP 接口和契约。
- `tests/functional/` 验证跨接口业务动作，不导入服务端实现。
- `tests/e2e/` 验证浏览器可观察行为，不用 API 断言替代 UI 断言。
- `tests/unit/` 只放测试项目自身的纯辅助逻辑。
- `tests/fixtures/` 提供认证、请求、唯一数据、写保护和清理能力。
- 页面对象、API 客户端和数据工厂按领域拆分。跨领域公共逻辑才进入 `tests/support/` 或等价目录。

## 依赖方向

- 测试用例只能依赖 fixture、辅助层和公开的 HTTP/浏览器边界。
- fixture 不反向导入具体测试文件。
- 测试项目不导入 `apps/qa-ticket-app` 的服务端实现。
- 配置、认证、URL 和业务数据通过集中入口读取。

## 数据和证据

- 测试不创建全局可变状态。
- 写入数据必须唯一，并在 teardown 或 fixture 清理。
- 生产写入默认拒绝。写入测试需要授权、隔离和回收方式。
- 断言验证可观察结果、接口契约或清理结果。
- 测试名称说明业务行为和结果，不使用 `test_1`、`case_a` 等序号名称。
- 选择器优先 role、label 和 test id。禁止固定 sleep、深层 CSS 和用重试掩盖就绪问题。
- 公共辅助必须有维护性注释。TypeScript 使用 TSDoc，Python 使用 docstring。
