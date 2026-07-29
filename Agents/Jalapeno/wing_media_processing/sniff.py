"""Content-based media identification independent of filename extensions."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, UnidentifiedImageError

from .command import ffprobe_json
from .errors import PermanentMediaError
from .models import MediaKind

PHOTO_MIME_BY_FORMAT = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}
VIDEO_MIME_BY_FORMAT = {
    "mov,mp4,m4a,3gp,3g2,mj2": "video/mp4",
    "matroska,webm": "video/webm",
}


def sniff_photo(path: Path) -> str:
    try:
        with Image.open(path) as image:
            image.verify()
            mime = PHOTO_MIME_BY_FORMAT.get((image.format or "").upper())
    except (OSError, UnidentifiedImageError) as exc:
        raise PermanentMediaError("file is not a decodable supported image") from exc
    if mime is None:
        raise PermanentMediaError("image format is not supported")
    return mime


def video_mime_from_probe(probe: dict) -> str:
    format_name = str(probe.get("format", {}).get("format_name", "")).lower()
    for names, mime in VIDEO_MIME_BY_FORMAT.items():
        accepted = set(names.split(","))
        if accepted.intersection(format_name.split(",")):
            return mime
    raise PermanentMediaError("video container is not supported")


def sniff_media(path: Path, *, ffprobe_binary: str = "ffprobe") -> tuple[MediaKind, str]:
    try:
        return MediaKind.PHOTO, sniff_photo(path)
    except PermanentMediaError:
        probe = ffprobe_json(path, ffprobe_binary=ffprobe_binary)
        return MediaKind.VIDEO, video_mime_from_probe(probe)
