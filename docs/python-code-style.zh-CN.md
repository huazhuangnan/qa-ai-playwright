# Python 风格与架构

[使用人员](../README.md) | [维护人员](maintenance.zh-CN.md)

适用于 Python QA 项目。先读[公共架构与边界](code-style-architecture-common.zh-CN.md)。

适用对象：Python QA 项目开发与维护人员。阅读顺序：先读公共规则，再读本页风格、架构和最低检查。

## 风格

- 使用 pytest 承载测试，`requests` 处理 API，pytest-playwright 处理浏览器。
- 遵循 PEP 8。函数和变量使用 `snake_case`。类使用 `PascalCase`。常量使用 `UPPER_SNAKE_CASE`。
- 文件和目录使用小写。多词名称使用 `snake_case`。
- 公共 fixture、API 客户端、页面对象和复杂分支使用 docstring 与类型标注。
- 测试函数名称说明业务行为和结果，不使用序号名称。

## 架构

- fixture 通过 `conftest.py` 和 `tests/fixtures/` 注入。fixture 管理资源生命周期。测试函数只编排动作和断言。
- API 客户端和响应模型使用类型标注。外部响应先检查状态码，再读取业务字段。
- 浏览器测试使用 pytest-playwright 的 `page`、`browser_context` 等 fixture。
- 多角色切换使用 `login_as`，不共享可变会话。
- `pytest.ini` 集中定义测试目录、超时和 markers。测试类别使用 `unit`、`api`、`contract`、`integration`、`smoke` 和 `regression`。

## 最低检查

```bash
python -m pytest --strict-config --strict-markers
```

执行时使用项目 `.venv` 解释器。依赖从 `requirements.lock` 安装并执行哈希校验。
