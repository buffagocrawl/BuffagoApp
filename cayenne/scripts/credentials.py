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
INHERITED_ENVIRONMENT = "inherited_environment"
IGNORED_LOCAL_FILE = "ignored_local_file"
UNAVAILABLE = "unavailable"
# Backward-compatible imports for the harness tests and integrations.
PROCESS_ENV = INHERITED_ENVIRONMENT
LOCAL_IGNORED_FILE = IGNORED_LOCAL_FILE
MISSING = UNAVAILABLE
LOCAL_CREDENTIAL_PATHS = (Path(".env.cayenne.local"), Path(".secrets/cayenne.local.env"))


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
    return bool(email and password is not None and email.strip() and password.strip() and email.strip().lower() not in _PLACEHOLDERS and password.strip().lower() not in _PLACEHOLDERS)


def _unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


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
            values[key.strip()] = _unquote(value)
    return values


def load_cayenne_credentials(
    environ: dict[str, str] | None = None, root: Path | None = None
) -> CayenneCredentials:
    environment = os.environ if environ is None else environ
    email = (environment.get("CAYENNE_TEST_EMAIL") or "").strip()
    password = environment.get("CAYENNE_TEST_PASSWORD")
    # Password is intentionally not stripped or otherwise transformed.
    if _valid(email, password):
        # The PowerShell launcher sets this non-secret provenance marker after
        # safely loading an ignored file.  Do not treat arbitrary values as
        # authoritative and never inspect or log the credential values.
        declared_source = environment.get("CAYENNE_CREDENTIAL_SOURCE")
        source = declared_source if declared_source in {INHERITED_ENVIRONMENT, IGNORED_LOCAL_FILE} else INHERITED_ENVIRONMENT
        return CayenneCredentials(email=email, password=password, source=source)

    repository_root = root or Path(__file__).resolve().parents[2]
    for relative_path in LOCAL_CREDENTIAL_PATHS:
        local = _parse_local_file(repository_root / relative_path)
        email = (local.get("CAYENNE_TEST_EMAIL") or "").strip()
        password = local.get("CAYENNE_TEST_PASSWORD")
        if _valid(email, password):
            return CayenneCredentials(email=email, password=password, source=IGNORED_LOCAL_FILE)
    raise CredentialsUnavailable(AUTH_BLOCKED)
