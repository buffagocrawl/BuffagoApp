from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from image_pipeline.meme_text_renderer import MemeTextStyle, SafeArea, render_meme_text


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


def _validate_text(text: str) -> None:
    lower = text.lower()
    for pattern in PROHIBITED_PATTERNS:
        if re.search(pattern, lower):
            raise ValueError("Meme text contains disallowed content")


def format_meme_image(
    image: Any,
    *,
    top_text: str,
    bottom_text: str,
    size: tuple[int, int] = (1080, 1350),
) -> MemeFormatResult:
    from PIL import Image, ImageOps

    _validate_text(top_text)
    _validate_text(bottom_text)

    width, height = size
    canvas = Image.new("RGBA", size, (20, 20, 24, 255))
    hero = ImageOps.contain(image.convert("RGBA"), (int(width * 0.88), int(height * 0.62)), method=Image.Resampling.LANCZOS)
    hero_x = (width - hero.width) // 2
    hero_y = int(height * 0.18)
    canvas.alpha_composite(hero, dest=(hero_x, hero_y))

    style = MemeTextStyle(max_font_size=90, min_font_size=30)
    canvas = render_meme_text(
        canvas,
        top_text,
        position="top",
        safe_area=SafeArea(top=80, side=60, bottom=height // 2),
        auto_wrap=True,
        auto_scale=True,
        emphasis=False,
        style=style,
    )
    canvas = render_meme_text(
        canvas,
        bottom_text,
        position="bottom",
        safe_area=SafeArea(top=height // 2, side=60, bottom=80),
        auto_wrap=True,
        auto_scale=True,
        emphasis=True,
        style=style,
    )

    return MemeFormatResult(image=canvas.convert("RGB"), applied=True)
