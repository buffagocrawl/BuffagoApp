from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from caption_rules import extract_caption_body, infer_overlay_concept, validate_caption, validate_overlay_text
from logging_utils import log_event
from image_pipeline.meme_text_renderer import MemeTextStyle, SafeArea, render_meme_text, sanitize_meme_text
from supabase_client import SupabaseClient
from video_assets import VideoAsset


PROCESSED_PREFIX = "processed"
FALLBACK_OVERLAYS = ("SEND THIS TO\nYOUR WING CREW", "WHO GETS THE\nLAST WING? VOTE.")


@dataclass(frozen=True, slots=True)
class OverlaySelectionResult:
    overlay_text: str
    overlay_source: str
    caption_overlay_concept: str | None
    validation_passed: bool
    validation_failure_reason: str | None
    fallback_used: bool


@dataclass(frozen=True, slots=True)
class VideoOverlayResult:
    status: str
    overlay_text: str
    original_video_url: str
    original_storage_path: str
    processed_video_url: str | None = None
    processed_storage_path: str | None = None
    error: str | None = None
    duration_ms: int = 0

    @property
    def publish_video_url(self) -> str:
        return self.processed_video_url if self.status == "completed" and self.processed_video_url else self.original_video_url

    @property
    def publish_storage_path(self) -> str:
        return self.processed_storage_path if self.status == "completed" and self.processed_storage_path else self.original_storage_path

    def to_winner_updates(self) -> dict[str, Any]:
        return {
            "video_url": self.publish_video_url,
            "public_video_url": self.publish_video_url,
            "storage_path": self.publish_storage_path,
            "original_video_url": self.original_video_url,
            "processed_video_url": self.processed_video_url,
            "original_storage_path": self.original_storage_path,
            "processed_storage_path": self.processed_storage_path,
            "overlay_text": self.overlay_text,
            "overlay_status": self.status,
            "overlay_error": self.error,
        }


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def processed_storage_path(original_storage_path: str) -> str:
    original = Path(original_storage_path.replace("\\", "/"))
    stem = original.stem or "video"
    return f"{PROCESSED_PREFIX}/{stem}_texted.mp4"


def _strip_hashtags(text: str) -> str:
    return re.sub(r"#\w+", "", text)


def _strip_emoji(text: str) -> str:
    return "".join(ch for ch in text if ord(ch) < 128)


def _clean_overlay_text(text: str) -> str:
    cleaned = sanitize_meme_text(_strip_emoji(_strip_hashtags(text)), uppercase=False)
    cleaned = re.sub(r"https?://\S+", "", cleaned)
    cleaned = re.sub(r"[@*`_~]", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -:,.!?")
    return cleaned


def _first_caption_hook(caption: str) -> str:
    without_hash_lines = []
    for raw_line in caption.splitlines():
        line = raw_line.strip()
        if not line:
            if without_hash_lines:
                break
            continue
        if line.startswith("#"):
            break
        without_hash_lines.append(line)
    hook_source = " ".join(without_hash_lines) or caption
    sentence = re.split(r"(?<=[.!?])\s+", hook_source, maxsplit=1)[0]
    return sentence


def select_overlay_text(caption: str) -> str:
    return select_overlay_selection(caption).overlay_text


def select_overlay_selection(caption: str, overlay_text: str | None = None) -> OverlaySelectionResult:
    caption_body = extract_caption_body(caption)
    candidate_overlay = overlay_text if isinstance(overlay_text, str) and overlay_text.strip() else _clean_overlay_text(_first_caption_hook(caption_body))
    overlay_validation = validate_overlay_text(candidate_overlay) if candidate_overlay else {"passed": False, "issues": ["empty_overlay_text"]}
    if candidate_overlay and overlay_validation["passed"]:
        return OverlaySelectionResult(
            overlay_text=str(overlay_validation["normalized_overlay"]).upper(),
            overlay_source="openai" if overlay_text else "caption_hook",
            caption_overlay_concept=infer_overlay_concept(caption_body, candidate_overlay),
            validation_passed=True,
            validation_failure_reason=None,
            fallback_used=False,
        )

    for fallback_overlay in FALLBACK_OVERLAYS:
        fallback_validation = validate_overlay_text(fallback_overlay)
        if fallback_validation["passed"]:
            return OverlaySelectionResult(
                overlay_text=str(fallback_validation["normalized_overlay"]).upper(),
                overlay_source="fallback",
                caption_overlay_concept=infer_overlay_concept(caption_body, fallback_overlay),
                validation_passed=True,
                validation_failure_reason=None,
                fallback_used=True,
            )

    failure_reason = ", ".join(overlay_validation.get("issues") or ["no_valid_overlay_available"])
    raise RuntimeError(f"Unable to select a validated overlay for caption: {failure_reason}")


def normalize_seed_text(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text.strip().lower())
    return cleaned[:120]


def _video_dimensions(input_path: Path, *, timeout_seconds: int = 30) -> tuple[int, int]:
    command = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=s=x:p=0",
        str(input_path),
    ]
    completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout_seconds, check=False)
    if completed.returncode != 0:
        message = completed.stderr.strip() or completed.stdout.strip() or f"ffprobe exited with {completed.returncode}"
        raise RuntimeError(message)
    raw = completed.stdout.strip()
    match = re.match(r"^(\d+)x(\d+)$", raw)
    if not match:
        raise RuntimeError(f"Unable to read video dimensions from ffprobe output: {raw!r}")
    return int(match.group(1)), int(match.group(2))


