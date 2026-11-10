import pytest
from playwright.sync_api import Page, expect


@pytest.mark.smoke
def test_browser_smoke(page: Page):
    """本地内存页面校验浏览器安装，不依赖公网或业务服务。"""
    # Arrange: 创建只存在于当前 context 的页面。
    page.set_content('<button type="button">Ready</button>')
    # Assert: 验证浏览器能执行并等待用户可见结果。
    expect(page.get_by_role('button', name='Ready', exact=True)).to_be_visible()
