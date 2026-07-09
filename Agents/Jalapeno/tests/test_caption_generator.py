from __future__ import annotations

from dataclasses import replace
from io import StringIO
from pathlib import Path
import sys

import pytest

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from caption_rules import CAPTION_STYLE_ORDER, CURATED_FALLBACK_CAPTIONS, generate_caption_samples, validate_caption, validate_overlay_text, validate_post_pair  # noqa: E402
from ai_client import JalapenoAIClient  # noqa: E402
from config import initialize_logging, load_configuration  # noqa: E402
from content_engine.candidate_generator import ContentCandidate  # noqa: E402
from content_engine.caption_generator import generate_caption_package  # noqa: E402
from data_snapshot import generate_latest_snapshot  # noqa: E402
from validation import validate_content_engine_environment  # noqa: E402


@pytest.fixture(autouse=True)
def required_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FACEBOOK_PAGE_ID", "facebook-page-id")
    monkeypatch.setenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "instagram-business-account-id")
    for key in (
        "TIMEZONE",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "META_APP_ID",
        "META_APP_SECRET",
        "META_LONG_LIVED_ACCESS_TOKEN",
    ):
        monkeypatch.delenv(key, raising=False)


def _candidate() -> ContentCandidate:
    return ContentCandidate(
        candidate_id="11111111-1111-1111-1111-111111111111",
        content_type="restaurant_spotlight",
        reason_chosen="caption test",
        working_title="Crispy Corner close-up",
        short_summary="Spotlight a wing restaurant.",
        target_emotion="Hungry",
        suggested_cta="Comment your go-to wing order.",
        suggested_image_concept="Hero plate of wings.",
        suggested_caption_angle="Keep it short and wing-first.",
        primary_theme="restaurant focus",
        secondary_theme="recent ratings",
        mood="Friendly",
        hook_style="direct local hook",
        cta_category="comment",
        restaurants_mentioned=["Crispy Corner"],
        cities_mentioned=["Buffalo"],
        states_mentioned=["NY"],
        food_categories=["wings", "sauce"],
        visual_style="realistic",
    )


@pytest.mark.parametrize(
    "caption",
    [
        "this wing post understood the assignment better than a group chat",
        "If this wing had a voicemail, it would just say bring napkins.",
        "POV: sauce chose violence",
        "main character energy on a plate",
        "It's giving crispy chaos.",
        "This wing paid rent.",
        "bring napkins for this wing plate",
    ],
)
def test_validate_caption_rejects_banned_examples(caption: str) -> None:
    result = validate_caption(caption)

    assert result["passed"] is False
    assert result["valid"] is False
    assert result["issues"]


@pytest.mark.parametrize(
    "caption",
    [
        "Send this to someone who owes you wings.",
        "Tag the friend who would destroy this plate.",
        "If they don't answer in 10 minutes, they owe you wings.",
        "Comment flats or drums.",
        "Send this to the group chat and see who folds first.",
    ],
)
def test_validate_caption_accepts_good_examples(caption: str) -> None:
    result = validate_caption(caption)

    assert result["passed"] is True
    assert result["valid"] is True
    assert result["issues"] == []


def test_validate_caption_rejects_generic_food_copy_without_wing_specificity() -> None:
    result = validate_caption("If this made you hungry, you know what to do.")

    assert result["passed"] is False
    assert "missing_wing_specificity" in result["issues"]


def test_validate_caption_rejects_caption_without_cta() -> None:
    result = validate_caption("These wings are the whole mood.")

    assert result["passed"] is False
    assert "missing_engagement_action" in result["issues"]


def test_validate_caption_rejects_hashtags_inside_caption() -> None:
    result = validate_caption("Send this to someone who owes you wings. #Buffago")

    assert result["passed"] is False
    assert "hashtags_belong_outside_caption" in result["issues"]


@pytest.mark.parametrize(
    "overlay",
    [
        "SEND THIS TO\nYOUR WING CREW",
        "IF THEY DON'T REPLY\nTHEY OWE WINGS",
        "WHO'S EATING\nTHIS WITH YOU?",
        "FLATS OR DRUMS?\nPICK A SIDE.",
        "CANCEL YOUR PLANS.\nGET WINGS.",
    ],
)
def test_validate_overlay_text_accepts_share_trigger_examples(overlay: str) -> None:
    result = validate_overlay_text(overlay)

    assert result["passed"] is True
    assert result["issues"] == []


@pytest.mark.parametrize(
    "overlay",
    [
        "IF THIS WING HAD A VOICEMAIL",
        "THIS WING UNDERSTOOD THE ASSIGNMENT",
        "A TOTALLY UNRELATED CLEVER THOUGHT",
        "WINGS PAYING RENT AGAIN",
    ],
)
def test_validate_overlay_text_rejects_banned_or_generic_ai_overlay(overlay: str) -> None:
    result = validate_overlay_text(overlay)

    assert result["passed"] is False
    assert result["issues"]


def test_validate_overlay_text_rejects_overlay_without_cta() -> None:
    result = validate_overlay_text("YOUR WING CREW")

    assert result["passed"] is False
    assert "overlay_not_direct_enough" in result["issues"]


def test_validate_post_pair_rejects_mismatched_overlay_and_caption() -> None:
    result = validate_post_pair(
        "Send this to the group chat and start the timer.",
        "FLATS OR DRUMS?\nPICK A SIDE.",
    )

    assert result["passed"] is False
    assert "caption_overlay_mismatch" in result["issues"]


