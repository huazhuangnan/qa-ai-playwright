# QA Ticket App 约束

## 流程

- 示例应用和 QA 测试分目录维护。
- 共享 QA 文档位于 `../../docs/examples/qa-ticket-app/`。
- TypeScript 自动化位于 `../qa-ticket-app-suite-typescript/`。
- Python 自动化位于 `../qa-ticket-app-suite-python/`。
- 需求或预期变化时，先更新 QA 文档，再修改实现。
- 未执行结果写“未执行”，不写“通过”。

## 技术

- Hono 提供 API。
- Drizzle 管理 SQLite schema。
- React 和 Vite 构建前端。
- shadcn/ui 组件源码放入 `src/client/components/ui/`。
- 示例应用使用 TypeScript。
- TypeScript 使用 TSDoc 或清楚的维护注释。

## 边界

- 示例凭证只用于本地隔离环境。
- 生产写入默认禁止。
- 测试使用独立临时数据库。
- 测试通过 HTTP 或浏览器访问示例应用。
- 测试不导入服务端业务实现。

## 交互

- 首次验收按交互模式执行。
- 已有稳定用例进入自动回归。
- 只在范围、写入和业务预期不明确时暂停确认。
