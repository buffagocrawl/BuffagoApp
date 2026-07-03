from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal


TOP_MARGIN = 80
SIDE_MARGIN = 60
BOTTOM_MARGIN = 80
BUFFAGO_ORANGE = (255, 122, 24)
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)

Position = Literal["top", "center", "bottom"]


@dataclass(frozen=True, slots=True)
class SafeArea:
    top: int = TOP_MARGIN
    side: int = SIDE_MARGIN
    bottom: int = BOTTOM_MARGIN


@dataclass(frozen=True, slots=True)
class MemeTextStyle:
    max_font_size: int = 90
    min_font_size: int = 28
    font_step: int = 2
    line_spacing_ratio: float = 0.14
    block_spacing_ratio: float = 0.38
    stroke_ratio: float = 0.085
    shadow_ratio: float = 0.045
    emphasis_scale: float = 1.14
    emphasis_color: tuple[int, int, int] = BUFFAGO_ORANGE
    fill_color: tuple[int, int, int] = WHITE
    stroke_color: tuple[int, int, int] = BLACK
    shadow_color: tuple[int, int, int, int] = (0, 0, 0, 145)
    uppercase: bool = True


@dataclass(frozen=True, slots=True)
class TextLine:
    text: str
    font: Any
    fill: tuple[int, int, int]
    stroke_fill: tuple[int, int, int]
    shadow_fill: tuple[int, int, int, int]
    width: int
    height: int
    x: int
    y: int
    stroke_width: int
    shadow_offset: int
    offset_x: int
    offset_y: int


@dataclass(frozen=True, slots=True)
class MemeTextLayout:
    lines: tuple[TextLine, ...]
    bbox: tuple[int, int, int, int]
    safe_bbox: tuple[int, int, int, int]
    valid: bool
    font_size: int
    sanitized_text: str


_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_WHITESPACE = re.compile(r"[ \t\f\v]+")


def sanitize_meme_text(text: str, *, uppercase: bool = True) -> str:
    normalized = unicodedata.normalize("NFKC", str(text or ""))
    normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
    normalized = _CONTROL_CHARS.sub("", normalized)
    normalized = normalized.replace("\u200b", "").replace("\ufeff", "")
    normalized = normalized.replace("“", '"').replace("”", '"').replace("’", "'")
    normalized = "\n".join(_WHITESPACE.sub(" ", line).strip() for line in normalized.splitlines())
    normalized = re.sub(r"\n{3,}", "\n\n", normalized).strip()
    if uppercase:
        normalized = normalized.upper()
    return normalized


