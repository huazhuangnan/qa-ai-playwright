import pytest


@pytest.mark.regression
def test_runtime():
    """验证本地测试运行器可执行，不代表业务功能通过。"""
    import requests
    from playwright.sync_api import expect
    assert callable(requests.Session)
    assert callable(expect)