def test_validate_post_pair_accepts_matched_overlay_and_caption() -> None:
    result = validate_post_pair(
        "Send this to someone who owes you wings.",
        "SEND THIS TO\nYOUR WING CREW",
    )

    assert result["passed"] is True
    assert result["caption_overlay_concept"] is not None


def test_validate_post_pair_allows_overlay_without_cta_when_it_reinforces_caption() -> None:
    result = validate_post_pair(
        "Send this to someone who owes you wings.",
        "YOUR WING CREW",
    )

    assert result["passed"] is True
    assert result["overlay_reinforces_caption"] is True


def test_generate_caption_package_uses_allowed_styles_and_short_caption() -> None:
    package = generate_caption_package(
        _candidate(),
        snapshot={},
        external_context={"day_of_week": "Saturday", "sports_events": ["playoffs"]},
    )

    assert package.caption_style in CAPTION_STYLE_ORDER
    assert package.caption_type == package.caption_style
    assert package.validation_passed is True
    assert package.fallback_used is False
    assert package.caption_source == "template"
    assert package.caption_length <= 160
    assert "\\n" not in package.caption
    assert "\n" not in package.caption
    assert package.selected_caption_style
    assert package.overlay_text
    assert package.overlay_validation_passed is True
    assert validate_post_pair(package.caption, package.overlay_text)["passed"] is True


def test_generate_caption_package_falls_back_when_primary_caption_is_invalid(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "content_engine.caption_generator._pick_caption",
        lambda candidate, external_context: ("simple_hype", "Main character energy\\nfor dinner."),
    )

    package = generate_caption_package(
        _candidate(),
        snapshot={},
        external_context={},
    )

    assert package.fallback_used is True
    assert package.validation_passed is True
    assert package.caption_source == "fallback"
    assert package.caption_style in CAPTION_STYLE_ORDER
    assert "main character energy" not in package.caption.lower()
    assert "\\n" not in package.caption
    assert package.overlay_validation_passed is True


def test_generate_caption_samples_returns_20_valid_records() -> None:
    samples = generate_caption_samples()

    assert len(samples) == 20
    assert {sample["source"] for sample in samples} <= {"template"}
    assert all(sample["validation"]["valid"] is True for sample in samples)
    assert all(sample["caption"] for sample in samples)
    assert all(sample["overlay_text"] for sample in samples)
    assert all(sample["style"] in CAPTION_STYLE_ORDER for sample in samples)


def test_curated_fallback_captions_are_all_cta_based() -> None:
    for caption in CURATED_FALLBACK_CAPTIONS:
        validation = validate_caption(caption)
        assert validation["passed"] is True
        assert validation["engagement_actions"], caption


def test_content_engine_logs_caption_style_validation_and_fallback_fields(tmp_path: Path) -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    snapshot = generate_latest_snapshot(output_path=tmp_path / "latest_snapshot.json").snapshot
    external_context = {
        "agent": "Jalapeno",
        "phase": 4,
        "day_of_week": "Saturday",
        "major_holidays": [],
        "minor_holidays": [],
        "food_holidays": [],
        "local_or_national_events": ["Saturday wing night"],
        "sports_events": ["NHL playoffs"],
        "trend_topics": ["weekend wing plans"],
        "news_topics": [],
        "recommended_content_angles": ["Wing night"],
        "source_summary": {"signals_used": ["sports_events"], "fallback_used": True},
    }
    stream = StringIO()
    logger = initialize_logging(replace(config, log_directory=tmp_path / "logs"), stream=stream)

    validate_content_engine_environment(
        config,
        snapshot,
        external_context,
        logger=logger,
        client=None,
        dry_run=True,
        output_path=tmp_path / "latest_content_decision.json",
    )

    output = stream.getvalue()
    assert "caption_generated" in output
    assert "selected_caption_style=" in output
    assert "caption_length=" in output
    assert "validation_passed=" in output
    assert "fallback_used=" in output


def test_ai_text_generation_uses_curated_fallback_when_caption_validation_fails() -> None:
    client = JalapenoAIClient(logger=None)
    bad_response = {
        "success": True,
        "model": "test-model",
        "output": {
            "content_slot": "buffago_post",
            "post_type": "restaurant_spotlight",
            "caption": "POV main character energy for dinner.",
            "hashtags": ["#Buffago", "#Wings"],
            "image_prompt": "Hero plate of wings.",
            "alt_text": "Wings on a plate.",
            "content_angle": "test",
            "source_signals_used": ["fallback_context"],
            "why_this_post": "test",
            "brand_safety_notes": ["safe"],
            "confidence_score": 0.9,
        },
        "usage": {"input_tokens": 1, "output_tokens": 1, "total_tokens": 2},
        "safety": {"passed": True, "reasons": [], "risk_level": "low", "notes": []},
    }
    client._invoke_backend = lambda payload: bad_response  # type: ignore[method-assign]

    result = client.generate_text_content(
        agent_name="Jalapeno",
        run_id="run-1",
        internal_snapshot={},
        external_context={"source_summary": {"signals_used": ["fallback_context"], "fallback_used": False}},
        content_slot="buffago_post",
    )

    assert result.used_fallback is True
    assert result.output["caption"]
    assert "main character energy" not in result.output["caption"].lower()
    assert "\\n" not in result.output["caption"]
    assert result.output["validation_passed"] is True
    assert result.output["caption_length"] <= 160
    assert result.output["selected_caption_style"] in CAPTION_STYLE_ORDER
