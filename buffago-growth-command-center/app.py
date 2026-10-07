#!/usr/bin/env python3
"""Buffago Growth Command Center entry point."""

from __future__ import annotations

import json
import logging
import logging.handlers
import os
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Tk must see DPI awareness before it initializes on Windows.
if os.name == "nt":
    try:
        import ctypes
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except (AttributeError, OSError):
        pass

import tkinter as tk

from api_client import AuthenticationError, SnapshotClient, SnapshotError
from cache import SnapshotCache
from config import BASE_DIR, Config
from models import Snapshot
from ui.dashboard import Dashboard
from ui import theme


LOG = logging.getLogger("buffago-growth")


def log_refresh_failure(error: Exception) -> None:
    """Log failure categories without serializing requests or credentials."""
    if isinstance(error, AuthenticationError):
        LOG.error("Authentication failure: class=%s status=%s", type(error).__name__, error.status or "unknown")
    else:
        LOG.warning("Refresh failure: class=%s", type(error).__name__)


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def configure_logging() -> None:
    level = logging.INFO
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    handler = logging.StreamHandler()
    handler.setFormatter(formatter)
    LOG.setLevel(level)
    LOG.addHandler(handler)
    log_dir = BASE_DIR / "logs"
    try:
        log_dir.mkdir(exist_ok=True)
        rotating = logging.handlers.RotatingFileHandler(
            log_dir / "buffago-growth.log", maxBytes=512_000, backupCount=2, encoding="utf-8"
        )
        rotating.setFormatter(formatter)
        LOG.addHandler(rotating)
    except OSError:
        LOG.warning("Persistent log unavailable; continuing with system log")


class Application:
    def __init__(self, config: Config):
        self.config = config
        self.cache = SnapshotCache(config.cache_path)
        self.root = tk.Tk()
        self.root.title("Buffago Growth Command Center")
        self.root.configure(bg=theme.BG)
        self.root.minsize(960, 540)
        self.root.attributes("-fullscreen", config.fullscreen)
        self.root.bind("<Escape>", lambda _event: self.root.attributes("-fullscreen", False))
        self.root.bind("<F11>", self._toggle_fullscreen)
        self.dashboard = Dashboard(self.root)
        self.local = read_json(config.growth_config_path)
        self.snapshot: Snapshot | None = None
        self.last_success: datetime | None = None
        self._refreshing = False
        self._load_initial_state()

    def _toggle_fullscreen(self, _event: tk.Event) -> None:
        self.root.attributes("-fullscreen", not bool(self.root.attributes("-fullscreen")))

    def _load_initial_state(self) -> None:
        cached = self.cache.load()
        if cached:
            try:
                self.snapshot = Snapshot.from_payload(cached.payload)
                self.last_success = cached.saved_at
                LOG.info("Loaded cached snapshot")
            except ValueError:
                LOG.warning("Cached snapshot is invalid")
        status = "DEMO MODE" if self.config.demo else "CONNECTING"
        self.dashboard.update_data(self.snapshot, self.local, self.last_success, bool(cached), status)

    def start(self) -> None:
        LOG.info("Starting dashboard (demo=%s, refresh=%ss)", self.config.demo, self.config.refresh_seconds)
        self.root.after(150, self.refresh)
        self.root.after(60_000, self._tick_clock)
        self.root.mainloop()

    def _tick_clock(self) -> None:
        if self.last_success:
            stale = (datetime.now(timezone.utc) - self.last_success).total_seconds() > self.config.stale_after_seconds
            self.dashboard.update_data(self.snapshot, self.local, self.last_success, stale, "DEMO MODE" if self.config.demo else "LIVE")
        self.root.after(60_000, self._tick_clock)

    def refresh(self) -> None:
        if self._refreshing:
            return
        self._refreshing = True
        threading.Thread(target=self._fetch_in_background, name="snapshot-refresh", daemon=True).start()

    def _fetch_in_background(self) -> None:
        try:
            if self.config.demo:
                payload = read_json(self.config.demo_path)
                if not payload:
                    raise SnapshotError("Demo snapshot unavailable")
            else:
                client = SnapshotClient(
                    url=self.config.function_url,
                    anon_jwt=self.config.anon_jwt,
                    device_token=self.config.device_token,
                    access_token=self.config.access_token,
                    timeout=self.config.timeout_seconds,
                )
                payload = client.fetch()
            snapshot = Snapshot.from_payload(payload)
            self.cache.save(payload)
            self.root.after(0, lambda: self._refresh_succeeded(snapshot))
        except AuthenticationError as exc:
            log_refresh_failure(exc)
            self.root.after(0, lambda message=str(exc): self._refresh_failed(message, True))
        except (SnapshotError, ValueError, OSError) as exc:
            log_refresh_failure(exc)
            self.root.after(0, lambda message=str(exc): self._refresh_failed(message, False))

    def _refresh_succeeded(self, snapshot: Snapshot) -> None:
        self.snapshot = snapshot
        self.last_success = datetime.now(timezone.utc)
        self._refreshing = False
        LOG.info("Snapshot refresh succeeded")
        self.dashboard.update_data(snapshot, self.local, self.last_success, False,
                                   "DEMO MODE" if self.config.demo else "LIVE")
        self.root.after(self.config.refresh_seconds * 1000, self.refresh)

    def _refresh_failed(self, _message: str, auth: bool) -> None:
        self._refreshing = False
        cached = self.cache.load()
        if cached and self.snapshot is None:
            try:
                self.snapshot = Snapshot.from_payload(cached.payload)
                self.last_success = cached.saved_at
                LOG.info("Using cached snapshot after refresh failure")
            except ValueError:
                pass
        status = "AUTH · USING CACHED DATA" if auth and self.snapshot else "AUTH NEEDED" if auth else "OFFLINE · RETRYING"
        self.dashboard.update_data(self.snapshot, self.local, self.last_success, True, status)
        self.root.after(self.config.refresh_seconds * 1000, self.refresh)


def main() -> int:
    configure_logging()
    try:
        Application(Config.from_env()).start()
        return 0
    except Exception:
        LOG.exception("Fatal dashboard error")
        return 1


if __name__ == "__main__":
    sys.exit(main())
