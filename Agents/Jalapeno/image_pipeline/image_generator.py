from __future__ import annotations

import base64
import math
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

import requests

from prompt_library_loader import PROMPT_LIBRARY_VERSION


class ImageGenerationClient(Protocol):
    def generate_image(self, *, prompt: str, model: str, size: tuple[int, int], content_type: str, image_type: str) -> Any:
        ...


@dataclass(frozen=True, slots=True)
class GeneratedImage:
    image: Any
    image_prompt: str
    model: str
    image_source: str
    prompt_version: str
    content_type: str
    image_type: str
    generation_time_ms: int
    cost_estimate_usd: float | None
    source_details: dict[str, Any] | None = None


class OpenAIImageGenerationClient:
    def __init__(
        self,
        *,
        api_key: str,
        logger=None,
        session: requests.Session | None = None,
        timeout_seconds: int = 300,
    ) -> None:
        self.api_key = api_key
        self.logger = logger
        self._session = session or requests.Session()
        self.timeout_seconds = timeout_seconds

    @classmethod
    def from_env(cls, *, logger=None) -> OpenAIImageGenerationClient | None:
        api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
        if not api_key:
            return None
        return cls(api_key=api_key, logger=logger)

    def generate_image(self, *, prompt: str, model: str, size: tuple[int, int], content_type: str, image_type: str) -> dict[str, Any]:
        response = self._session.post(
            "https://api.openai.com/v1/images/generations",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "prompt": prompt,
                "size": f"{size[0]}x{size[1]}",
            },
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
        data = payload.get("data")
        if not isinstance(data, list) or not data:
            raise ValueError("OpenAI image generation returned no image data")
        first = data[0] if isinstance(data[0], dict) else {}
        image_base64 = first.get("b64_json")
        if not isinstance(image_base64, str) or not image_base64.strip():
            raise ValueError("OpenAI image generation response missing b64_json")
        return {
            "bytes": base64.b64decode(image_base64),
            "revised_prompt": first.get("revised_prompt") if isinstance(first.get("revised_prompt"), str) else None,
            "response_id": payload.get("id") if isinstance(payload.get("id"), str) else None,
        }


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


def _local_render(prompt: str, *, content_type: str, image_type: str, size: tuple[int, int]) -> Image.Image:
    from PIL import Image, ImageDraw

    base = Image.new("RGBA", size, (0, 0, 0, 0))
    top, accent, warm = _palette_for(content_type, image_type)
    _draw_gradient(base, top, (max(0, top[0] - 10), max(0, top[1] - 8), max(0, top[2] - 4)))
    draw = ImageDraw.Draw(base)
    _draw_scene(draw, size, content_type=content_type, accent=accent, warm=warm)
    if image_type == "meme":
        draw.rounded_rectangle((int(size[0] * 0.14), int(size[1] * 0.16), int(size[0] * 0.86), int(size[1] * 0.84)), radius=36, outline=(255, 255, 255), width=6)
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


def _extract_generation_response(value: Any) -> tuple[Image.Image | None, dict[str, Any] | None]:
    metadata: dict[str, Any] | None = value if isinstance(value, dict) else None
    return _coerce_generated_image(value), metadata


def generate_image(
    *,
    prompt: str,
    content_type: str,
    image_type: str,
    model: str,
    size: tuple[int, int],
    generation_client: ImageGenerationClient | None = None,
    cost_estimate_usd: float | None = 0.0,
    allow_placeholder_fallback: bool = True,
) -> GeneratedImage:
    started = time.perf_counter()
    image: Image.Image | None = None
    image_source = "mock" if generation_client is None else "fallback"
    source_details: dict[str, Any] | None = None
    generation_error: Exception | None = None
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
            image, source_details = _extract_generation_response(response)
            if image is not None:
                image_source = "real_ai"
        except Exception as exc:
            generation_error = exc
            image = None
    if image is None:
        if not allow_placeholder_fallback:
            if generation_error is not None:
                raise generation_error
            raise ValueError("No real image generation client result was available")
        image = _local_render(prompt, content_type=content_type, image_type=image_type, size=size)
    generation_time_ms = int((time.perf_counter() - started) * 1000)
    return GeneratedImage(
        image=image,
        image_prompt=prompt,
        model=model,
        image_source=image_source,
        prompt_version=PROMPT_LIBRARY_VERSION,
        content_type=content_type,
        image_type=image_type,
        generation_time_ms=generation_time_ms,
        cost_estimate_usd=cost_estimate_usd,
        source_details=source_details,
    )