def _render_overlay_png(path: Path, overlay_text: str, *, size: tuple[int, int]) -> None:
    from PIL import Image

    height = size[1]
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    max_font = max(42, round(height * 0.072))
    min_font = max(24, round(height * 0.034))
    rendered = render_meme_text(
        canvas,
        overlay_text,
        position="top",
        safe_area=SafeArea(top=80, side=60, bottom=max(80, round(height * 0.48))),
        auto_wrap=True,
        auto_scale=True,
        emphasis=True,
        style=MemeTextStyle(max_font_size=max_font, min_font_size=min_font),
    )
    rendered.save(path, format="PNG", optimize=True)


def render_overlay_file(
    input_path: Path,
    output_path: Path,
    overlay_text: str,
    *,
    timeout_seconds: int = 180,
) -> None:
    if not ffmpeg_available():
        raise RuntimeError("ffmpeg is not available")
    with tempfile.TemporaryDirectory(prefix="jalapeno-video-text-") as overlay_dir_raw:
        overlay_path = Path(overlay_dir_raw) / "text-overlay.png"
        dimensions = _video_dimensions(input_path)
        _render_overlay_png(overlay_path, sanitize_meme_text(overlay_text, uppercase=True), size=dimensions)
        command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(input_path),
            "-i",
            str(overlay_path),
            "-filter_complex",
            "[0:v][1:v]overlay=0:0:format=auto",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
        completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout_seconds, check=False)
        if completed.returncode != 0:
            message = completed.stderr.strip() or completed.stdout.strip() or f"ffmpeg exited with {completed.returncode}"
            raise RuntimeError(message)
        return


