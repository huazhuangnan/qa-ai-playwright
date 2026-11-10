"""Start the isolated example and provide authenticated test data cleanup."""

import os
import signal
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from uuid import uuid4

import pytest
import requests

from tests.support import API, APP, TIMEOUT, UI


def _ensure_ports_free():
    """Refuse to run against an already running or unrelated service."""
    for port in (5173, 8787):
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", port))
            except OSError as error:
                raise RuntimeError(
                    f"Local port {port} is occupied; stop the other service"
                ) from error


def _stop_process(process):
    """Terminate the process tree started by this suite."""
    if process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            check=False,
            capture_output=True,
        )
    else:
        os.killpg(process.pid, signal.SIGTERM)
    process.wait(timeout=15)


@pytest.fixture(scope="session", autouse=True)
def example_services():
    """Seed a temporary database, start both local services, then stop them."""
    _ensure_ports_free()
    with tempfile.TemporaryDirectory(prefix="qa-ticket-python-") as temporary:
        environment = {
            **os.environ,
            "NODE_ENV": "test",
            "PORT": "8787",
            "DATABASE_URL": str(Path(temporary) / "test.db"),
        }
        subprocess.run(
            ["bun", "run", "db:seed"],
            cwd=APP,
            env=environment,
            check=True,
            timeout=60,
        )
        options = (
            {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
            if os.name == "nt"
            else {"start_new_session": True}
        )
        process = subprocess.Popen(
            ["bun", "run", "dev"],
            cwd=APP,
            env=environment,
            **options,
        )
        try:
            deadline = time.monotonic() + 60
            while True:
                if process.poll() is not None:
                    raise RuntimeError("Example service exited before becoming ready")
                try:
                    api_ready = (
                        requests.get(
                            f"{API}/api/health",
                            timeout=1,
                        ).status_code
                        == 200
                    )
                    ui_ready = requests.get(UI, timeout=1).ok
                    if api_ready and ui_ready:
                        break
                except requests.RequestException:
                    pass
                if time.monotonic() >= deadline:
                    raise RuntimeError("Example services did not become ready")
                time.sleep(0.2)
            yield
        finally:
            _stop_process(process)


@pytest.fixture
def member():
    """Create a dedicated local member session for each test."""
    with requests.Session() as session:
        response = session.post(
            f"{API}/api/auth/login",
            json={"username": "alice", "password": "demo1234"},
            timeout=TIMEOUT,
        )
        assert response.status_code == 200
        yield session


@pytest.fixture
def ticket_title(member):
    """Track a unique title and remove any matching ticket after the test."""
    title = f"Python QA {uuid4().hex[:12]}"
    yield title
    response = member.get(
        f"{API}/api/tickets",
        params={"q": title, "pageSize": 50},
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    for ticket in response.json()["items"]:
        if ticket["title"] == title:
            deleted = member.delete(f"{API}/api/tickets/{ticket['id']}", timeout=TIMEOUT)
            assert deleted.status_code == 204
