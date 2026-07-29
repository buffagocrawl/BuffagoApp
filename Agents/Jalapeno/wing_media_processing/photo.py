"""Decode-and-reencode photo pipeline with metadata removal."""

from __future__ import annotations

import warnings
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from .errors import PermanentMediaError
from .fingerprints import photo_phash
from .models import PhotoArtifacts, ProcessingLimits
from .sniff import sniff_photo


def _cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    return ImageOps.fit(
        image,
        size,
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.5),
    )


def process_photo(
    source: Path,
    output_directory: Path,
    *,
    artifact_name: str,
    limits: ProcessingLimits,
) -> PhotoArtifacts:
    if source.stat().st_size > limits.max_photo_bytes:
        raise PermanentMediaError("photo exceeds the maximum upload size")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            source_mime = sniff_photo(source)
    except Image.DecompressionBombWarning as exc:
        raise PermanentMediaError("photo exceeds safe decode limits") from exc
    output_directory.mkdir(parents=True, exist_ok=True)
    normalized_path = output_directory / f"{artifact_name}-normalized.jpg"
    thumbnail_path = output_directory / f"{artifact_name}-thumbnail.jpg"
    square_path = output_directory / f"{artifact_name}-square.jpg"
    portrait_path = output_directory / f"{artifact_name}-portrait.jpg"

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(source) as opened:
                if opened.width * opened.height > limits.max_photo_pixels:
                    raise PermanentMediaError("photo exceeds the maximum pixel count")
                opened.load()
                oriented = ImageOps.exif_transpose(opened)
                clean = oriented.convert("RGB")
                clean.thumbnail(
                    (limits.max_photo_edge, limits.max_photo_edge),
                    Image.Resampling.LANCZOS,
                )
                perceptual_hash = photo_phash(clean)
                clean.save(
                    normalized_path,
                    format="JPEG",
                    quality=88,
                    optimize=True,
                    exif=b"",
                    icc_profile=None,
                )
                thumbnail = clean.copy()
                thumbnail.thumbnail(
                    (limits.thumbnail_edge, limits.thumbnail_edge),
                    Image.Resampling.LANCZOS,
                )
                thumbnail.save(
                    thumbnail_path,
                    format="JPEG",
                    quality=82,
                    optimize=True,
                    exif=b"",
                )
                _cover(clean, (limits.social_width, limits.social_width)).save(
                    square_path,
                    format="JPEG",
                    quality=88,
                    optimize=True,
                    exif=b"",
                )
                _cover(clean, (limits.social_width, limits.social_height)).save(
                    portrait_path,
                    format="JPEG",
                    quality=88,
                    optimize=True,
                    exif=b"",
                )
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        for artifact in (normalized_path, thumbnail_path, square_path, portrait_path):
            artifact.unlink(missing_ok=True)
        raise PermanentMediaError("photo exceeds safe decode limits") from exc
    except (OSError, UnidentifiedImageError) as exc:
        for artifact in (normalized_path, thumbnail_path, square_path, portrait_path):
            artifact.unlink(missing_ok=True)
        raise PermanentMediaError("photo could not be safely decoded") from exc
    except Exception:
        for artifact in (normalized_path, thumbnail_path, square_path, portrait_path):
            artifact.unlink(missing_ok=True)
        raise

    return PhotoArtifacts(
        normalized_path=normalized_path,
        thumbnail_path=thumbnail_path,
        square_path=square_path,
        portrait_path=portrait_path,
        perceptual_hash=perceptual_hash,
        source_mime=source_mime,
    )
