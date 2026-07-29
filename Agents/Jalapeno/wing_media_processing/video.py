"""Strict ffprobe validation and muted FFmpeg normalization."""

from __future__ import annotations

from pathlib import Path

from .command import ffprobe_json, run_command
from .errors import PermanentMediaError
from .fingerprints import video_frame_fingerprint
from .models import ProcessingLimits, VideoArtifacts
from .sniff import video_mime_from_probe

ALLOWED_VIDEO_CODECS = frozenset({"h264", "hevc", "mpeg4", "vp8", "vp9"})


def _number(value: object, *, field: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise PermanentMediaError(f"video has invalid {field}") from exc


def validate_video_probe(probe: dict, *, limits: ProcessingLimits) -> tuple[str, float]:
    source_mime = video_mime_from_probe(probe)
    streams = probe.get("streams")
    if not isinstance(streams, list):
        raise PermanentMediaError("video streams are missing")
    video_streams = [item for item in streams if item.get("codec_type") == "video"]
    if len(video_streams) != 1:
        raise PermanentMediaError("video must contain exactly one video stream")
    stream = video_streams[0]
    codec = str(stream.get("codec_name", "")).lower()
    if codec not in ALLOWED_VIDEO_CODECS:
        raise PermanentMediaError("video codec is not supported")
    width = int(_number(stream.get("width"), field="width"))
    height = int(_number(stream.get("height"), field="height"))
    if width < 1 or height < 1 or max(width, height) > limits.max_video_edge:
        raise PermanentMediaError("video dimensions are outside allowed bounds")
    duration = _number(
        probe.get("format", {}).get("duration", stream.get("duration")),
        field="duration",
    )
    if duration <= 0 or duration > limits.max_video_duration_seconds + 0.05:
        raise PermanentMediaError("video duration is outside allowed bounds")
    bitrate_value = probe.get("format", {}).get("bit_rate")
    if bitrate_value not in (None, "N/A"):
        bitrate = int(_number(bitrate_value, field="bitrate"))
        if bitrate > limits.max_video_bitrate:
            raise PermanentMediaError("video bitrate exceeds allowed bounds")
    return source_mime, duration


def validate_processed_video(probe: dict, *, limits: ProcessingLimits) -> None:
    streams = probe.get("streams", [])
    if any(stream.get("codec_type") == "audio" for stream in streams):
        raise PermanentMediaError("processed video unexpectedly contains audio")
    video_streams = [stream for stream in streams if stream.get("codec_type") == "video"]
    if len(video_streams) != 1 or video_streams[0].get("codec_name") != "h264":
        raise PermanentMediaError("processed video is not a single H.264 stream")
    video_stream = video_streams[0]
    tags = video_stream.get("tags", {})
    rotations = [tags.get("rotate")]
    rotations.extend(
        side_data.get("rotation")
        for side_data in video_stream.get("side_data_list", [])
        if isinstance(side_data, dict)
    )
    for value in rotations:
        if value in (None, "", "0", 0):
            continue
        try:
            has_rotation = float(value) % 360 != 0
        except (TypeError, ValueError) as exc:
            raise PermanentMediaError("processed video has invalid rotation metadata") from exc
        if has_rotation:
            raise PermanentMediaError("processed video retains rotation metadata")
    duration = _number(
        probe.get("format", {}).get("duration", video_stream.get("duration")),
        field="processed duration",
    )
    if duration <= 0 or duration > limits.max_video_duration_seconds + 0.05:
        raise PermanentMediaError("processed video duration is outside allowed bounds")


def process_video(
    source: Path,
    output_directory: Path,
    *,
    artifact_name: str,
    limits: ProcessingLimits,
    ffmpeg_binary: str,
    ffprobe_binary: str,
) -> VideoArtifacts:
    if source.stat().st_size > limits.max_video_bytes:
        raise PermanentMediaError("video exceeds the maximum upload size")
    source_probe = ffprobe_json(source, ffprobe_binary=ffprobe_binary)
    source_mime, duration = validate_video_probe(source_probe, limits=limits)
    output_directory.mkdir(parents=True, exist_ok=True)
    processed_path = output_directory / f"{artifact_name}-processed.mp4"
    thumbnail_path = output_directory / f"{artifact_name}-thumbnail.jpg"

    # FFmpeg auto-rotates by default. Re-encoding removes rotation side-data and
    # the explicit metadata/chapter maps prevent source metadata propagation.
    try:
        run_command(
            [
                ffmpeg_binary,
                "-y",
                "-v",
                "error",
                "-i",
                str(source),
                "-map",
                "0:v:0",
                "-map_metadata",
                "-1",
                "-map_chapters",
                "-1",
                "-an",
                "-vf",
                f"scale={limits.social_width}:{limits.social_height}:"
                "force_original_aspect_ratio=decrease,"
                f"pad={limits.social_width}:{limits.social_height}:"
                "(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30",
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-pix_fmt",
                "yuv420p",
                "-b:v",
                "4000k",
                "-maxrate",
                "5000k",
                "-bufsize",
                "10000k",
                "-movflags",
                "+faststart",
                "-t",
                str(limits.max_video_duration_seconds),
                str(processed_path),
            ],
            timeout_seconds=120,
        )
        run_command(
            [
                ffmpeg_binary,
                "-y",
                "-v",
                "error",
                "-ss",
                str(min(1.0, duration / 2)),
                "-i",
                str(processed_path),
                "-frames:v",
                "1",
                "-vf",
                f"scale={limits.thumbnail_edge}:-2",
                "-q:v",
                "3",
                str(thumbnail_path),
            ],
            timeout_seconds=30,
        )
        if processed_path.stat().st_size > limits.max_processed_video_bytes:
            raise PermanentMediaError("processed video exceeds publication size bounds")
        output_probe = ffprobe_json(processed_path, ffprobe_binary=ffprobe_binary)
        validate_processed_video(output_probe, limits=limits)
        fingerprint = video_frame_fingerprint(
            processed_path,
            ffmpeg_binary=ffmpeg_binary,
        )
    except Exception:
        processed_path.unlink(missing_ok=True)
        thumbnail_path.unlink(missing_ok=True)
        raise
    return VideoArtifacts(
        processed_path=processed_path,
        thumbnail_path=thumbnail_path,
        fingerprint=fingerprint,
        source_mime=source_mime,
        duration_seconds=duration,
    )
