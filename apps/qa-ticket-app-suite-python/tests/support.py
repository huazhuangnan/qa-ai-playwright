"""Shared local service addresses and test-flow logging."""

from contextlib import contextmanager
from pathlib import Path

APP = Path(__file__).resolve().parents[2] / "qa-ticket-app"
API = "http://127.0.0.1:8787"
UI = "http://127.0.0.1:5173"
TIMEOUT = 5


@contextmanager
def step(action):
    """Make one business step visible in captured pytest output."""
    print(f"\n[STEP] {action}")
    yield
