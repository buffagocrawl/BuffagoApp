from __future__ import annotations

from pathlib import Path
import sys

import pytest

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

import video_overlay as video_overlay_module  # noqa: E402
from caption_rules import validate_overlay_text  # noqa: E402


REGRESSION_CAPTION = (
    "Send this to the friend who thinks they can out-eat this plate. "
    "Buffago can help find the next stop.\n\n"
    "#Buffago #BuffaloWings #WingNight #ChickenWings"
)


def test_select_overlay_selection_uses_deterministic_fallback_when_primary_overlay_is_invalid(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(video_overlay_module, "_clean_overlay_text", lambda text: "WING CREW")

    result = video_overlay_module.select_overlay_selection("Send this to someone who owes you wings.")

    assert result.fallback_used is True
    assert result.overlay_source == "fallback"
    assert result.validation_passed is True
    assert result.overlay_text in {"SEND THIS TO\nYOUR WING CREW", "WHO GETS THE\nLAST WING? VOTE."}
    assert result.caption_overlay_concept is not None


def test_select_overlay_selection_accepts_caption_with_actual_newlines() -> None:
    result = video_overlay_module.select_overlay_selection(REGRESSION_CAPTION)

    assert result.validation_passed is True
    assert result.overlay_text


def test_select_overlay_selection_validates_overlay_candidate_only(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def _record(text: str, **kwargs):
        calls.append(text)
        return validate_overlay_text(text, **kwargs)

    monkeypatch.setattr(video_overlay_module, "validate_overlay_text", _record)

    result = video_overlay_module.select_overlay_selection(REGRESSION_CAPTION)

    assert result.validation_passed is True
    assert REGRESSION_CAPTION not in calls
    assert all("#Buffago" not in call for call in calls)


def test_select_overlay_selection_uses_supplied_valid_overlay_text() -> None:
    result = video_overlay_module.select_overlay_selection(
        REGRESSION_CAPTION,
        overlay_text="SEND THIS TO\nYOUR WING CREW",
    )

    assert result.validation_passed is True
    assert result.overlay_source == "openai"
    assert result.overlay_text == "SEND THIS TO\nYOUR WING CREW"