def _load_font(size: int, *, bold: bool = True) -> Any:
    from PIL import ImageFont

    candidates = [
        Path("C:/Windows/Fonts/impact.ttf"),
        Path("C:/Windows/Fonts/Impact.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/msttcorefonts/Impact.ttf"),
        Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            try:
                return ImageFont.truetype(str(candidate), size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def _measure(draw: Any, text: str, font: Any, *, stroke_width: int = 0) -> tuple[int, int, int, int, int, int]:
    bbox = draw.textbbox((0, 0), text, font=font, stroke_width=stroke_width)
    return bbox[2] - bbox[0], bbox[3] - bbox[1], bbox[0], bbox[1], bbox[2], bbox[3]


def _split_emphasis_blocks(text: str, *, emphasis: bool) -> list[tuple[str, bool]]:
    paragraphs = [part.strip() for part in re.split(r"\n{2,}", text) if part.strip()]
    if not paragraphs:
        return []
    if not emphasis:
        return [(paragraph, False) for paragraph in paragraphs]
    if len(paragraphs) > 1:
        return [(paragraph, index == len(paragraphs) - 1) for index, paragraph in enumerate(paragraphs)]

    source = paragraphs[0]
    colon_match = re.search(r":\s+(.+)$", source)
    if colon_match:
        before = source[: colon_match.start() + 1].strip()
        after = colon_match.group(1).strip()
        return [(before, False), (after, True)] if before and after else [(source, True)]

    sentence_parts = [part.strip() for part in re.split(r"(?<=[.!?])\s+", source) if part.strip()]
    if len(sentence_parts) > 1:
        return [(part, index == len(sentence_parts) - 1) for index, part in enumerate(sentence_parts)]
    return [(source, False)]


def _wrap_words(draw: Any, text: str, font: Any, max_width: int, *, stroke_width: int) -> list[str]:
    raw_lines = [line.strip() for line in text.splitlines() if line.strip()]
    lines: list[str] = []
    for raw_line in raw_lines:
        words = raw_line.split()
        if not words:
            continue
        current = words[0]
        for word in words[1:]:
            trial = f"{current} {word}"
            if _measure(draw, trial, font, stroke_width=stroke_width)[0] <= max_width:
                current = trial
                continue
            lines.append(current)
            current = word
        lines.append(current)
    return lines


def _build_lines(
    draw: Any,
    *,
    blocks: list[tuple[str, bool]],
    base_font_size: int,
    style: MemeTextStyle,
    max_width: int,
) -> tuple[list[dict[str, Any]], int]:
    rows: list[dict[str, Any]] = []
    max_row_width = 0
    stroke_width = max(2, round(base_font_size * style.stroke_ratio))
    shadow_offset = max(1, round(base_font_size * style.shadow_ratio))
    for block_index, (block_text, emphasized) in enumerate(blocks):
        font_size = base_font_size
        if emphasized:
            font_size = max(style.min_font_size, round(base_font_size * style.emphasis_scale))
        font = _load_font(font_size, bold=True)
        block_stroke = max(2, round(font_size * style.stroke_ratio))
        block_shadow = max(1, round(font_size * style.shadow_ratio))
        wrapped = _wrap_words(draw, block_text, font, max_width, stroke_width=block_stroke)
        if not wrapped:
            continue
        for line in wrapped:
            width, height, offset_x, offset_y, _, _ = _measure(draw, line, font, stroke_width=block_stroke)
            max_row_width = max(max_row_width, width)
            rows.append(
                {
                    "text": line,
                    "font": font,
                    "fill": style.emphasis_color if emphasized else style.fill_color,
                    "stroke_fill": style.stroke_color,
                    "shadow_fill": style.shadow_color,
                    "width": width,
                    "height": height,
                    "offset_x": offset_x,
                    "offset_y": offset_y,
                    "stroke_width": block_stroke,
                    "shadow_offset": block_shadow,
                    "gap_after": max(5, round(font_size * style.line_spacing_ratio)),
                }
            )
        if block_index != len(blocks) - 1 and rows:
            rows[-1]["gap_after"] = max(rows[-1]["gap_after"], round(base_font_size * style.block_spacing_ratio))
    if rows:
        rows[-1]["gap_after"] = 0
    return rows, max(max_row_width, stroke_width + shadow_offset)


def _safe_bbox(width: int, height: int, safe_area: SafeArea) -> tuple[int, int, int, int]:
    return (safe_area.side, safe_area.top, width - safe_area.side, height - safe_area.bottom)


def layout_meme_text(
    image: Any,
    text: str,
    *,
    position: Position = "top",
    safe_area: SafeArea | None = None,
    auto_wrap: bool = True,
    auto_scale: bool = True,
    emphasis: bool = True,
    style: MemeTextStyle | None = None,
) -> MemeTextLayout:
    from PIL import ImageDraw

    style = style or MemeTextStyle()
    safe_area = safe_area or SafeArea()
    sanitized = sanitize_meme_text(text, uppercase=style.uppercase)
    safe_left, safe_top, safe_right, safe_bottom = _safe_bbox(image.width, image.height, safe_area)
    max_width = max(1, safe_right - safe_left)
    max_height = max(1, safe_bottom - safe_top)
    draw = ImageDraw.Draw(image)
    blocks = _split_emphasis_blocks(sanitized, emphasis=emphasis)
    if not blocks:
        return MemeTextLayout((), (safe_left, safe_top, safe_left, safe_top), (safe_left, safe_top, safe_right, safe_bottom), True, style.min_font_size, sanitized)

    sizes = range(style.max_font_size, style.min_font_size - 1, -max(1, style.font_step)) if auto_scale else range(style.max_font_size, style.max_font_size - 1, -1)
    fallback: MemeTextLayout | None = None
    for font_size in sizes:
        rows, max_row_width = _build_lines(draw, blocks=blocks, base_font_size=font_size, style=style, max_width=max_width)
        if not auto_wrap:
            rows, max_row_width = _build_lines(draw, blocks=[(" ".join(sanitized.split()), False)], base_font_size=font_size, style=style, max_width=max_width)
        total_height = sum(row["height"] + row["gap_after"] for row in rows)
        if not rows:
            continue
        relative_cursor = 0
        relative_top = rows[0]["offset_y"]
        relative_bottom = rows[0]["offset_y"] + rows[0]["height"] + rows[0]["shadow_offset"]
        for row in rows:
            relative_top = min(relative_top, relative_cursor + row["offset_y"])
            relative_bottom = max(relative_bottom, relative_cursor + row["offset_y"] + row["height"] + row["shadow_offset"])
            relative_cursor += row["height"] + row["gap_after"]
        rendered_height = relative_bottom - relative_top
        if position == "bottom":
            y = safe_bottom - relative_bottom
        elif position == "center":
            y = safe_top + (max_height - rendered_height) // 2 - relative_top
        else:
            y = safe_top - relative_top
        lines: list[TextLine] = []
        cursor_y = y
        left_edge = safe_right
        top_edge = safe_bottom
        right_edge = safe_left
        bottom_edge = safe_top
        for row in rows:
            x = safe_left + (max_width - row["width"]) // 2
            line = TextLine(
                text=row["text"],
                font=row["font"],
                fill=row["fill"],
                stroke_fill=row["stroke_fill"],
                shadow_fill=row["shadow_fill"],
                width=row["width"],
                height=row["height"],
                x=x,
                y=cursor_y,
                stroke_width=row["stroke_width"],
                shadow_offset=row["shadow_offset"],
                offset_x=row["offset_x"],
                offset_y=row["offset_y"],
            )
            lines.append(line)
            left_edge = min(left_edge, x + line.offset_x)
            top_edge = min(top_edge, cursor_y + line.offset_y)
            right_edge = max(right_edge, x + line.offset_x + line.width + line.shadow_offset)
            bottom_edge = max(bottom_edge, cursor_y + line.offset_y + line.height + line.shadow_offset)
            cursor_y += row["height"] + row["gap_after"]
        bbox = (left_edge, top_edge, right_edge, bottom_edge)
        valid = max_row_width <= max_width and total_height <= max_height and bbox[0] >= safe_left and bbox[1] >= safe_top and bbox[2] <= safe_right and bbox[3] <= safe_bottom
        layout = MemeTextLayout(tuple(lines), bbox, (safe_left, safe_top, safe_right, safe_bottom), valid, font_size, sanitized)
        if valid:
            return layout
        fallback = layout
    return fallback or MemeTextLayout((), (safe_left, safe_top, safe_left, safe_top), (safe_left, safe_top, safe_right, safe_bottom), False, style.min_font_size, sanitized)


def render_meme_text(
    image: Any,
    text: str,
    *,
    position: Position = "top",
    safe_area: bool | SafeArea = True,
    auto_wrap: bool = True,
    auto_scale: bool = True,
    emphasis: bool = True,
    style: MemeTextStyle | None = None,
) -> Any:
    from PIL import ImageDraw

    area = SafeArea() if safe_area is True else safe_area if isinstance(safe_area, SafeArea) else SafeArea(0, 0, 0)
    working = image.convert("RGBA")
    layout = layout_meme_text(
        working,
        text,
        position=position,
        safe_area=area,
        auto_wrap=auto_wrap,
        auto_scale=auto_scale,
        emphasis=emphasis,
        style=style,
    )
    if not layout.valid:
        raise ValueError("Unable to fit meme text inside the safe area")
    draw = ImageDraw.Draw(working)
    for line in layout.lines:
        shadow_xy = (line.x + line.shadow_offset, line.y + line.shadow_offset)
        draw.text(shadow_xy, line.text, fill=line.shadow_fill, font=line.font, stroke_width=line.stroke_width, stroke_fill=line.shadow_fill)
        draw.text(
            (line.x, line.y),
            line.text,
            fill=line.fill,
            font=line.font,
            stroke_width=line.stroke_width,
            stroke_fill=line.stroke_fill,
        )
    return working
