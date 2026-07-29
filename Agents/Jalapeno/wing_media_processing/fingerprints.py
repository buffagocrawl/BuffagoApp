"""Perceptual similarity hooks without storing biometric or identity features."""

from __future__ import annotations

import hashlib
import math
from pathlib import Path

from PIL import Image

from .command import run_command


def photo_phash(image: Image.Image) -> str:
    """Return a conventional 64-bit DCT perceptual hash."""
    reduced = image.convert("L").resize((32, 32), Image.Resampling.LANCZOS)
    pixels = list(reduced.get_flattened_data())
    coefficients: list[float] = []
    for vertical_frequency in range(8):
        for horizontal_frequency in range(8):
            total = 0.0
            for y in range(32):
                for x in range(32):
                    total += (
                        pixels[(y * 32) + x]
                        * math.cos(((2 * x + 1) * horizontal_frequency * math.pi) / 64)
                        * math.cos(((2 * y + 1) * vertical_frequency * math.pi) / 64)
                    )
            coefficients.append(total)
    non_dc = coefficients[1:]
    median = sorted(non_dc)[len(non_dc) // 2]
    bits = 0
    for coefficient in coefficients:
        bits = (bits << 1) | int(coefficient > median)
    return f"{bits:016x}"


def video_frame_fingerprint(
    path: Path,
    *,
    ffmpeg_binary: str = "ffmpeg",
    timeout_seconds: int = 30,
) -> str:
    """Hash deterministic frame checksums sampled once per second."""
    result = run_command(
        [
            ffmpeg_binary,
            "-v",
            "error",
            "-i",
            str(path),
            "-map",
            "0:v:0",
            "-vf",
            "fps=1,scale=32:32:force_original_aspect_ratio=decrease,"
            "pad=32:32:(ow-iw)/2:(oh-ih)/2:black,format=gray",
            "-f",
            "framemd5",
            "-",
        ],
        timeout_seconds=timeout_seconds,
        permanent_failure=True,
    )
    return hashlib.sha256(result.stdout).hexdigest()
