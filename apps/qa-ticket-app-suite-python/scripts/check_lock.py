"""Validate the hashed dependency lock and its source baseline."""

import hashlib
import json
from pathlib import Path
import sys


def file_digest(path: Path) -> str:
    """Return the SHA256 digest for one file."""
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main() -> int:
    """Fail when the lock or baseline metadata is missing or stale."""
    root = Path(__file__).resolve().parents[1]
    lock = root / "requirements.lock"
    source = root / "requirements.in"
    metadata = root / "requirements.lock.meta.json"
    if not lock.is_file() or not metadata.is_file():
        print("requirements lock files are missing", file=sys.stderr)
        return 1
    if "hashes" not in lock.read_text(encoding="utf-8"):
        print("requirements.lock must contain package hashes", file=sys.stderr)
        return 1
    expected = json.loads(metadata.read_text(encoding="utf-8")).get(
        "requirements_in_sha256"
    )
    if expected != file_digest(source):
        print("requirements.in changed; regenerate the lock", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
