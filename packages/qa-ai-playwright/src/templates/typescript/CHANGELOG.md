# TypeScript 项目模板版本

## 0.0.1 - 2026-11-11

- 提供 Playwright Test 的单元、功能、API 和 E2E 模板。
- 提供依赖锁检查、认证、唯一数据、清理和生产写保护 fixture。
- 提供 `storageState` auth setup、多角色状态和 `loginAs` fixture。
- UI 与 API 地址分别配置，并保留 `BASE_URL` 回退。
- 支持可选本地 `webServer` 启动命令。
- 变量名统一登记到 `docs/qa/inputs/input-index.md`。
- GitHub Actions 区分快速验证、完整手动矩阵和手动 API 门禁。
- 示例测试补充业务说明、`test.step` 流程和失败时数据清理。
- CI 改用固定 runner 标签，避免浮动系统迁移。
