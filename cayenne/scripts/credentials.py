"""Harness-only Cayenne authentication credentials.

This module is never imported by the mobile application.  It accepts process
variables first, then the root-level ignored local file, and never logs values.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


AUTH_BLOCKED = "CAYENNE_AUTH_BLOCKED: Required Cayenne authentication credentials are unavailable."
_PLACEHOLDERS = {"", "changeme", "change-me", "example", "password", "your-password", "<password>"}
PROCESS_ENV = "PROCESS_ENV"
LOCAL_IGNORED_FILE = "LOCAL_IGNORED_FILE"
MISSING = "MISSING"


class CredentialsUnavailable(RuntimeError):
    """A safe, stable failure which never includes credential values."""


@dataclass(frozen=True, repr=False)
class CayenneCredentials:
    email: str
    password: str
    source: str

    def __repr__(self) -> str:
        return "CayenneCredentials(<redacted>)"


def _valid(email: str, password: str | None) -> bool:
    return bool(email and password is not None and email.lower() not in _PLACEHOLDERS and password.lower() not in _PLACEHOLDERS)


def _parse_local_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8-sig").splitlines()
    except OSError:
        return values
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() in {"CAYENNE_TEST_EMAIL", "CAYENNE_TEST_PASSWORD"}:
            values[key.strip()] = value
    return values


def load_cayenne_credentials(
    environ: dict[str, str] | None = None, root: Path | None = None
) -> CayenneCredentials:
    environment = os.environ if environ is None else environ
    email = (environment.get("CAYENNE_TEST_EMAIL") or "").strip()
    password = environment.get("CAYENNE_TEST_PASSWORD")
    # Password is intentionally not stripped or otherwise transformed.
    if _valid(email, password):
        declared_source = environment.get("CAYENNE_CREDENTIAL_SOURCE")
        source = declared_source if declared_source in {PROCESS_ENV, LOCAL_IGNORED_FILE} else PROCESS_ENV
        return CayenneCredentials(email=email, password=password, source=source)

    repository_root = root or Path(__file__).resolve().parents[2]
    local = _parse_local_file(repository_root / ".env.cayenne.local")
    email = (local.get("CAYENNE_TEST_EMAIL") or "").strip()
    password = local.get("CAYENNE_TEST_PASSWORD")
    if _valid(email, password):
        return CayenneCredentials(email=email, password=password, source=LOCAL_IGNORED_FILE)
    raise CredentialsUnavailable(AUTH_BLOCKED)
