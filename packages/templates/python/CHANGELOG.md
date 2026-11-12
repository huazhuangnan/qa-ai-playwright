# Python QA 模板版本

## 未发布

- 支持通过 `QA_BROWSER_CHANNEL` 和 `QA_BROWSER_EXECUTABLE_PATH` 为 Chromium 测试和登录态生成选择已有 Chrome、Edge 或 Chromium。
- 将 Skill 安装引导更新至官方安装器 1.8.1。

## 0.0.1 - 2026-11-11

- 更新 QA 启动器和 Skill 来源路径。

- 增加测试前 QA 环境检查、初始化和复查引导。

- 提供 pytest、requests 和 pytest-playwright 测试模板。
- 提供依赖哈希锁、认证、数据隔离、清理和写保护 fixture。
- 提供多角色 `storageState` 生成脚本和 `login_as` fixture。
- 环境示例区分基础变量与项目变量。
- UI 与 API 地址分别配置。
- 变量名统一登记到 `docs/qa/inputs/input-index.md`。
- GitHub Actions 区分快速验证、完整手动矩阵和手动 API 门禁。
- 示例测试补充业务 docstring、流程注释和失败时数据清理。
- 补充 Python 测试分层、fixture 生命周期、命名和类型标注约定。
- 补充 AI 按 Python 语言读取风格与架构规则的路由说明。
- Python 依赖锁改为 universal 解析，CI 强制校验哈希。
- CI 改用固定 runner 标签，避免浮动系统迁移。