def create_text_overlay_video(
    client: SupabaseClient,
    asset: VideoAsset,
    caption: str,
    *,
    caption_body: str | None = None,
    overlay_text: str | None = None,
    caption_repaired: bool = False,
    caption_hashtags: list[str] | None = None,
    original_hashtag_count: int | None = None,
    run_id: str,
    candidate_id: str,
    logger=None,
) -> VideoOverlayResult:
    started_at = time.perf_counter()
    normalized_caption_body = extract_caption_body(caption_body or caption)
    caption_validation = validate_caption(caption, require_hashtags=True)
    overlay_selection = select_overlay_selection(normalized_caption_body, overlay_text=overlay_text)
    overlay_text = overlay_selection.overlay_text
    target_path = processed_storage_path(asset.storage_path)
    base_fields = {
        "run_id": run_id,
        "candidate_id": candidate_id,
        "video_asset_id": asset.id,
        "original_storage_path": asset.storage_path,
        "processed_storage_path": target_path,
        "overlay_text": overlay_text,
    }
    log_event(
        logger,
        "caption_overlay_validation",
        caption_validation_passed=caption_validation["passed"],
        caption_repaired=caption_repaired,
        caption_hashtag_count=len(caption_hashtags or []),
        caption_hashtags=caption_hashtags or [f"#{match.group(1)}" for match in re.finditer(r"(?<!\w)#([A-Za-z0-9_]+)", caption)],
        original_hashtag_count=original_hashtag_count,
        final_hashtag_count=len(caption_hashtags or []),
        overlay_validation_passed=overlay_selection.validation_passed,
        overlay_source=overlay_selection.overlay_source,
        overlay_concept=overlay_selection.caption_overlay_concept,
        **base_fields,
    )
    log_event(logger, "video_overlay_started", **base_fields)
    log_event(
        logger,
        "overlay_text_selected",
        caption_overlay_concept=overlay_selection.caption_overlay_concept,
        validation_passed=overlay_selection.validation_passed,
        banned_phrase_detected=any(issue.startswith("banned_phrase:") for issue in validate_overlay_text(overlay_text)["issues"]),
        overlay_source=overlay_selection.overlay_source,
        fallback_used=overlay_selection.fallback_used,
        **base_fields,
    )
    try:
        if not ffmpeg_available():
            raise RuntimeError("ffmpeg is not available")
        with tempfile.TemporaryDirectory(prefix="jalapeno-video-overlay-") as temp_dir_raw:
            temp_dir = Path(temp_dir_raw)
            input_path = temp_dir / Path(asset.storage_path).name
            output_path = temp_dir / Path(target_path).name
            input_path.write_bytes(client.download_storage_object(asset.storage_bucket, asset.storage_path))
            render_overlay_file(input_path, output_path, overlay_text)
            duration_ms = int((time.perf_counter() - started_at) * 1000)
            log_event(logger, "video_overlay_completed", duration_ms=duration_ms, **base_fields)
            client.upload_storage_object(
                asset.storage_bucket,
                target_path,
                data=output_path.read_bytes(),
                content_type="video/mp4",
                upsert=True,
            )
        processed_url = client.storage_public_url(asset.storage_bucket, target_path)
        duration_ms = int((time.perf_counter() - started_at) * 1000)
        log_event(logger, "video_overlay_uploaded", duration_ms=duration_ms, **base_fields)
        return VideoOverlayResult(
            status="completed",
            overlay_text=overlay_text,
            original_video_url=asset.public_url,
            original_storage_path=asset.storage_path,
            processed_video_url=processed_url,
            processed_storage_path=target_path,
            duration_ms=duration_ms,
        )
    except Exception as exc:
        duration_ms = int((time.perf_counter() - started_at) * 1000)
        error = str(exc)
        log_event(logger, "video_overlay_failed", level="error", duration_ms=duration_ms, error=error, **base_fields)
        log_event(logger, "video_overlay_fallback_to_original", level="warning", duration_ms=duration_ms, error=error, **base_fields)
        return VideoOverlayResult(
            status="failed",
            overlay_text=overlay_text,
            original_video_url=asset.public_url,
            original_storage_path=asset.storage_path,
            processed_storage_path=target_path,
            error=error,
            duration_ms=duration_ms,
        )


def apply_overlay_result_to_decision(content_decision: dict[str, Any], result: VideoOverlayResult) -> None:
    winner = content_decision.get("winner")
    if isinstance(winner, dict):
        winner.update(result.to_winner_updates())
    metadata = content_decision.get("metadata") if isinstance(content_decision.get("metadata"), dict) else {}
    metadata.update(result.to_winner_updates())
    content_decision["metadata"] = metadata
