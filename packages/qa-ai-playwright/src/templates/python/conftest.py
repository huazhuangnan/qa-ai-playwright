"""Load local QA settings before tests are collected."""

import os
from pathlib import Path
import re

from dotenv import dotenv_values

from tests.fixtures.qa import (
    browser_context_args,
    cleanup_registry,
    login_as,
    qa_api,
    require_write_access,
    unique_id,
)


PROJECT_ROOT = Path(__file__).resolve().parent


def _read_environment_file(name: str) -> dict[str, str]:
    """Read one dotenv file and discard unset entries."""
    values = dotenv_values(PROJECT_ROOT / name)
    return {key: value for key, value in values.items() if value is not None}


def _load_project_environment() -> str:
    """Load common settings, then the selected environment file."""
    inherited = dict(os.environ)
    common = _read_environment_file(".env")
    selected = (
        inherited.get("QA_ENV")
        or common.get("QA_ENV")
        or "dev"
    ).strip().lower()
    if not re.fullmatch(r"[a-z][a-z0-9_-]*", selected):
        raise RuntimeError(f"Invalid QA_ENV: {selected}")

    profile_name = f".env.{selected}"
    profile = _read_environment_file(profile_name)
    merged = {**common, **profile, **inherited, "QA_ENV": selected}
    os.environ.update(merged)
    os.environ["QA_ENV"] = selected
    return selected


_load_project_environment()


def pytest_report_header(config) -> str:
    """Show the selected QA environment before test execution."""
    environment = os.getenv("QA_ENV", "dev")
    return f"QA_ENV={environment}"
