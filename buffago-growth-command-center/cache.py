"""Small atomic cache for the last valid snapshot."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class CachedSnapshot:
    payload: dict[str, Any]
    saved_at: datetime


class SnapshotCache:
    def __init__(self, path: Path):
        self.path = path

    def save(self, payload: dict[str, Any], saved_at: datetime | None = None) -> None:
        moment = saved_at or datetime.now(timezone.utc)
        document = {"saved_at": moment.isoformat(), "payload": payload}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        temporary.write_text(json.dumps(document, separators=(",", ":")), encoding="utf-8")
        os.replace(temporary, self.path)

    def load(self) -> CachedSnapshot | None:
        try:
            document = json.loads(self.path.read_text(encoding="utf-8"))
            payload = document.get("payload")
            saved_at = datetime.fromisoformat(document["saved_at"].replace("Z", "+00:00"))
            if not isinstance(payload, dict):
                return None
            return CachedSnapshot(payload, saved_at.replace(tzinfo=saved_at.tzinfo or timezone.utc))
        except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
            return None

