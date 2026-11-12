# 示例与 QA 工作流

- 全栈应用在 `apps/qa-ticket-app/`。TypeScript 和 Python QA 项目使用各自的 suite 目录。
- 业务需求、OpenAPI 和共享测试设计放在示例应用中。
- 各 QA 项目在自己的 `docs/qa/` 下维护任务、用例映射和执行报告。
- QA 通过 HTTP 和浏览器访问应用，不导入服务端业务实现。
- 交互验收、稳定 smoke 和自动回归分别组织。
- 输入支持 PRD、接口链接和 OpenAPI JSON/YAML。
- 业务理解、用例和执行证据必须可追踪。
- 用例记录步骤、可观察结果、清理和代码映射。
- 完整流程文档展示命令、输出和证据位置。
- TypeScript 和 Python 示例验证同一业务流程。
