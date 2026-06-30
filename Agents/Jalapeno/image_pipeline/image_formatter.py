from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True, slots=True)
class FormatPreset:
    name: str
    width: int
    height: int
    output_format: str = "png"
    quality: int = 92

    @property
    def aspect_ratio(self) -> float:
        return self.width / self.height


INSTAGRAM_FEED_PRESET = FormatPreset(name="instagram_feed", width=1080, height=1350, output_format="jpg", quality=92)
INSTAGRAM_SQUARE_PRESET = FormatPreset(name="instagram_square", width=1080, height=1080, output_format="jpg", quality=92)
INSTAGRAM_LANDSCAPE_PRESET = FormatPreset(name="instagram_landscape", width=1080, height=566, output_format="jpg", quality=92)


def _safe_centering(image_type: str) -> tuple[float, float]:
    if image_type == "meme":
        return 0.5, 0.46
    if image_type in {"restaurant", "food"}:
        return 0.5, 0.52
    if image_type in {"community", "gamification"}:
        return 0.5, 0.5
    return 0.5, 0.5


def _background_color(image: Any) -> tuple[int, int, int]:
    from PIL import Image

    return image.convert("RGB").resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))


def format_for_instagram(
    image: Any,
    *,
    preset: FormatPreset = INSTAGRAM_FEED_PRESET,
    image_type: str = "standard",
    background: tuple[int, int, int] | None = None,
) -> Image.Image:
    from PIL import Image, ImageOps

    working = image.convert("RGBA")
    centering = _safe_centering(image_type)
    fitted = ImageOps.fit(working, (preset.width, preset.height), method=Image.Resampling.LANCZOS, centering=centering)
    if background is None and fitted.mode == "RGBA":
        background = _background_color(fitted)
    if preset.output_format.lower() in {"jpg", "jpeg"}:
        canvas = Image.new("RGB", fitted.size, background or (255, 255, 255))
        canvas.paste(fitted, mask=fitted.getchannel("A") if fitted.mode == "RGBA" else None)
        return canvas
    return fitted.convert("RGBA")


def build_square_fallback(image: Any, *, image_type: str = "standard") -> Any:
    return format_for_instagram(image, preset=INSTAGRAM_SQUARE_PRESET, image_type=image_type)


def save_formatted_image(image: Any, path: Path, *, quality: int = 92) -> None:
    from PIL import Image

    path.parent.mkdir(parents=True, exist_ok=True)
    suffix = path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        image.convert("RGB").save(path, format="JPEG", quality=quality, optimize=True)
    else:
        image.save(path, format="PNG", optimize=True)
