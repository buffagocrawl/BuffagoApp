from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True, slots=True)
class CleanupResult:
    removed_paths: list[str]
    kept_paths: list[str]
    failed_paths: list[str]


def cleanup_temp_files(
    paths: list[Path],
    *,
    success: bool,
    cleanup_temp_files: bool,
    keep_failed_images: bool,
) -> CleanupResult:
    removed_paths: list[str] = []
    kept_paths: list[str] = []
    failed_paths: list[str] = []
    for path in paths:
        if not path.exists():
            continue
        should_remove = cleanup_temp_files and (success or not keep_failed_images)
        if not should_remove:
            kept_paths.append(str(path))
            continue
        try:
            path.unlink()
            removed_paths.append(str(path))
        except Exception:
            failed_paths.append(str(path))
    return CleanupResult(removed_paths=removed_paths, kept_paths=kept_paths, failed_paths=failed_paths)

