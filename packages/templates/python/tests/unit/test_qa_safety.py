"""Tests for shared QA safety helpers."""

import pytest

from tests.fixtures.qa import CleanupRegistry, assert_write_access


@pytest.mark.unit
def test_production_writes_require_explicit_opt_in(monkeypatch):
    """Production writes fail closed unless explicitly enabled."""
    monkeypatch.setenv("QA_ENV", "prod")
    monkeypatch.delenv("QA_ALLOW_PRODUCTION_WRITES", raising=False)
    with pytest.raises(RuntimeError, match="Writes are blocked"):
        assert_write_access()

    monkeypatch.setenv("QA_ALLOW_PRODUCTION_WRITES", "true")
    assert_write_access()


@pytest.mark.unit
def test_cleanup_runs_in_reverse_order():
    """Cleanup dependencies are removed in LIFO order."""
    calls = []
    registry = CleanupRegistry()
    registry.register("first", lambda: calls.append("first"))
    registry.register("second", lambda: calls.append("second"))
    registry.run()
    assert calls == ["second", "first"]
