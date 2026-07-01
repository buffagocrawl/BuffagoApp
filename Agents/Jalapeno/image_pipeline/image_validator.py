from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any


META_PROMPT_PATTERNS = (
    "create an instagram-quality image",
    "featuring buffago",
    "composition:",
    "lighting:",
    "camera angle:",
    "food realism:",
    "background:",
    "color palette:",
    "negative prompt guidance:",
)

TEXTLESS_PROMPT_PATTERNS = (
    "no visible words",
    "no captions",
    "no ui",
    "no prompt text",
    "no fake app screens",
    "no abstract placeholder shapes",
)


@dataclass(frozen=True, slots=True)
class ImageValidationResult:
    valid: bool
    format_valid: bool
    content_valid: bool
    file_exists: bool
    file_size_bytes: int
    width: int
    height: int
    aspect_ratio: float
    format: str
    image_source: str
    prompt_quality: int
    validation_reason: str
    status: str
    issues: list[str]
    content_issues: list[str]


def _score_prompt_quality(prompt: str) -> tuple[int, list[str]]:
    lowered = prompt.strip().lower()
    issues: list[str] = []
    score = 100
    for pattern in META_PROMPT_PATTERNS:
        if pattern in lowered:
            score -= 18
            issues.append(f"Prompt contains meta instruction pattern: {pattern}")
    missing_required = [pattern for pattern in TEXTLESS_PROMPT_PATTERNS if pattern not in lowered]
    if missing_required:
        score -= min(24, len(missing_required) * 4)
        issues.append("Prompt is missing one or more strict no-text/no-placeholder guardrails")
    if len(prompt.strip()) < 80:
        score -= 10
        issues.append("Prompt is too short to reliably control visual quality")
    return max(score, 0), issues


def validate_image_file(
    path: Path,
    *,
    image_source: str = "unknown",
    prompt: str = "",
    allow_non_ai_source: bool = True,
    minimum_prompt_quality: int = 70,
    min_file_size_bytes: int = 4 * 1024,
    max_file_size_bytes: int = 25 * 1024 * 1024,
) -> ImageValidationResult:
    from PIL import Image

    format_issues: list[str] = []
    content_issues: list[str] = []
    file_exists = path.exists()
    if not file_exists:
        return ImageValidationResult(False, False, False, False, 0, 0, 0, 0.0, "", image_source, 0, "File does not exist", "failed", ["File does not exist"], ["File does not exist"])

    file_size_bytes = path.stat().st_size
    if file_size_bytes < min_file_size_bytes:
        format_issues.append("File size is too small")
    if file_size_bytes > max_file_size_bytes:
        format_issues.append("File size is too large")

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
        format_issues.append(f"Image failed validation: {exc}")

    if width <= 0 or height <= 0:
        format_issues.append("Invalid image dimensions")
    if detected_format not in {"PNG", "JPG", "JPEG", "WEBP"}:
        format_issues.append("Unsupported image format")

    prompt_quality, prompt_issues = _score_prompt_quality(prompt)
    content_issues.extend(prompt_issues)
    if not allow_non_ai_source and image_source != "real_ai":
        content_issues.append(f"Production image source must be real_ai, received {image_source}")
    if prompt_quality < minimum_prompt_quality:
        content_issues.append(f"Prompt quality below minimum threshold: {prompt_quality} < {minimum_prompt_quality}")

    format_valid = not format_issues
    content_valid = not content_issues
    issues = [*format_issues, *content_issues]
    validation_reason = issues[0] if issues else "passed"
    status = "passed" if format_valid and content_valid else "failed"

    return ImageValidationResult(
        valid=format_valid and content_valid,
        format_valid=format_valid,
        content_valid=content_valid,
        file_exists=file_exists,
        file_size_bytes=file_size_bytes,
        width=width,
        height=height,
        aspect_ratio=aspect_ratio,
        format=detected_format,
        image_source=image_source,
        prompt_quality=prompt_quality,
        validation_reason=validation_reason,
        status=status,
        issues=issues,
        content_issues=content_issues,
    )
