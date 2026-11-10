# Python QA 模板版本

## 0.0.1 - 2026-11-11

- 提供 pytest、requests 和 pytest-playwright 测试模板。
- 提供依赖哈希锁、认证、数据隔离、清理和写保护 fixture。
- 提供多角色 `storageState` 生成脚本和 `login_as` fixture。
- 环境示例区分基础变量与项目变量。
- UI 与 API 地址分别配置，并保留 `BASE_URL` 回退。
- 变量名统一登记到 `docs/qa/inputs/input-index.md`。
- GitHub Actions 区分快速验证、完整夜间矩阵和手动 API 门禁。
- 示例测试补充业务 docstring、流程注释和失败时数据清理。
