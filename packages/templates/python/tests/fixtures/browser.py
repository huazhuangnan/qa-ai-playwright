"""Select a compatible system browser for Chromium-based tests."""

import os
from typing import Any

import pytest


def browser_channel(value: str | None) -> str | None:
    """Validate the optional shared browser channel."""
    channel = (value or "").strip()
    if channel and channel not in {"chrome", "msedge"}:
        raise ValueError("QA_BROWSER_CHANNEL must be chrome or msedge")
    return channel or None


def browser_launch_options(channel_value: str | None, path_value: str | None) -> dict[str, str]:
    """Build optional system browser launch arguments without changing defaults."""
    channel = browser_channel(channel_value)
    executable_path = (path_value or "").strip()
    return {
        **({"channel": channel} if channel else {}),
        **({"executable_path": executable_path} if executable_path else {}),
    }


@pytest.fixture(scope="session")
def browser_type_launch_args(
    browser_type_launch_args: dict[str, Any], browser_name: str,
) -> dict[str, Any]:
    """Preserve plugin launch settings and select a channel for Chromium."""
    options = browser_launch_options(
        os.getenv("QA_BROWSER_CHANNEL"), os.getenv("QA_BROWSER_EXECUTABLE_PATH")
    )
    args = dict(browser_type_launch_args)
    if browser_name == "chromium":
        args.update(options)
    return args
