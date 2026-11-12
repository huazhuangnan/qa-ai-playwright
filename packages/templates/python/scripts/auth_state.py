"""Generate ignored browser storage state files for configured QA roles."""

from __future__ import annotations

import os
from pathlib import Path
import re
import sys

from dotenv import dotenv_values
from playwright.sync_api import expect, sync_playwright


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from tests.fixtures.auth import (  # noqa: E402
    auth_credentials,
    auth_state_path,
    configured_auth_roles,
)
from tests.fixtures.browser import browser_launch_options  # noqa: E402


def read_environment_file(name: str) -> dict[str, str]:
    """Read one dotenv file and discard unset entries."""
    values = dotenv_values(PROJECT_ROOT / name)
    return {key: value for key, value in values.items() if value is not None}


def load_project_environment() -> None:
    """Apply the same environment precedence as conftest.py."""
    inherited = dict(os.environ)
    common = read_environment_file(".env")
    selected = (
        inherited.get("QA_ENV")
        or common.get("QA_ENV")
        or "dev"
    ).strip().lower()
    if not re.fullmatch(r"[a-z][a-z0-9_-]*", selected):
        raise RuntimeError(f"Invalid QA_ENV: {selected}")

    profile = read_environment_file(f".env.{selected}")
    os.environ.update({**common, **profile, **inherited, "QA_ENV": selected})


def main() -> int:
    """Authenticate every configured role and save its storage state."""
    load_project_environment()
    roles = configured_auth_roles()
    if not roles:
        print("QA_AUTH_ROLES is empty; no auth state generated.", file=sys.stderr)
        return 2

    base_url = (
        os.getenv("UI_BASE_URL", "").strip()
    )
    login_path = os.getenv("QA_AUTH_LOGIN_PATH", "/login").strip()
    username_selector = os.getenv("QA_AUTH_USERNAME_SELECTOR", "").strip()
    password_selector = os.getenv("QA_AUTH_PASSWORD_SELECTOR", "").strip()
    submit_selector = (
        os.getenv("QA_AUTH_SUBMIT_SELECTOR", "").strip()
        or 'button[type="submit"]'
    )
    success_selector = os.getenv("QA_AUTH_SUCCESS_SELECTOR", "").strip()
    success_url = os.getenv("QA_AUTH_SUCCESS_URL", "").strip()
    if not base_url or not username_selector or not password_selector:
        raise RuntimeError(
            "UI_BASE_URL, QA_AUTH_USERNAME_SELECTOR and "
            "QA_AUTH_PASSWORD_SELECTOR are required"
        )
    if not success_selector and not success_url:
        raise RuntimeError(
            "QA_AUTH_SUCCESS_SELECTOR or QA_AUTH_SUCCESS_URL is required"
        )

    with sync_playwright() as playwright:
        options = browser_launch_options(
            os.getenv("QA_BROWSER_CHANNEL"), os.getenv("QA_BROWSER_EXECUTABLE_PATH")
        )
        browser = playwright.chromium.launch(**options)
        try:
            for role in roles:
                username, password = auth_credentials(role)
                context = browser.new_context(base_url=base_url)
                page = context.new_page()
                page.goto(login_path)
                page.locator(username_selector).fill(username)
                page.locator(password_selector).fill(password)
                page.locator(submit_selector).click()
                if success_selector:
                    expect(page.locator(success_selector)).to_be_visible()
                else:
                    page.wait_for_url(success_url)

                state_path = auth_state_path(role)
                state_path.parent.mkdir(parents=True, exist_ok=True)
                context.storage_state(
                    path=str(state_path),
                    indexed_db=(
                        os.getenv("QA_AUTH_INDEXED_DB", "").strip().lower()
                        == "true"
                    ),
                )
                context.close()
                print(f"Saved {role} auth state: {state_path.relative_to(PROJECT_ROOT)}")
        finally:
            browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
