from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True, slots=True)
class BrandingResult:
    image: Any
    applied: bool
    reason: str | None = None
    logo_path: str | None = None


def _load_font(size: int) -> ImageFont.ImageFont:
    from PIL import ImageFont

    candidates = [
        Path("C:/Windows/Fonts/arialbd.ttf"),
        Path("C:/Windows/Fonts/segoeuib.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            try:
                return ImageFont.truetype(str(candidate), size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def _validate_opacity(value: Any) -> float:
    opacity = float(value)
    if opacity < 0.0 or opacity > 1.0:
        raise ValueError("branding.opacity must be between 0 and 1")
    return opacity


def apply_branding(
    image: Any,
    *,
    branding_config: Any,
    label_text: str = "Buffago",
) -> BrandingResult:
    from PIL import Image, ImageDraw

    enabled = bool(getattr(branding_config, "enabled", False))
    if not enabled:
        return BrandingResult(image=image, applied=False, reason="branding_disabled")

    logo_path_value = str(getattr(branding_config, "logo_path", "") or "").strip()
    if not logo_path_value or logo_path_value == ".":
        return BrandingResult(image=image, applied=False, reason="logo_missing")

    logo_path = Path(logo_path_value)
    if not logo_path.exists():
        return BrandingResult(image=image, applied=False, reason="logo_missing", logo_path=logo_path_value)

    opacity = _validate_opacity(getattr(branding_config, "opacity", 0.65))
    placement = str(getattr(branding_config, "placement", "bottom_right") or "bottom_right").strip().lower()
    margin_px = int(getattr(branding_config, "margin_px", 32))
    max_width_percent = int(getattr(branding_config, "max_width_percent", 12))
    border_enabled = bool(getattr(branding_config, "border_enabled", False))
    accent_color = str(getattr(branding_config, "accent_color", "#F36C21") or "#F36C21")

    base = image.convert("RGBA")
    logo = Image.open(logo_path).convert("RGBA")
    max_logo_width = max(1, int(base.width * (max_width_percent / 100.0)))
    if logo.width > max_logo_width:
        ratio = max_logo_width / logo.width
        logo = logo.resize((max_logo_width, max(1, int(logo.height * ratio))), Image.Resampling.LANCZOS)

    alpha = logo.getchannel("A")
    alpha = alpha.point(lambda value: int(value * opacity))
    logo.putalpha(alpha)

    if placement != "bottom_right":
        placement = "bottom_right"
    position = (base.width - logo.width - margin_px, base.height - logo.height - margin_px)
    if border_enabled:
        border = Image.new("RGBA", base.size, (0, 0, 0, 0))
        border_draw = ImageDraw.Draw(border)
        border_draw.rounded_rectangle(
            (margin_px // 2, margin_px // 2, base.width - margin_px // 2, base.height - margin_px // 2),
            radius=24,
            outline=accent_color,
            width=4,
        )
        base = Image.alpha_composite(base, border)

    base.alpha_composite(logo, dest=position)

    text_label = str(getattr(branding_config, "label_text", label_text) or label_text).strip()
    if text_label:
        draw = ImageDraw.Draw(base)
        font = _load_font(max(18, int(base.width * 0.022)))
        text_bbox = draw.textbbox((0, 0), text_label, font=font)
        text_width = text_bbox[2] - text_bbox[0]
        text_height = text_bbox[3] - text_bbox[1]
        text_x = position[0] - text_width - 14
        text_y = position[1] + max(0, (logo.height - text_height) // 2)
        draw.rounded_rectangle(
            (text_x - 10, text_y - 6, text_x + text_width + 10, text_y + text_height + 6),
            radius=10,
            fill=(0, 0, 0, 140),
        )
        draw.text((text_x, text_y), text_label, fill=(255, 255, 255), font=font)

    return BrandingResult(image=base.convert(image.mode if image.mode != "P" else "RGBA"), applied=True, reason=None, logo_path=str(logo_path))
