from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


PROHIBITED_PATTERNS = (
    r"\btrump\b",
    r"\bbiden\b",
    r"\bpolitic(s|al)?\b",
    r"\belection\b",
    r"\bcongress\b",
    r"\bsenate\b",
    r"\bpresident\b",
    r"\bspiderman\b",
    r"\bmario\b",
    r"\bbatman\b",
    r"\bmem[e]? template\b",
)


@dataclass(frozen=True, slots=True)
class MemeFormatResult:
    image: Any
    applied: bool


def _load_font(size: int, *, bold: bool = True) -> Any:
    from PIL import ImageFont

    candidates = [
        Path("C:/Windows/Fonts/impact.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            try:
                return ImageFont.truetype(str(candidate), size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def _validate_text(text: str) -> None:
    lower = text.lower()
    for pattern in PROHIBITED_PATTERNS:
        if re.search(pattern, lower):
            raise ValueError("Meme text contains disallowed content")


def _wrap_text(draw: Any, text: str, font: Any, max_width: int) -> str:
    words = text.split()
    if not words:
        return ""
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        trial = f"{current} {word}"
        if draw.textbbox((0, 0), trial, font=font)[2] <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return "\n".join(lines)


def _draw_caption_block(
    draw: Any,
    *,
    text: str,
    top: int,
    width: int,
    font_size: int,
    max_width: int,
) -> int:
    font = _load_font(font_size, bold=True)
    wrapped = _wrap_text(draw, text, font, max_width)
    if not wrapped:
        return top
    bbox = draw.multiline_textbbox((0, 0), wrapped, font=font, spacing=8, stroke_width=6)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    left = (width - text_width) // 2
    draw.multiline_text(
        (left, top),
        wrapped,
        fill=(255, 255, 255),
        font=font,
        align="center",
        spacing=8,
        stroke_width=6,
        stroke_fill=(0, 0, 0),
    )
    return top + text_height


def format_meme_image(
    image: Any,
    *,
    top_text: str,
    bottom_text: str,
    size: tuple[int, int] = (1080, 1350),
) -> MemeFormatResult:
    from PIL import Image, ImageDraw, ImageOps

    _validate_text(top_text)
    _validate_text(bottom_text)

    width, height = size
    canvas = Image.new("RGBA", size, (20, 20, 24, 255))
    hero = ImageOps.contain(image.convert("RGBA"), (int(width * 0.88), int(height * 0.62)), method=Image.Resampling.LANCZOS)
    hero_x = (width - hero.width) // 2
    hero_y = int(height * 0.18)
    canvas.alpha_composite(hero, dest=(hero_x, hero_y))

    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((40, 30, width - 40, 160), radius=24, fill=(0, 0, 0, 120))
    draw.rounded_rectangle((40, height - 190, width - 40, height - 30), radius=24, fill=(0, 0, 0, 120))

    top_end = _draw_caption_block(
        draw,
        text=top_text.strip().upper(),
        top=54,
        width=width,
        font_size=max(42, int(width * 0.04)),
        max_width=width - 140,
    )
    _draw_caption_block(
        draw,
        text=bottom_text.strip().upper(),
        top=height - 170,
        width=width,
        font_size=max(38, int(width * 0.036)),
        max_width=width - 140,
    )

    draw.text((width - 180, top_end + 18), "BUFFAGO", fill=(255, 206, 84), font=_load_font(24, bold=True))
    return MemeFormatResult(image=canvas.convert("RGB"), applied=True)
