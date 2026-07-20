from __future__ import annotations

from creative_pair import (
    CTAType,
    FailureClassification,
    create_creative_pair,
    repair_creative_pair,
    validate_creative_pair,
)
import creative_pair as creative_pair_module


INCIDENT_CAPTION = (
    "Who gets the last wing? Comment below.\n\n"
    "#BuffagoEats #ConnecticutEats #WingNight #Foodie #WingCrawl"
)
INCIDENT_OVERLAY = "SEND THIS TO\nYOUR WING CREW"


def test_july_19_incident_is_detected_and_repaired_once() -> None:
    initial = validate_creative_pair(INCIDENT_CAPTION, INCIDENT_OVERLAY)
    assert initial.passed is False
    assert initial.caption_cta_type is CTAType.COMMENT
    assert initial.overlay_cta_type is CTAType.SEND
    assert "caption_overlay_mismatch" in initial.errors

    pair = create_creative_pair(
        caption_text=INCIDENT_CAPTION,
        overlay_text=INCIDENT_OVERLAY,
        caption_source="openai_repaired",
        overlay_source="openai",
    )
    assert pair.failure_classification is FailureClassification.CREATIVE_REPAIRABLE
    repaired = repair_creative_pair(pair)
    assert repaired.repair_count == 1
    assert repaired.cta_type is CTAType.COMMENT
    assert repaired.overlay_cta_type is CTAType.COMMENT
    assert repaired.overlay_text != INCIDENT_OVERLAY
    assert repaired.validation_status == "passed"
    assert validate_creative_pair(repaired.caption_text, repaired.overlay_text).passed
    assert repair_creative_pair(repaired) is repaired


def test_final_caption_discards_stale_openai_send_metadata() -> None:
    pair = create_creative_pair(
        caption_text="Who gets the last wing? Comment below.",
        overlay_text=INCIDENT_OVERLAY,
        caption_source="repaired",
        overlay_source="openai",
        content_angle=None,
    )
    repaired = repair_creative_pair(pair)
    assert repaired.cta_type is CTAType.COMMENT
    assert repaired.content_angle == "comment"
    assert repaired.overlay_source == "deterministic_repair"
    assert repaired.overlay_cta_type is CTAType.COMMENT


def test_matching_send_pair_passes_without_repair() -> None:
    result = validate_creative_pair("Send this to your wing crew.", INCIDENT_OVERLAY)
    assert result.passed
    assert result.caption_cta_type is CTAType.SEND
    assert result.overlay_cta_type is CTAType.SEND


def test_matching_question_comment_pair_passes() -> None:
    result = validate_creative_pair("Flats or drums? Comment below.", "FLATS OR DRUMS?")
    assert result.passed
    assert result.caption_cta_type is CTAType.COMMENT


def test_state_text_normalizes_newlines_but_not_material_changes() -> None:
    pair = create_creative_pair(
        caption_text=INCIDENT_CAPTION.replace("\n", "\r\n"),
        overlay_text="WHO GETS THE\r\nLAST WING?",
        caption_source="repaired",
        overlay_source="deterministic_repair",
    )
    assert pair.validation_status == "passed"
    assert "\r" not in pair.caption_text
    assert "\r" not in pair.overlay_text


def test_unrepairable_mismatch_stops_after_one_attempt(monkeypatch) -> None:
    pair = create_creative_pair(
        caption_text=INCIDENT_CAPTION,
        overlay_text=INCIDENT_OVERLAY,
        caption_source="repaired",
        overlay_source="openai",
    )
    monkeypatch.setattr(creative_pair_module, "deterministic_overlay", lambda *_: INCIDENT_OVERLAY)
    repaired = repair_creative_pair(pair)
    assert repaired.repair_count == 1
    assert repaired.validation_status == "failed"
    assert repaired.failure_classification is FailureClassification.CREATIVE_UNREPAIRABLE
    assert repair_creative_pair(repaired) is repaired
