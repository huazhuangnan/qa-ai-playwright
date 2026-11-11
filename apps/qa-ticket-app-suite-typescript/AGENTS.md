# TypeScript QA Suite 约束

## 边界

- 被测应用位于 `../qa-ticket-app/`。
- 本目录只维护测试、fixtures 和 QA 文档。
- 专属任务、用例映射和执行报告放在本项目 `docs/qa/`。
- 两套示例共享的业务输入、计划和用例位于 `../qa-ticket-app/docs/qa/`。
- 测试通过 HTTP 和浏览器访问应用。
- 测试不导入示例应用的业务实现。

## 执行

- 新需求先更新 `../qa-ticket-app/docs/qa/`。
- 定位器优先 role、label 和可见文本。
- 独立用例使用独立页面和 API context。
- 复杂业务流程使用 `test.step` 记录操作与可观察结果。
- 写入使用唯一数据并登记清理。
- 实际结果区分通过、失败、跳过和未执行。

## 环境

- `QA_ENV` 选择 `.env.<环境>`。
- `UI_BASE_URL` 仅允许本地页面地址。
- `API_BASE_URL` 仅允许本地接口地址。
- 默认本地测试只写临时 SQLite 数据库。
