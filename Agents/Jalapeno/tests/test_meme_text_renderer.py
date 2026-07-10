from __future__ import annotations

from pathlib import Path
import sys

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from PIL import Image

from image_pipeline.meme_formatter import format_meme_image
from image_pipeline.meme_text_renderer import (
    OVERLAY_VERTICAL_OFFSET_RATIO,
    SafeArea,
    layout_meme_text,
    render_meme_text,
    sanitize_meme_text,
)


def test_sanitize_meme_text_normalizes_hidden_characters_and_carriage_returns() -> None:
    text = sanitize_meme_text(" \ufeffsend this to\r\nyour\u200b wing crew\x00 ")

    assert text == "SEND THIS TO\nYOUR WING CREW"
    assert "\r" not in text
    assert "\ufeff" not in text
    assert "\u200b" not in text
    assert "\x00" not in text


def test_layout_wraps_and_scales_inside_safe_area() -> None:
    image = Image.new("RGBA", (1080, 1350), (20, 20, 24, 255))
    safe = SafeArea(top=80, side=60, bottom=80)

    layout = layout_meme_text(
        image,
        "IF THEY DON'T REPLY\nTHEY OWE WINGS",
        position="top",
        safe_area=safe,
        emphasis=True,
    )

    assert layout.valid
    assert len(layout.lines) > 1
    assert layout.bbox[0] >= layout.safe_bbox[0]
    assert layout.bbox[1] >= layout.safe_bbox[1]
    assert layout.bbox[2] <= layout.safe_bbox[2]
    assert layout.bbox[3] <= layout.safe_bbox[3]
    for line in layout.lines:
        assert line.width <= layout.safe_bbox[2] - layout.safe_bbox[0]


def test_layout_top_overlay_starts_lower_by_configured_offset() -> None:
    image = Image.new("RGBA", (1080, 1920), (20, 20, 24, 255))
    safe = SafeArea(top=80, side=60, bottom=80)

    layout = layout_meme_text(
        image,
        "SEND THIS TO\nYOUR WING CREW",
        position="top",
        safe_area=safe,
        emphasis=True,
    )

    expected_offset = round(image.height * OVERLAY_VERTICAL_OFFSET_RATIO)
    old_top = safe.top

    assert layout.valid
    assert layout.bbox[1] == old_top + expected_offset
    assert layout.bbox[1] >= layout.safe_bbox[1]
    assert layout.bbox[3] <= layout.safe_bbox[3]


def test_render_meme_text_highlights_final_punchline() -> None:
    image = Image.new("RGBA", (1080, 1350), (20, 20, 24, 255))
    layout = layout_meme_text(
        image,
        "WHO GETS THE LAST WING?\n\nVOTE NOW.",
        position="top",
        emphasis=True,
    )

    assert layout.lines[-1].fill != layout.lines[0].fill


def test_format_meme_image_handles_long_caption_without_clipping() -> None:
    source = Image.new("RGBA", (1024, 1024), (210, 82, 24, 255))

    result = format_meme_image(
        source,
        top_text="SEND THIS TO\nYOUR WING CREW",
        bottom_text="WHO GETS THE\nLAST WING? VOTE.",
    )

    assert result.applied
    assert result.image.size == (1080, 1350)


def test_render_meme_text_rejects_unfittable_safe_area() -> None:
    image = Image.new("RGBA", (320, 320), (20, 20, 24, 255))

    try:
        render_meme_text(
            image,
            "THIS IS A VERY LONG CAPTION THAT CANNOT FIT",
            safe_area=SafeArea(top=150, side=150, bottom=150),
        )
    except ValueError as exc:
        assert "safe area" in str(exc)
    else:
        raise AssertionError("Expected render_meme_text to reject an impossible safe area")
