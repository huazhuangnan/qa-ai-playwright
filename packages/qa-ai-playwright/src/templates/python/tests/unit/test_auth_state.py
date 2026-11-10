"""Tests for role-aware authentication state helpers."""

from pathlib import Path

import pytest

from tests.fixtures.auth import (
    auth_credentials,
    auth_state_path,
    configured_auth_roles,
    normalize_auth_role,
)


@pytest.mark.unit
def test_configured_roles_are_unique():
    """Duplicate auth roles are removed without changing order."""
    assert configured_auth_roles({
        "QA_AUTH_ROLES": "admin,user,admin",
    }) == ["admin", "user"]


@pytest.mark.unit
def test_role_state_stays_in_ignored_auth_directory(tmp_path: Path):
    """Role state paths cannot be changed through the role name."""
    assert auth_state_path("admin", {}, tmp_path) == (
        tmp_path / "playwright/.auth/admin.json"
    ).resolve()


@pytest.mark.unit
def test_role_credentials_use_prefixed_environment_variables():
    """Role names map to predictable secret variable names."""
    assert auth_credentials("tenant-admin", {
        "QA_AUTH_TENANT_ADMIN_USERNAME": "admin@example.test",
        "QA_AUTH_TENANT_ADMIN_PASSWORD": "secret",
    }) == ("admin@example.test", "secret")


@pytest.mark.unit
def test_role_names_cannot_escape_the_auth_directory():
    """Path separators are rejected in role names."""
    with pytest.raises(RuntimeError, match="Invalid QA auth role"):
        normalize_auth_role("../admin")
