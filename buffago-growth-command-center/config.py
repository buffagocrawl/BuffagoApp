"""Runtime configuration with a tiny, dependency-free .env reader."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = value.strip().strip('"').strip("'")


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


@dataclass(frozen=True)
class Config:
    demo: bool
    fullscreen: bool
    function_url: str
    anon_jwt: str
    device_token: str
    access_token: str
    refresh_seconds: int
    timeout_seconds: int
    stale_after_seconds: int
    cache_path: Path
    demo_path: Path
    growth_config_path: Path

    @classmethod
    def from_env(cls) -> "Config":
        load_dotenv(BASE_DIR / ".env")
        project_url = os.getenv("BUFFAGO_SUPABASE_URL", "").rstrip("/")
        default_url = f"{project_url}/functions/v1/buffago-growth-snapshot" if project_url else ""
        refresh = _int("BUFFAGO_REFRESH_SECONDS", _int("BUFFAGO_GROWTH_REFRESH_SECONDS", 600, 30, 3600), 30, 3600)
        return cls(
            demo=_bool("BUFFAGO_GROWTH_DEMO"),
            fullscreen=_bool("BUFFAGO_GROWTH_FULLSCREEN", True),
            function_url=os.getenv("BUFFAGO_GROWTH_FUNCTION_URL", default_url).strip(),
            anon_jwt=os.getenv("BUFFAGO_SUPABASE_ANON_JWT", "").strip(),
            device_token=os.getenv("BUFFAGO_DASHBOARD_DEVICE_TOKEN", "").strip(),
            access_token=os.getenv("BUFFAGO_GROWTH_ACCESS_TOKEN", "").strip(),
            refresh_seconds=refresh,
            timeout_seconds=_int("BUFFAGO_GROWTH_TIMEOUT_SECONDS", 12, 2, 60),
            stale_after_seconds=_int("BUFFAGO_GROWTH_STALE_AFTER_SECONDS", refresh * 2, refresh, 86400),
            cache_path=Path(os.getenv("BUFFAGO_GROWTH_CACHE_PATH", BASE_DIR / "data" / "snapshot-cache.json")),
            demo_path=BASE_DIR / "data" / "demo_snapshot.json",
            growth_config_path=Path(os.getenv("BUFFAGO_GROWTH_LOCAL_CONFIG", BASE_DIR / "data" / "growth_config.json")),
        )
