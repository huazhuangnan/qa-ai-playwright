"""Validate the generated Python dependency lock and source baseline."""

import hashlib
import json
from pathlib import Path
import sys


def file_digest(path: Path) -> str:
    """Return the SHA256 digest for a file."""
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main() -> int:
    """Validate the lock file and its requirements.in baseline."""
    root = Path(__file__).resolve().parents[1]
    lock = root / "requirements.lock"
    source = root / "requirements.in"
    metadata = root / "requirements.lock.meta.json"
    if not lock.is_file():
        print("requirements.lock is missing; rerun project init.", file=sys.stderr)
        return 1
    if not metadata.is_file():
        print(
            "requirements.lock.meta.json is missing; regenerate the lock.",
            file=sys.stderr,
        )
        return 1

    expected = json.loads(metadata.read_text(encoding="utf-8")).get(
        "requirements_in_sha256"
    )
    if expected != file_digest(source):
        print(
            "requirements.in changed; regenerate requirements.lock.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
