from __future__ import annotations

from dataclasses import replace
from io import StringIO
import json
import logging
from pathlib import Path
import sys
from uuid import uuid4

import pytest

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from caption_rules import CAPTION_STYLE_ORDER, CURATED_FALLBACK_CAPTIONS, compose_caption_with_hashtags, generate_caption_samples, repair_hashtag_list, validate_caption, validate_overlay_text, validate_post_pair  # noqa: E402
from ai_client import JalapenoAIClient  # noqa: E402
from config import initialize_logging, load_configuration  # noqa: E402
from content_engine.candidate_generator import ContentCandidate  # noqa: E402
from content_engine import caption_generator as caption_generator_module  # noqa: E402
from content_engine.caption_generator import AICopyRequiredError, generate_caption_package  # noqa: E402
from content_engine.content_ranking import score_caption_overlay_variant  # noqa: E402
from data_snapshot import generate_latest_snapshot  # noqa: E402
from openai_client import OpenAIContentClient  # noqa: E402
from validation import validate_content_engine_environment  # noqa: E402


@pytest.fixture(autouse=True)
def required_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FACEBOOK_PAGE_ID", "facebook-page-id")
    monkeypatch.setenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "instagram-business-account-id")
    for key in (
        "TIMEZONE",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "OPENAI_API_KEY",
        "USE_OPENAI",
        "AI_ENABLED",
        "ENABLE_AI_COPY",
        "JALAPENO_REQUIRE_AI_ONLY_COPY",
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


def test_validate_caption_accepts_exactly_five_hashtags_when_required() -> None:
    result = validate_caption(
        "Send this to someone who owes you wings. #Buffago #WingLovers #CTFood #BuffaloWings #Foodie",
        require_hashtags=True,
    )

    assert result["passed"] is True
    assert result["hashtag_count"] == 5


def test_repair_hashtag_list_fills_zero_hashtags_to_exactly_five() -> None:
    repaired = repair_hashtag_list([], expected_count=5)

    assert repaired.original_count == 0
    assert repaired.repaired_count == 5
    assert repaired.hashtags == ["#Buffago", "#BuffaloWings", "#WingNight", "#ChickenWings", "#Foodie"]


def test_repair_hashtag_list_fills_four_hashtags_to_exactly_five() -> None:
    repaired = repair_hashtag_list(
        ["#Buffago", "#BuffaloWings", "#WingNight", "#ChickenWings"],
        expected_count=5,
    )

    assert repaired.original_count == 4
    assert repaired.hashtags == ["#Buffago", "#BuffaloWings", "#WingNight", "#ChickenWings", "#Foodie"]


def test_repair_hashtag_list_keeps_five_hashtags_except_normalization() -> None:
    repaired = repair_hashtag_list(
        ["buffago", "#Buffalo-Wings", "WingNight!!", "Chicken Wings", "#Foodie"],
        expected_count=5,
    )

    assert repaired.original_count == 5
    assert repaired.hashtags == ["#buffago", "#BuffaloWings", "#WingNight", "#ChickenWings", "#Foodie"]


def test_repair_hashtag_list_trims_seven_hashtags_to_exactly_five() -> None:
    repaired = repair_hashtag_list(
        ["#Buffago", "#BuffaloWings", "#WingNight", "#ChickenWings", "#Foodie", "#Wings", "#FoodTok"],
        expected_count=5,
    )

    assert repaired.original_count == 7
    assert repaired.hashtags == ["#Buffago", "#BuffaloWings", "#WingNight", "#ChickenWings", "#Foodie"]


def test_repair_hashtag_list_dedupes_and_refills_to_exactly_five() -> None:
    repaired = repair_hashtag_list(
        ["#Buffago", "buffago", "#WingNight", "#WingNight", "#Foodie"],
        expected_count=5,
    )

    assert repaired.original_count == 3
    assert repaired.repaired_count == 5
    assert repaired.hashtags == ["#Buffago", "#WingNight", "#Foodie", "#BuffaloWings", "#ChickenWings"]


def test_compose_caption_with_hashtags_repairs_embedded_caption_hashtags() -> None:
    caption = compose_caption_with_hashtags(
        "Tag the friend who would try this #Buffago tonight. #WingNight",
        ["#BuffaloWings", "#Foodie"],
        context={"state": "CT"},
    )

    assert caption.endswith("#BuffaloWings #Foodie #Buffago #WingNight #ConnecticutFood")
    assert " #Buffago tonight" not in caption
    assert validate_caption(caption, require_hashtags=True)["passed"] is True


def test_openai_client_parses_json_in_code_fences_and_prose() -> None:
    class _FakeResponse:
        status_code = 200
        reason = "OK"

        def json(self) -> dict[str, object]:
            return {
                "choices": [
                    {
                        "message": {
                            "content": "Here you go:\n```json\n[{\"caption\":\"Send this to someone who owes you wings.\",\"overlay_text\":\"SEND THIS TO YOUR WING CREW\",\"cta_type\":\"send\",\"content_angle\":\"share\"}]\n```\nThanks."
                        }
                    }
                ],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            }

        @property
        def text(self) -> str:
            return ""

    class _FakeSession:
        def post(self, *args, **kwargs) -> _FakeResponse:
            return _FakeResponse()

    client = OpenAIContentClient("test-key", model="gpt-4.1-mini", session=_FakeSession())
    result = client.generate_variant_set(
        stage="caption_generation",
        system_prompt="system",
        user_prompt="user",
        options_count=4,
    )

    assert result.success is True
    assert isinstance(result.output, list)
    assert result.output[0]["caption"] == "Send this to someone who owes you wings."


def test_extract_openai_variant_payloads_accepts_single_object_and_alternate_keys() -> None:
    payloads = caption_generator_module._extract_openai_variant_payloads(
        {
            "caption": "Tag the friend who would destroy this plate.",
            "overlay": "TAG YOUR WING FRIEND",
            "cta_type": "tag",
            "content_angle": "share",
        }
    )

    assert len(payloads) == 1
    assert payloads[0]["caption"] == "Tag the friend who would destroy this plate."
    assert payloads[0]["overlay_text"] == "TAG YOUR WING FRIEND"
    assert payloads[0]["cta_type"] == "tag"
    assert payloads[0]["content_angle"] == "share"


@pytest.mark.parametrize(
    "overlay",
    [
        "SEND THIS TO\nYOUR WING CREW",
        "IF THEY DON'T REPLY\nTHEY OWE WINGS",
        "WHO'S EATING\nTHIS WITH YOU?",
        "WHO GETS THE\nLAST WING? VOTE.",
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


def test_validate_overlay_text_rejects_literal_newline_escape() -> None:
    result = validate_overlay_text("SEND THIS TO\\nYOUR WING CREW")

    assert result["passed"] is False
    assert "literal_newline_escape_present" in result["issues"]


def test_validate_overlay_text_rejects_overlay_without_cta() -> None:
    result = validate_overlay_text("YOUR WING CREW")

    assert result["passed"] is False
    assert "overlay_not_direct_enough" in result["issues"]


def test_validate_post_pair_rejects_mismatched_overlay_and_caption() -> None:
    result = validate_post_pair(
        "Send this to the group chat and start the timer.",
        "WHO GETS THE\nLAST WING? VOTE.",
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
    assert package.fallback_used is True
    assert package.caption_source == "template"
    assert package.caption_length <= 160
    assert "\\n" not in package.caption
    assert "\n" not in package.caption
    assert len(package.hashtags) == 5
    assert package.caption.count("#") == 5
    assert validate_caption(package.caption, require_hashtags=True)["passed"] is True
    assert package.selected_caption_style
    assert package.overlay_text
    assert package.overlay_validation_passed is True
    assert validate_post_pair(package.caption, package.overlay_text)["passed"] is True
    assert package.openai_used is False
    assert package.openai_model is None
    assert package.feedback_summary_version == "feedback-v1"
    assert package.ranking_score >= 0
    assert package.caption_options
    assert package.overlay_options
    assert package.caption_options[0]["caption"]


def test_generate_caption_package_falls_back_when_primary_caption_is_invalid(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "content_engine.caption_generator._local_variant_plan",
        lambda candidate, snapshot, external_context, feedback_summary: [
            {
                "source": "template",
                "caption": "Main character energy for dinner.",
                "overlay_text": "WINGS FOR THE WIN",
                "caption_style": "simple_hype",
                "caption_source": "template",
                "overlay_source": "template",
                "validation": {"passed": False, "issues": ["missing_engagement_action"]},
                "hashtags": ["#Buffago", "#WingLovers", "#CTFood", "#BuffaloWings", "#LocalEats"],
                "feedback_summary_version": feedback_summary.version,
            }
        ],
    )
    monkeypatch.setattr(
        "content_engine.caption_generator._openai_variant_plan",
        lambda *args, **kwargs: ([], None, "OpenAI is not configured", None),
    )
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
    assert len(package.hashtags) == 5
    assert package.caption.count("#") == 5
    assert validate_caption(package.caption, require_hashtags=True)["passed"] is True
    assert package.openai_used is False
    assert package.fallback_used is True


def test_generate_caption_package_repairs_openai_variant_with_missing_cta(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("content_engine.caption_generator._local_variant_plan", lambda *args, **kwargs: [])
    monkeypatch.setattr(
        "content_engine.caption_generator._openai_variant_plan",
        lambda *args, **kwargs: (
            [
                {
                    "source": "openai",
                    "caption": "Best wings in Connecticut? #Buffago #WingNight #Foodie",
                    "overlay_text": "BEST WINGS?",
                    "caption_style": "simple_hype",
                    "caption_source": "openai",
                    "overlay_source": "openai",
                    "validation": {"passed": False, "issues": ["missing_engagement_action"]},
                    "hashtags": ["#Buffago", "#WingNight", "#Foodie"],
                    "feedback_summary_version": "feedback-v1",
                    "openai_model": "gpt-4.1-mini",
                }
            ],
            None,
            None,
            "raw response",
        ),
    )

    package = generate_caption_package(
        _candidate(),
        snapshot={},
        external_context={},
        require_ai_copy=True,
    )

    assert package.copy_source == "repaired"
    assert package.openai_used is True
    assert len(package.hashtags) == 5
    assert package.caption.count("#") == 5
    assert validate_caption(package.caption, require_hashtags=True)["passed"] is True
    assert "voicemail" not in package.caption.lower()
    assert package.overlay_text
    assert package.overlay_validation_passed is True


def test_generate_caption_package_repairs_banned_voicemail_variant(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("content_engine.caption_generator._local_variant_plan", lambda *args, **kwargs: [])
    monkeypatch.setattr(
        "content_engine.caption_generator._openai_variant_plan",
        lambda *args, **kwargs: (
            [
                {
                    "source": "openai",
                    "caption": "If this wing had a voicemail, it would say bring napkins. #Buffago #WingNight",
                    "overlay_text": "TAG YOUR WING FRIEND",
                    "caption_style": "simple_hype",
                    "caption_source": "openai",
                    "overlay_source": "openai",
                    "validation": {"passed": False, "issues": ["banned_phrase:voicemail"]},
                    "hashtags": ["#Buffago", "#WingNight"],
                    "feedback_summary_version": "feedback-v1",
                    "openai_model": "gpt-4.1-mini",
                }
            ],
            None,
            None,
            "raw response",
        ),
    )

    package = generate_caption_package(
        _candidate(),
        snapshot={},
        external_context={},
        require_ai_copy=True,
    )

    assert package.copy_source in {"repaired", "fallback"}
    assert "voicemail" not in package.caption.lower()
    assert len(package.hashtags) == 5
    assert validate_caption(package.caption, require_hashtags=True)["passed"] is True


def test_generate_caption_package_dry_run_fallback_does_not_raise_when_openai_returns_no_valid_variants(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("content_engine.caption_generator._local_variant_plan", lambda *args, **kwargs: [])
    monkeypatch.setattr(
        "content_engine.caption_generator._openai_variant_plan",
        lambda *args, **kwargs: ([], None, "all_openai_variants_invalid", "raw response"),
    )

    package = generate_caption_package(
        _candidate(),
        snapshot={},
        external_context={},
        require_ai_copy=True,
    )

    assert package.copy_source == "fallback"
    assert package.validation_passed is True
    assert len(package.hashtags) == 5
    assert package.caption.count("#") == 5
    assert validate_caption(package.caption, require_hashtags=True)["passed"] is True


def test_generate_caption_package_uses_fallback_when_openai_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("USE_OPENAI", raising=False)
    monkeypatch.delenv("AI_ENABLED", raising=False)
    monkeypatch.delenv("ENABLE_AI_COPY", raising=False)
    monkeypatch.delenv("JALAPENO_EMERGENCY_TEMPLATE_FALLBACK", raising=False)
    monkeypatch.delenv("JALAPENO_REQUIRE_AI_ONLY_COPY", raising=False)

    package = generate_caption_package(
        _candidate(),
        snapshot={},
        external_context={},
        require_ai_copy=True,
    )

    assert package.copy_source == "fallback"
    assert package.validation_passed is True
    assert len(package.hashtags) == 5
    assert validate_caption(package.caption, require_hashtags=True)["passed"] is True


def test_generate_caption_package_requires_openai_when_strict_mode_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("USE_OPENAI", raising=False)
    monkeypatch.delenv("AI_ENABLED", raising=False)
    monkeypatch.delenv("ENABLE_AI_COPY", raising=False)
    monkeypatch.delenv("JALAPENO_EMERGENCY_TEMPLATE_FALLBACK", raising=False)
    monkeypatch.setenv("JALAPENO_REQUIRE_AI_ONLY_COPY", "true")

    with pytest.raises(AICopyRequiredError, match="OPENAI_API_KEY missing"):
        generate_caption_package(
            _candidate(),
            snapshot={},
            external_context={},
            require_ai_copy=True,
        )


def test_generate_caption_package_logs_openai_request_and_blocks_recent_reuse(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    class _FakeResponse:
        status_code = 200
        reason = "OK"

        def json(self) -> dict[str, object]:
            return {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "caption_options": [
                                        {
                                            "caption_body": "Send this to someone who owes you wings.",
                                            "caption_style": "send_to_friend",
                                            "overlay_text": "SEND THIS TO\nYOUR WING CREW",
                                        },
                                        {
                                            "caption_body": "Tag the friend who is always first to call wing night.",
                                            "caption_style": "tag_someone",
                                            "overlay_text": "TAG YOUR\nWING NIGHT MVP",
                                        },
                                    ],
                                    "overlay_options": [
                                        {"overlay_text": "SEND THIS TO\nYOUR WING CREW"},
                                        {"overlay_text": "TAG YOUR\nWING NIGHT MVP"},
                                    ],
                                }
                            )
                        }
                    }
                ],
                "usage": {
                    "prompt_tokens": 120,
                    "completion_tokens": 80,
                    "total_tokens": 200,
                },
            }

        @property
        def text(self) -> str:
            return ""

    class _FakeSession:
        def post(self, *args, **kwargs) -> _FakeResponse:
            return _FakeResponse()

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_MODEL", "gpt-4.1-mini")
    monkeypatch.setenv("USE_OPENAI", "true")
    monkeypatch.setenv("AI_ENABLED", "true")
    monkeypatch.setenv("ENABLE_AI_COPY", "true")
    monkeypatch.delenv("JALAPENO_EMERGENCY_TEMPLATE_FALLBACK", raising=False)
    monkeypatch.setattr("content_engine.caption_generator._local_variant_plan", lambda *args, **kwargs: [])

    logger = logging.getLogger("jalapeno-caption-test")
    caplog.set_level(logging.INFO, logger="jalapeno-caption-test")
    monkeypatch.setattr(
        "content_engine.caption_generator.OpenAIContentClient.from_env",
        classmethod(
            lambda cls, **kwargs: cls(
                "test-key",
                model="gpt-4.1-mini",
                logger=kwargs.get("logger"),
                session=_FakeSession(),
            )
        ),
    )

    package = generate_caption_package(
        _candidate(),
        snapshot={},
        external_context={},
        recent_posts=[
            {
                "selected_caption": "Send this to someone who owes you wings. #Buffago #BuffaloWings #WingNight #ChickenWings #Foodie",
                "selected_overlay": "SEND THIS TO\nYOUR WING CREW",
                "published_at": "2026-07-08T12:00:00+00:00",
            }
        ],
        logger=logger,
        require_ai_copy=True,
    )

    messages = [record.getMessage() for record in caplog.records]
    assert any("openai_request_started" in message for message in messages)
    assert any("openai_request_succeeded" in message for message in messages)
    assert any("ai_caption_selected" in message for message in messages)
    assert any("ai_overlay_selected" in message for message in messages)
    assert package.copy_source == "openai"
    assert package.openai_used is True
    assert package.caption != "Send this to someone who owes you wings. #Buffago #BuffaloWings #WingNight #ChickenWings #Foodie"
    assert package.overlay_text != "SEND THIS TO\nYOUR WING CREW"
    assert package.reuse_blocked_reason is None


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


def test_content_engine_logs_caption_style_validation_and_fallback_fields() -> None:
    tmp_path = PROJECT_DIR / "tmp" / f"jalapeno-caption-test-{uuid4().hex}"
    tmp_path.mkdir(parents=True, exist_ok=True)
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
            "hashtags": ["#Buffago", "#WingLovers", "#CTFood", "#BuffaloWings", "#Foodie"],
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


def test_ranking_penalizes_recent_repetition() -> None:
    candidate = _candidate().to_dict()
    feedback_summary = {
        "best_cta_types": [{"name": "comment"}],
        "best_caption_types": [{"name": "tag_someone"}],
        "best_overlay_patterns": [{"name": "SEND THIS TO YOUR WING CREW"}],
        "preferred_posting_windows": ["18:00"],
        "recommended_adjustments": [],
    }
    repeated = score_caption_overlay_variant(
        "Send this to someone who owes you wings.",
        "SEND THIS TO\nYOUR WING CREW",
        ["#Buffago", "#BuffaloWings", "#WingCrawl", "#LocalEats", "#WingSpot"],
        candidate=candidate,
        feedback_summary=feedback_summary,
        recent_captions=["Send this to someone who owes you wings."],
        recent_overlays=["SEND THIS TO\nYOUR WING CREW"],
        recent_hashtag_sets=[["#Buffago", "#BuffaloWings", "#WingCrawl", "#LocalEats", "#WingSpot"]],
    )
    fresh = score_caption_overlay_variant(
        "Tag the friend who would demolish this plate.",
        "WHO'S EATING\nTHIS WITH YOU?",
        ["#Buffago", "#BuffaloWings", "#WingCrawl", "#CTFood", "#ConnecticutEats"],
        candidate=candidate,
        feedback_summary=feedback_summary,
        recent_captions=["Send this to someone who owes you wings."],
        recent_overlays=["SEND THIS TO\nYOUR WING CREW"],
        recent_hashtag_sets=[["#Buffago", "#BuffaloWings", "#WingCrawl", "#LocalEats", "#WingSpot"]],
    )

    assert fresh.score > repeated.score
    assert repeated.rejected is False
    assert fresh.rejected is False
