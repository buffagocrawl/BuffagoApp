from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True, slots=True)
class ImageValidationResult:
    valid: bool
    file_exists: bool
    file_size_bytes: int
    width: int
    height: int
    aspect_ratio: float
    format: str
    issues: list[str]


def validate_image_file(
    path: Path,
    *,
    min_file_size_bytes: int = 4 * 1024,
    max_file_size_bytes: int = 25 * 1024 * 1024,
) -> ImageValidationResult:
    from PIL import Image

    issues: list[str] = []
    file_exists = path.exists()
    if not file_exists:
        return ImageValidationResult(False, False, 0, 0, 0, 0.0, "", ["File does not exist"])

    file_size_bytes = path.stat().st_size
    if file_size_bytes < min_file_size_bytes:
        issues.append("File size is too small")
    if file_size_bytes > max_file_size_bytes:
        issues.append("File size is too large")

    width = 0
    height = 0
    aspect_ratio = 0.0
    detected_format = ""
    try:
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            width, height = image.size
            detected_format = str(image.format or "").upper()
            aspect_ratio = round(width / height, 4) if height else 0.0
            image.load()
    except Exception as exc:
        issues.append(f"Image failed validation: {exc}")

    if width <= 0 or height <= 0:
        issues.append("Invalid image dimensions")
    if detected_format not in {"PNG", "JPG", "JPEG", "WEBP"}:
        issues.append("Unsupported image format")

    return ImageValidationResult(
        valid=not issues,
        file_exists=file_exists,
        file_size_bytes=file_size_bytes,
        width=width,
        height=height,
        aspect_ratio=aspect_ratio,
        format=detected_format,
        issues=issues,
    )
