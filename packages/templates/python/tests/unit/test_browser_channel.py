"""Validate browser channel selection without launching a browser."""

import pytest

from tests.fixtures.browser import browser_channel, browser_launch_options


@pytest.mark.unit
def test_browser_channel_selection():
    """Only the documented system browser channels are accepted."""
    assert browser_channel(None) is None
    assert browser_channel(" chrome ") == "chrome"
    assert browser_channel("msedge") == "msedge"
    with pytest.raises(ValueError, match="QA_BROWSER_CHANNEL"):
        browser_channel("other")


@pytest.mark.unit
def test_browser_executable_path():
    """An explicit path also supports a system Chromium build."""
    assert browser_launch_options(None, None) == {}
    assert browser_launch_options("chrome", "C:/Program Files/Chrome/chrome.exe") == {
        "channel": "chrome", "executable_path": "C:/Program Files/Chrome/chrome.exe"
    }
    assert browser_launch_options(None, "/custom/chromium") == {
        "executable_path": "/custom/chromium"
    }
