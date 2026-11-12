# Python QA 技术适配

先读项目 AGENTS.md、依赖、pytest 配置、conftest.py 和相关用例。
公共执行边界和测试设计由 `qa-core` 按需加载。缺失时按项目引导，不伪造预期或结果。
实现前应用 Python 专属的命名、fixture 分层、docstring、类型标注和 pytest 门禁规则。
常用命令见[操作卡](python-recipes.md)。
生成代码前读取并按需应用[docstring、流程注释和可维护结构规则](../generated-code-quality.md)。

## 规则

- 遵循 Python 专属命名、fixture 分层、docstring、类型标注和 pytest 门禁规则。

- 使用项目 .venv 解释器，沿用同步/异步方案，不全局安装依赖。
- 生成前检查现有测试、fixture 和启动脚本。用户要求自动测试时先运行最小基线或目标用例，生成后按确认范围运行新增用例。
- 生成测试用 docstring 说明业务目标和关键前置条件。复杂流程用简短注释标明准备、操作、断言和清理，失败时也清理数据。
- 项目根目录 `conftest.py` 自动加载 `.env`。系统和 CI 环境变量优先。
- `QA_ENV` 选择 `.env.<环境>` 文件，各环境文件使用相同变量名。
- API 默认使用 `API_BASE_URL`。
- API 用 requests.Session fixture，显式超时并关闭 session。
- 认证由环境变量或 fixture 注入。requests 与浏览器不自动共享会话。
- 多角色 UI 状态用 `scripts/auth_state.py` 生成，同一用例用 `login_as` 隔离 context。
- 认证状态只复用于不会产生服务端状态冲突的测试。共享账号有写入竞争时使用独立账号。
- 使用模板提供的 API、认证、唯一数据和 LIFO 清理 fixtures。
- 依赖从 requirements.lock 安装。API 门禁使用 REQUIRE_API_TESTS=1。
- 用 unit、smoke、regression、integration 标记选择执行范围。
- 测试进程默认设置超时，生产写入默认拒绝。
- 断言依据[API 测试](../api-testing.md)确认的契约，不假设每个响应都有 JSON 或业务码。
- 浏览器用 pytest-playwright 的 page fixture 和 expect 自动等待，沿用插件生命周期。
- 写数据用唯一标识。yield fixture 的 try/finally 覆盖失败步骤，准备中途也登记清理。
- 保留原测试错误，清理错误单独报告。
- 不通过删断言、跳过、放宽预期或提高重试掩盖失败。

## 说明

- 异步项目沿用既有插件/事件循环，不混用同步 fixture。
- 当前模板不默认安装并行/重试插件，不照搬 TS 的 workers/retries。
- 期望响应或新页面时先注册等待再触发动作。

## 示例

命令与排错例子见 [操作卡](python-recipes.md)，需要时读取。
先执行目标测试，再按影响回归。报告实际命令、结果和证据；无法执行就明确未验证。

## 参考

[pytest fixture 与清理](https://docs.pytest.org/en/stable/how-to/fixtures.html) ·
[requests 超时](https://requests.readthedocs.io/en/latest/user/quickstart/#timeouts) ·
[Python Playwright](https://playwright.dev/python/docs/intro) ·
[webapp-testing（Python 浏览器脚本）](https://www.skills.sh/anthropics/skills/webapp-testing)
