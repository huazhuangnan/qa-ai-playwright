# Python QA 操作卡

Windows 项目解释器为 .venv/Scripts/python.exe；macOS/Linux 为 .venv/bin/python。下面以 Windows 为例，工作目录是项目根目录。

```powershell
.venv\Scripts\python.exe -m pytest tests/functional -q
.venv\Scripts\python.exe -m pytest tests/api -q
.venv\Scripts\python.exe -m pytest -m smoke -q
.venv\Scripts\python.exe -m pytest -m regression -q
.venv\Scripts\python.exe -m pytest tests/e2e --browser chromium --tracing retain-on-failure --screenshot only-on-failure
.venv\Scripts\python.exe -m playwright show-trace test-results/实际目录/trace.zip
```

API 示例未配置 API_BASE_URL 或 BASE_URL 时会跳过；业务验收不能把跳过计为覆盖。requests 超时与 Playwright expect 超时分别处理，避免统一放大所有超时。
API 门禁设置 `REQUIRE_API_TESTS=1` 后，缺少 API_BASE_URL 和 BASE_URL 必须失败。
创建或修改数据的测试使用 `qa_cleanup`、`unique_id` 和 `require_write_access`。

```python
page.get_by_role('button', name='保存', exact=True).click()
expect(page.get_by_role('status')).to_have_text('保存成功')
```

示例预期来自假设页面，接入真实业务时核对需求。共享数据可导致顺序依赖；单独运行通过并不说明整套回归稳定。当前模板不默认启用并行或重试插件，不照搬 TS 的 workers/retries 参数。

复杂流程用注释和 docstring 说明业务目标。需要逐步输出时使用简洁上下文管理器或 pytest 日志，并在失败路径保留数据清理。

```python
def test_save_form(page):
    """提交合法表单后，用户能看到保存结果。"""
    # Arrange: 准备独立测试数据。
    page.get_by_label('名称').fill('测试数据')
    # Act: 执行用户动作。
    page.get_by_role('button', name='保存', exact=True).click()
    # Assert: 验证用户可观察结果。
    expect(page.get_by_role('status')).to_have_text('保存成功')
```

来源：[pytest fixture 清理](https://docs.pytest.org/en/stable/how-to/fixtures.html)、[Python Playwright](https://playwright.dev/python/docs/intro)、[requests 超时](https://requests.readthedocs.io/en/latest/user/quickstart/#timeouts)。
