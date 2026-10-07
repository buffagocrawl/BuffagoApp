"""Dependency-free HTTP client for the authenticated growth snapshot."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


class SnapshotError(Exception):
    pass


class AuthenticationError(SnapshotError):
    def __init__(self, status: int | None = None):
        super().__init__("Snapshot authorization failed")
        self.status = status


class MalformedResponseError(SnapshotError):
    pass


@dataclass(frozen=True)
class SnapshotClient:
    url: str
    anon_jwt: str = ""
    device_token: str = ""
    access_token: str = ""
    timeout: int = 12

    def fetch(self) -> dict[str, Any]:
        if not self.url:
            raise AuthenticationError()
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if self.device_token:
            headers["X-Buffago-Dashboard-Key"] = self.device_token
        elif self.access_token:
            # Optional authenticated-user debugging only.
            headers["Authorization"] = f"Bearer {self.access_token}"
        else:
            raise AuthenticationError()
        request = urllib.request.Request(self.url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                raw = response.read(1_000_001)
        except urllib.error.HTTPError as exc:
            if exc.code in {401, 403}:
                raise AuthenticationError(exc.code) from exc
            raise SnapshotError(f"Snapshot request failed ({exc.code})") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise SnapshotError("Snapshot service is unreachable") from exc
        if len(raw) > 1_000_000:
            raise MalformedResponseError("Snapshot response is unexpectedly large")
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise MalformedResponseError("Snapshot response is not valid JSON") from exc
        if not isinstance(payload, dict):
            raise MalformedResponseError("Snapshot response must be a JSON object")
        return payload
