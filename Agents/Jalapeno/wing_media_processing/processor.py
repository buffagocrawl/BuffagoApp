"""High-level processor with server-trusted artifact naming."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from .models import MediaKind, PhotoArtifacts, ProcessingLimits, VideoArtifacts
from .photo import process_photo
from .sniff import sniff_media
from .video import process_video


class WingMediaProcessor:
    def __init__(
        self,
        *,
        limits: ProcessingLimits | None = None,
        ffmpeg_binary: str = "ffmpeg",
        ffprobe_binary: str = "ffprobe",
    ) -> None:
        self.limits = limits or ProcessingLimits()
        self.ffmpeg_binary = ffmpeg_binary
        self.ffprobe_binary = ffprobe_binary

    def process(
        self,
        source: Path,
        output_directory: Path,
        *,
        submission_id: UUID,
    ) -> PhotoArtifacts | VideoArtifacts:
        source = Path(source).resolve(strict=True)
        artifact_name = str(UUID(str(submission_id)))
        kind, _mime = sniff_media(source, ffprobe_binary=self.ffprobe_binary)
        if kind is MediaKind.PHOTO:
            return process_photo(
                source,
                output_directory,
                artifact_name=artifact_name,
                limits=self.limits,
            )
        return process_video(
            source,
            output_directory,
            artifact_name=artifact_name,
            limits=self.limits,
            ffmpeg_binary=self.ffmpeg_binary,
            ffprobe_binary=self.ffprobe_binary,
        )
