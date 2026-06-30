from __future__ import annotations

import math
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from prompt_library_loader import PROMPT_LIBRARY_VERSION, load_prompt_text


class ImageGenerationClient(Protocol):
    def generate_image(self, *, prompt: str, model: str, size: tuple[int, int], content_type: str, image_type: str) -> Any:
        ...


@dataclass(frozen=True, slots=True)
class GeneratedImage:
    image: Any
    image_prompt: str
    model: str
    prompt_version: str
    content_type: str
    image_type: str
    generation_time_ms: int
    cost_estimate_usd: float | None


def _load_font(size: int, *, bold: bool = False) -> ImageFont.ImageFont:
    from PIL import ImageFont

    candidates = [
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            try:
                return ImageFont.truetype(str(candidate), size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def _sanitize_text(text: str, *, limit: int = 80) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1].rstrip() + "..."


def _palette_for(content_type: str, image_type: str) -> tuple[tuple[int, int, int], tuple[int, int, int], tuple[int, int, int]]:
    if image_type == "meme":
        return (24, 24, 28), (255, 206, 84), (255, 111, 97)
    if content_type in {"restaurant_spotlight", "hidden_gem"}:
        return (32, 18, 12), (245, 144, 60), (255, 220, 173)
    if content_type in {"community_highlight", "xp_milestone", "leaderboard", "challenge"}:
        return (17, 22, 34), (80, 185, 255), (250, 200, 70)
    if content_type in {"food_holiday", "sports_tie_in", "wing_fact"}:
        return (28, 26, 16), (255, 163, 43), (244, 238, 220)
    return (28, 20, 24), (231, 115, 68), (248, 230, 208)


def _draw_gradient(image: Image.Image, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> None:
    from PIL import ImageDraw

    width, height = image.size
    draw = ImageDraw.Draw(image)
    for y in range(height):
        blend = y / max(height - 1, 1)
        color = tuple(int(top[index] * (1.0 - blend) + bottom[index] * blend) for index in range(3))
        draw.line((0, y, width, y), fill=color)


def _draw_scene(draw: ImageDraw.ImageDraw, size: tuple[int, int], *, content_type: str, accent: tuple[int, int, int], warm: tuple[int, int, int]) -> None:
    from PIL import ImageDraw

    width, height = size
    if content_type in {"restaurant_spotlight", "hidden_gem", "food_holiday", "sports_tie_in", "wing_fact"}:
        plate_bbox = (width * 0.18, height * 0.28, width * 0.82, height * 0.84)
        draw.ellipse(plate_bbox, fill=(245, 237, 224), outline=accent, width=8)
        for index in range(6):
            angle = index * (math.tau / 6.0)
            cx = width * 0.5 + math.cos(angle) * width * 0.16
            cy = height * 0.56 + math.sin(angle) * height * 0.1
            draw.ellipse((cx - 62, cy - 28, cx + 62, cy + 28), fill=(warm[0], warm[1], warm[2]), outline=(255, 255, 255), width=4)
        sauce = (184, 49, 28)
        for offset in range(8):
            x = width * 0.27 + offset * width * 0.06
            draw.arc((x, height * 0.2, x + width * 0.18, height * 0.42), start=190, end=320, fill=sauce, width=10)
        draw.rounded_rectangle((width * 0.15, height * 0.1, width * 0.38, height * 0.24), radius=18, fill=(255, 255, 255, 80), outline=(255, 255, 255), width=4)
        draw.rounded_rectangle((width * 0.62, height * 0.09, width * 0.86, height * 0.23), radius=18, fill=(255, 255, 255, 80), outline=(255, 255, 255), width=4)
    elif content_type in {"community_highlight", "xp_milestone", "leaderboard", "challenge"}:
        for index in range(5):
            x = width * (0.12 + index * 0.16)
            y = height * (0.24 + (index % 2) * 0.08)
            draw.rounded_rectangle((x, y, x + width * 0.12, y + height * 0.28), radius=28, fill=(255, 255, 255), outline=accent, width=5)
            draw.ellipse((x + 18, y + 18, x + 84, y + 84), fill=warm, outline=(255, 255, 255), width=4)
            draw.line((x + 52, y + 84, x + 52, y + 198), fill=accent, width=6)
        for index in range(4):
            draw.polygon(
                [
                    (width * 0.16 + index * width * 0.18, height * 0.82),
                    (width * 0.2 + index * width * 0.18, height * 0.7),
                    (width * 0.24 + index * width * 0.18, height * 0.82),
                ],
                fill=warm if index % 2 else accent,
            )
    else:
        for index in range(7):
            radius = width * (0.12 + index * 0.02)
            cx = width * (0.18 + index * 0.11)
            cy = height * (0.44 + math.sin(index) * 0.08)
            draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=(warm[0], warm[1], warm[2], 180), outline=(255, 255, 255), width=4)
        draw.rounded_rectangle((width * 0.1, height * 0.68, width * 0.9, height * 0.88), radius=24, fill=(255, 255, 255, 60), outline=accent, width=4)


def _draw_text_panel(image: Image.Image, *, headline: str, subhead: str, image_type: str, content_type: str) -> None:
    from PIL import Image, ImageDraw, ImageFilter

    draw = ImageDraw.Draw(image)
    width, height = image.size
    panel_height = int(height * 0.23)
    panel_top = height - panel_height - int(height * 0.06)
    panel = Image.new("RGBA", image.size, (0, 0, 0, 0))
    panel_draw = ImageDraw.Draw(panel)
    panel_draw.rounded_rectangle((int(width * 0.06), panel_top, int(width * 0.94), height - int(height * 0.04)), radius=32, fill=(10, 10, 14, 150))
    blurred = panel.filter(ImageFilter.GaussianBlur(0.5))
    image.alpha_composite(blurred)

    headline_font = _load_font(max(34, int(height * 0.043)), bold=True)
    subhead_font = _load_font(max(24, int(height * 0.024)), bold=False)
    accent_font = _load_font(max(20, int(height * 0.02)), bold=True)

    draw.text((int(width * 0.1), panel_top + 24), headline, fill=(255, 255, 255), font=headline_font, stroke_width=3, stroke_fill=(0, 0, 0))
    draw.text((int(width * 0.1), panel_top + 24 + int(height * 0.072)), subhead, fill=(245, 238, 231), font=subhead_font, stroke_width=2, stroke_fill=(0, 0, 0))
    draw.text((int(width * 0.1), panel_top + panel_height - 28), f"{content_type.replace('_', ' ').title()} | {image_type.title()}", fill=(255, 206, 84), font=accent_font)


def _local_render(prompt: str, *, content_type: str, image_type: str, size: tuple[int, int]) -> Image.Image:
    from PIL import Image, ImageDraw

    base = Image.new("RGBA", size, (0, 0, 0, 0))
    top, accent, warm = _palette_for(content_type, image_type)
    _draw_gradient(base, top, (max(0, top[0] - 10), max(0, top[1] - 8), max(0, top[2] - 4)))
    draw = ImageDraw.Draw(base)
    _draw_scene(draw, size, content_type=content_type, accent=accent, warm=warm)

    prompt_font = _load_font(max(20, int(size[1] * 0.018)), bold=False)
    title_font = _load_font(max(36, int(size[1] * 0.04)), bold=True)
    headline = _sanitize_text(prompt.split(".")[0] if prompt else content_type.replace("_", " ").title(), limit=42)
    subhead = _sanitize_text(prompt, limit=120)
    draw.text((int(size[0] * 0.08), int(size[1] * 0.08)), headline, fill=(255, 255, 255), font=title_font, stroke_width=3, stroke_fill=(0, 0, 0))
    draw.multiline_text(
        (int(size[0] * 0.08), int(size[1] * 0.17)),
        subhead,
        fill=(255, 248, 242),
        font=prompt_font,
        spacing=8,
        stroke_width=2,
        stroke_fill=(0, 0, 0),
    )
    _draw_text_panel(base, headline=headline, subhead=_sanitize_text(subhead, limit=90), image_type=image_type, content_type=content_type)
    return base.convert("RGB")


def _coerce_generated_image(value: Any) -> Image.Image | None:
    from PIL import Image

    if isinstance(value, Image.Image):
        return value.convert("RGBA")
    if isinstance(value, Path):
        if value.exists():
            return Image.open(value).convert("RGBA")
    if isinstance(value, (bytes, bytearray)):
        from io import BytesIO

        return Image.open(BytesIO(value)).convert("RGBA")
    if isinstance(value, str):
        path = Path(value)
        if path.exists():
            return Image.open(path).convert("RGBA")
    if isinstance(value, dict):
        for key in ("image", "path", "file_path", "bytes", "data"):
            if key not in value:
                continue
            image = _coerce_generated_image(value[key])
            if image is not None:
                return image
    return None


def generate_image(
    *,
    prompt: str,
    content_type: str,
    image_type: str,
    model: str,
    size: tuple[int, int],
    generation_client: ImageGenerationClient | None = None,
    cost_estimate_usd: float | None = 0.0,
) -> GeneratedImage:
    started = time.perf_counter()
    image: Image.Image | None = None
    if generation_client is not None:
        try:
            if hasattr(generation_client, "generate_image"):
                response = generation_client.generate_image(
                    prompt=prompt,
                    model=model,
                    size=size,
                    content_type=content_type,
                    image_type=image_type,
                )
            elif hasattr(generation_client, "generate"):
                response = generation_client.generate(
                    prompt=prompt,
                    model=model,
                    size=size,
                    content_type=content_type,
                    image_type=image_type,
                )
            elif hasattr(generation_client, "create_image"):
                response = generation_client.create_image(
                    prompt=prompt,
                    model=model,
                    size=size,
                    content_type=content_type,
                    image_type=image_type,
                )
            else:
                response = None
            image = _coerce_generated_image(response)
        except Exception:
            image = None
    if image is None:
        image = _local_render(prompt, content_type=content_type, image_type=image_type, size=size)
    generation_time_ms = int((time.perf_counter() - started) * 1000)
    return GeneratedImage(
        image=image,
        image_prompt=prompt,
        model=model,
        prompt_version=PROMPT_LIBRARY_VERSION,
        content_type=content_type,
        image_type=image_type,
        generation_time_ms=generation_time_ms,
        cost_estimate_usd=cost_estimate_usd,
    )
