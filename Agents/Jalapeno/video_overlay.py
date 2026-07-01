from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from logging_utils import log_event
from supabase_client import SupabaseClient
from video_assets import VideoAsset


PROCESSED_PREFIX = "processed"
FALLBACK_OVERLAYS = ("SAUCY WING NIGHT", "THE SCROLL DESERVED SAUCE")
STRONG_WORDS = ("SAUCE", "WINGS", "WING", "CRISPY", "BUFFALO", "SAUCY")


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
    cleaned = _strip_emoji(_strip_hashtags(text))
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
    hook = _clean_overlay_text(_first_caption_hook(caption))
    words = hook.split()
    generic_phrases = {
        "daily wing reel",
        "buffago test caption",
        "8pm wing check",
        "wing night",
    }
    if len(words) < 4 or hook.lower() in generic_phrases:
        return FALLBACK_OVERLAYS[0]
    if len(words) > 12:
        words = words[:12]
    text = " ".join(words).upper()
    if not any(word in text for word in STRONG_WORDS):
        if "SCROLL" in text:
            return "THE SCROLL DESERVED SAUCE"
        return FALLBACK_OVERLAYS[0]
    return text


def _wrap_two_lines(text: str, *, max_chars: int = 18) -> str:
    words = text.split()
    if len(words) <= 2 or len(text) <= max_chars:
        return text
    best_index = min(range(1, len(words)), key=lambda index: abs(len(" ".join(words[:index])) - len(" ".join(words[index:]))))
    first = " ".join(words[:best_index])
    second = " ".join(words[best_index:])
    if len(first) > max_chars + 8 or len(second) > max_chars + 8:
        midpoint = max(1, len(words) // 2)
        first = " ".join(words[:midpoint])
        second = " ".join(words[midpoint:])
    return f"{first}\n{second}"


def _escape_drawtext(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace("%", "\\%")
        .replace("\n", r"\n")
    )


def _font_file() -> str | None:
    candidates = [
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf"),
        Path("C:/Windows/Fonts/Arialbd.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate.as_posix().replace(":", "\\:")
    return None


def _drawtext_filter(overlay_text: str) -> str:
    wrapped = _wrap_two_lines(overlay_text)
    font = _font_file()
    font_arg = f"fontfile='{font}':" if font else ""
    return (
        "drawtext="
        f"{font_arg}"
        f"text='{_escape_drawtext(wrapped)}':"
        "fontcolor=white:"
        "fontsize=h*0.072:"
        "bordercolor=black:"
        "borderw=6:"
        "line_spacing=10:"
        "x=(w-text_w)/2:"
        "y=h*0.16"
    )


def render_overlay_file(
    input_path: Path,
    output_path: Path,
    overlay_text: str,
    *,
    timeout_seconds: int = 180,
) -> None:
    if not ffmpeg_available():
        raise RuntimeError("ffmpeg is not available")
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(input_path),
        "-vf",
        _drawtext_filter(overlay_text),
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


def create_text_overlay_video(
    client: SupabaseClient,
    asset: VideoAsset,
    caption: str,
    *,
    run_id: str,
    candidate_id: str,
    logger=None,
) -> VideoOverlayResult:
    started_at = time.perf_counter()
    overlay_text = select_overlay_text(caption)
    target_path = processed_storage_path(asset.storage_path)
    base_fields = {
        "run_id": run_id,
        "candidate_id": candidate_id,
        "video_asset_id": asset.id,
        "original_storage_path": asset.storage_path,
        "processed_storage_path": target_path,
        "overlay_text": overlay_text,
    }
    log_event(logger, "video_overlay_started", **base_fields)
    log_event(logger, "video_overlay_text_selected", **base_fields)
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
