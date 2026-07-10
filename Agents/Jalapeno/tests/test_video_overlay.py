from __future__ import annotations

from pathlib import Path
import sys

import pytest

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

import video_overlay as video_overlay_module  # noqa: E402


def test_select_overlay_selection_uses_deterministic_fallback_when_primary_overlay_is_invalid(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        video_overlay_module,
        "finalize_overlay_text",
        lambda **kwargs: {
            "overlay_text": "WHO GETS THE LAST WING? VOTE.",
            "overlay_source": "openai",
            "caption_overlay_concept": "plans",
            "validation_passed": False,
            "validation_failure_reason": "overlay:overlay_not_direct_enough",
            "fallback_used": False,
        },
    )

    result = video_overlay_module.select_overlay_selection("Send this to someone who owes you wings.")

    assert result.fallback_used is True
    assert result.overlay_source == "fallback"
    assert result.validation_passed is True
    assert result.overlay_text in {"SEND THIS TO\nYOUR WING CREW", "WHO GETS THE\nLAST WING? VOTE."}
    assert result.caption_overlay_concept is not None
