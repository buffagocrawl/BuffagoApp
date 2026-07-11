from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any


def _stringify(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return json.dumps(value, sort_keys=True, default=str)
    if isinstance(value, (list, tuple, set)):
        return json.dumps(list(value), default=str)
    return str(value)


def format_structured_log(event: str, **fields: Any) -> str:
    parts = [event]
    for key, value in fields.items():
        if value is None:
            continue
        parts.append(f"{key}={_stringify(value)}")
    return " | ".join(parts)


def log_event(logger: logging.Logger | None, event: str, level: str = "info", **fields: Any) -> None:
    if logger is None:
        return
    message = format_structured_log(event, **fields)
    getattr(logger, level.lower(), logger.info)(message)


def initialize_logger(log_path: Path) -> logging.Logger:
    logger = logging.getLogger(f"buffago.serrano.{log_path.parent.name}")
    logger.handlers.clear()
    logger.propagate = False
    logger.setLevel(logging.INFO)
    formatter = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")

    console = logging.StreamHandler()
    console.setFormatter(formatter)
    logger.addHandler(console)

    log_path.parent.mkdir(parents=True, exist_ok=True)
    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    return logger

