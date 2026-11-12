---
name: qa-python
description: 为现有 Python QA 项目编写、运行和调试 pytest、requests、pytest-playwright 自动化；负责 fixture、会话、断言及命令的技术适配，设计和职责使用公共 QA Skills，不用于一般 Python 开发。
metadata:
  version: "0.0.1"
---

# Python QA 技术适配

先读项目 AGENTS.md、依赖、pytest 配置、conftest.py 和相关用例。按名称查找并读取 qa-core，再按任务查找职责 Skill。缺失时按项目引导安装，不伪造预期或结果。
实现前应用 Python 专属的命名、fixture 分层、docstring、类型标注和 pytest 门禁规则。仓库文档入口见 `docs/python-code-style.zh-CN.md`。

## 规则

- 遵循 Python 专属命名、fixture 分层、docstring、类型标注和 pytest 门禁规则。

- 使用项目 .venv 解释器，沿用同步/异步方案，不全局安装依赖。
- 生成测试用 docstring 说明业务目标和关键前置条件。用简洁注释标明复杂流程及预期，失败时也清理数据。
- 项目根目录 `conftest.py` 自动加载 `.env`。系统和 CI 环境变量优先。
- `QA_ENV` 选择 `.env.<环境>` 文件，各环境文件使用相同变量名。
- API 默认使用 `API_BASE_URL`，`BASE_URL` 仅作兼容回退。
- API 用 requests.Session fixture，显式超时并关闭 session。
- 认证由环境变量或 fixture 注入。requests 与浏览器不自动共享会话。
- 多角色 UI 状态用 `scripts/auth_state.py` 生成，同一用例用 `login_as` 隔离 context。
- 使用模板提供的 API、认证、唯一数据和 LIFO 清理 fixtures。
- 依赖从 requirements.lock 安装。API 门禁使用 REQUIRE_API_TESTS=1。
- 用 unit、smoke、regression、integration 标记选择执行范围。
- 测试进程默认设置超时，生产写入默认拒绝。
- 断言依据 qa-api 确认的契约，不假设每个响应都有 JSON 或业务码。
- 浏览器用 pytest-playwright 的 page fixture 和 expect 自动等待，沿用插件生命周期。
- 写数据用唯一标识。yield fixture 的 try/finally 覆盖失败步骤，准备中途也登记清理。
- 保留原测试错误，清理错误单独报告。
- 不通过删断言、跳过、放宽预期或提高重试掩盖失败。

## 说明

- 异步项目沿用既有插件/事件循环，不混用同步 fixture。
- 当前模板不默认安装并行/重试插件，不照搬 TS 的 workers/retries。
- 期望响应或新页面时先注册等待再触发动作。

## 示例

命令与排错例子见 [操作卡](references/recipes.md)，需要时读取。
先执行目标测试，再按影响回归。报告实际命令、结果和证据；无法执行就明确未验证。

## 参考

[pytest fixture 与清理](https://docs.pytest.org/en/stable/how-to/fixtures.html) ·
[requests 超时](https://requests.readthedocs.io/en/latest/user/quickstart/#timeouts) ·
[Python Playwright](https://playwright.dev/python/docs/intro) ·
[webapp-testing（Python 浏览器脚本）](https://www.skills.sh/anthropics/skills/webapp-testing)
