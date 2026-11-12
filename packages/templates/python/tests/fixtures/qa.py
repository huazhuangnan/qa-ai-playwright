"""Shared fixtures for API access, data isolation, and cleanup."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
import os
from pathlib import Path
import re
import uuid
from typing import Any

import pytest
import requests
from playwright.sync_api import Browser, BrowserContext, Page

from tests.fixtures.auth import (
    normalize_auth_role,
    require_auth_state,
    selected_auth_role,
)


PRODUCTION_ENVIRONMENTS = {"prod", "production", "prd", "live"}
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))


def assert_write_access() -> None:
    """Reject production writes unless the project explicitly opts in."""
    environment = os.getenv("QA_ENV", "dev").strip().lower()
    allowed = os.getenv("QA_ALLOW_PRODUCTION_WRITES", "").strip().lower() == "true"
    if environment in PRODUCTION_ENVIRONMENTS and not allowed:
        raise RuntimeError(
            f"Writes are blocked for QA_ENV={environment}. "
            "Set QA_ALLOW_PRODUCTION_WRITES=true only with explicit approval."
        )


@dataclass
class CleanupRegistry:
    """Track cleanup actions and run them in reverse registration order."""

    actions: list[tuple[str, Callable[[], None]]] = field(default_factory=list)

    def register(self, label: str, action: Callable[[], None]) -> None:
        """Register a cleanup action immediately after creating test data."""
        self.actions.append((label, action))

    def run(self) -> None:
        """Run all cleanup actions and report every failure."""
        errors: list[str] = []
        for label, action in reversed(self.actions):
            try:
                action()
            except Exception as error:  # noqa: BLE001 - report all cleanup failures
                errors.append(f"{label}: {error}")
        if errors:
            raise RuntimeError("Cleanup failed: " + "; ".join(errors))


@dataclass
class ApiClient:
    """Minimal API client with base URL, authentication, and timeout."""

    session: requests.Session
    base_url: str
    timeout: float

    def request(self, method: str, path: str, **kwargs: Any) -> requests.Response:
        """Send one API request using the configured session."""
        if method.upper() not in {"GET", "HEAD", "OPTIONS"}:
            assert_write_access()
        kwargs.setdefault("timeout", self.timeout)
        return self.session.request(
            method,
            f"{self.base_url.rstrip('/')}/{path.lstrip('/')}",
            **kwargs,
        )

    def get(self, path: str, **kwargs: Any) -> requests.Response:
        """Send an authenticated GET request."""
        return self.request("GET", path, **kwargs)

    def post(self, path: str, **kwargs: Any) -> requests.Response:
        """Send a guarded authenticated POST request."""
        return self.request("POST", path, **kwargs)

    def patch(self, path: str, **kwargs: Any) -> requests.Response:
        """Send a guarded authenticated PATCH request."""
        return self.request("PATCH", path, **kwargs)

    def put(self, path: str, **kwargs: Any) -> requests.Response:
        """Send a guarded authenticated PUT request."""
        return self.request("PUT", path, **kwargs)

    def delete(self, path: str, **kwargs: Any) -> requests.Response:
        """Send a guarded authenticated DELETE request."""
        return self.request("DELETE", path, **kwargs)


@pytest.fixture
def cleanup_registry() -> Iterator[CleanupRegistry]:
    """Provide LIFO cleanup for data created by a test."""
    registry = CleanupRegistry()
    try:
        yield registry
    finally:
        registry.run()


@pytest.fixture
def unique_id(request: pytest.FixtureRequest) -> Callable[[str], str]:
    """Return a factory for identifiers unique to the current test."""
    node = re.sub(r"[^a-z0-9]+", "-", request.node.nodeid.lower()).strip("-")

    def build(prefix: str = "qa") -> str:
        return f"{prefix}-{node}-{uuid.uuid4().hex[:12]}"

    return build


@pytest.fixture
def require_write_access() -> Callable[[], None]:
    """Expose the production-write guard to destructive tests."""
    return assert_write_access


@pytest.fixture(scope="session")
def browser_context_args() -> dict[str, Any]:
    """Use the UI base URL and optional browser authentication state."""
    context_args: dict[str, Any] = {}
    ui_base_url = (
        os.getenv("UI_BASE_URL", "").strip()
    )
    if ui_base_url:
        context_args["base_url"] = ui_base_url

    if not os.getenv("QA_AUTH_STATE", "").strip() and not os.getenv(
        "QA_AUTH_ROLES", ""
    ).strip():
        return context_args

    context_args["storage_state"] = str(
        require_auth_state(selected_auth_role(), project_root=Path(PROJECT_ROOT))
    )
    return context_args


@pytest.fixture
def login_as(
    browser: Browser,
    browser_context_args: dict[str, Any],
) -> Iterator[Callable[[str], Page]]:
    """Open isolated pages with previously generated role states."""
    contexts: list[BrowserContext] = []

    def open_role(role: str) -> Page:
        context_args = dict(browser_context_args)
        context_args["storage_state"] = str(
            require_auth_state(
                normalize_auth_role(role),
                project_root=Path(PROJECT_ROOT),
            )
        )
        context = browser.new_context(**context_args)
        contexts.append(context)
        return context.new_page()

    try:
        yield open_role
    finally:
        for context in reversed(contexts):
            context.close()


@pytest.fixture
def qa_api() -> Iterator[ApiClient]:
    """Provide an authenticated API client for the selected environment."""
    base_url = (
        os.getenv("API_BASE_URL", "").strip()
    )
    if not base_url:
        message = "API_BASE_URL is not configured for the selected QA_ENV"
        if os.getenv("REQUIRE_API_TESTS", "").strip() == "1":
            pytest.fail(message)
        pytest.skip(message)

    timeout = float(os.getenv("QA_API_TIMEOUT", "15"))
    session = requests.Session()
    token = os.getenv("QA_API_TOKEN", "").strip()
    if token:
        header = os.getenv("QA_API_TOKEN_HEADER", "Authorization")
        scheme = os.getenv("QA_API_AUTH_SCHEME", "Bearer").strip()
        session.headers[header] = f"{scheme} {token}".strip()

    try:
        yield ApiClient(session=session, base_url=base_url, timeout=timeout)
    finally:
        session.close()
