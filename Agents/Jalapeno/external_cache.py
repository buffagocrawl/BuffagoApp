from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

from config import BASE_DIR


DEFAULT_EXTERNAL_CONTEXT_DIR: Path = BASE_DIR / "data"


def get_daily_external_context_path(current_date: date, cache_directory: Path = DEFAULT_EXTERNAL_CONTEXT_DIR) -> Path:
    return cache_directory / f"external_context_{current_date.isoformat()}.json"


def get_latest_external_context_path(cache_directory: Path = DEFAULT_EXTERNAL_CONTEXT_DIR) -> Path:
    return cache_directory / "latest_external_context.json"


def read_external_context(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)
    if not isinstance(raw, dict):
        raise ValueError("External context cache must contain a JSON object")
    return raw


def write_external_context(context: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(context, handle, indent=2, sort_keys=True, default=str)
        handle.write("\n")
