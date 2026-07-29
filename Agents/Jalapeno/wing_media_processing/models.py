"""Data contracts and conservative processing limits."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path


class MediaKind(StrEnum):
    PHOTO = "photo"
    VIDEO = "video"


@dataclass(frozen=True)
class ProcessingLimits:
    max_photo_bytes: int = 20 * 1024 * 1024
    max_video_bytes: int = 50 * 1024 * 1024
    max_photo_pixels: int = 40_000_000
    max_photo_edge: int = 2_048
    max_video_edge: int = 4_096
    max_video_duration_seconds: float = 10.0
    max_video_bitrate: int = 25_000_000
    max_processed_video_bytes: int = 40 * 1024 * 1024
    thumbnail_edge: int = 512
    social_width: int = 1_080
    social_height: int = 1_350


@dataclass(frozen=True)
class PhotoArtifacts:
    normalized_path: Path
    thumbnail_path: Path
    square_path: Path
    portrait_path: Path
    perceptual_hash: str
    source_mime: str


@dataclass(frozen=True)
class VideoArtifacts:
    processed_path: Path
    thumbnail_path: Path
    fingerprint: str
    source_mime: str
    duration_seconds: float


class RetryDecision(StrEnum):
    COMPLETED = "completed"
    RETRY = "retry"
    REJECTED = "rejected"
    DEAD_LETTER = "dead_letter"


@dataclass(frozen=True)
class RetryPolicy:
    max_attempts: int = 3

    def __post_init__(self) -> None:
        if self.max_attempts < 1 or self.max_attempts > 10:
            raise ValueError("max_attempts must be between 1 and 10")
