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
    asset_loaded: bool = False
    position: str | None = None
    scale: float | None = None


def _validate_opacity(value: Any) -> float:
    opacity = float(value)
    if opacity < 0.0 or opacity > 1.0:
        raise ValueError("branding.opacity must be between 0 and 1")
    return opacity


def apply_branding(
    image: Any,
    *,
    branding_config: Any,
    label_text: str = "",
    avoid_bottom_text: bool = False,
) -> BrandingResult:
    from PIL import Image, ImageDraw

    enabled = bool(getattr(branding_config, "enabled", False))
    if not enabled:
        return BrandingResult(image=image, applied=False, reason="branding_disabled", asset_loaded=False)

    logo_path_value = str(getattr(branding_config, "logo_path", "") or "").strip()
    if not logo_path_value or logo_path_value == ".":
        return BrandingResult(image=image, applied=False, reason="logo_missing", asset_loaded=False)

    logo_path = Path(logo_path_value)
    if not logo_path.exists():
        return BrandingResult(image=image, applied=False, reason="logo_missing", logo_path=logo_path_value, asset_loaded=False)

    opacity = _validate_opacity(getattr(branding_config, "opacity", 0.65))
    placement = str(getattr(branding_config, "placement", "bottom_right") or "bottom_right").strip().lower()
    margin_px = int(getattr(branding_config, "margin_px", 32))
    max_width_percent = int(getattr(branding_config, "max_width_percent", 12))
    border_enabled = bool(getattr(branding_config, "border_enabled", False))
    accent_color = str(getattr(branding_config, "accent_color", "#F36C21") or "#F36C21")

    base = image.convert("RGBA")
    try:
        logo = Image.open(logo_path).convert("RGBA")
    except OSError:
        return BrandingResult(image=image, applied=False, reason="logo_unreadable", logo_path=logo_path_value, asset_loaded=False)
    original_logo_width = logo.width
    max_logo_width = max(1, int(base.width * (max_width_percent / 100.0)))
    if logo.width > max_logo_width:
        ratio = max_logo_width / logo.width
        logo = logo.resize((max_logo_width, max(1, int(logo.height * ratio))), Image.Resampling.LANCZOS)
    scale = logo.width / max(original_logo_width, 1)

    alpha = logo.getchannel("A")
    alpha = alpha.point(lambda value: int(value * opacity))
    logo.putalpha(alpha)

    if placement != "bottom_right":
        placement = "bottom_right"
    x = max(margin_px, base.width - logo.width - margin_px)
    y = base.height - logo.height - margin_px
    if avoid_bottom_text:
        y = max(margin_px, int(base.height * 0.68) - logo.height)
    position = (x, y)
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

    return BrandingResult(
        image=base.convert(image.mode if image.mode != "P" else "RGBA"),
        applied=True,
        reason=None,
        logo_path=str(logo_path),
        asset_loaded=True,
        position=f"{placement}:{position[0]},{position[1]}",
        scale=round(scale, 4),
    )
