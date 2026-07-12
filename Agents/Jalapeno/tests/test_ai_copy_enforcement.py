from __future__ import annotations

from dataclasses import replace
from io import StringIO
from pathlib import Path
import sys

import pytest

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from config import initialize_logging, load_configuration  # noqa: E402
from content_engine.candidate_generator import ContentCandidate  # noqa: E402
from content_engine.caption_generator import AICopyRequiredError, generate_caption_package  # noqa: E402
from openai_client import OpenAIContentResult, OpenAIContentClient  # noqa: E402


class _FakeOpenAIClient:
    def __init__(self, responses: list[OpenAIContentResult], *, model: str = "gpt-test") -> None:
        self.responses = list(responses)
        self.model = model
        self.calls = 0

    def generate_variant_set(self, **_kwargs) -> OpenAIContentResult:
        self.calls += 1
        if not self.responses:
            raise AssertionError("No fake OpenAI responses remaining")
        return self.responses.pop(0)


def _candidate() -> ContentCandidate:
    return ContentCandidate(
        candidate_id="11111111-1111-1111-1111-111111111111",
        content_type="restaurant_spotlight",
        creative_style="realistic_food",
        reason_chosen="test",
        working_title="Wing test",
        short_summary="Wing test summary",
        target_emotion="Hungry",
        suggested_cta="Send this to the person you're getting wings with.",
        suggested_image_concept="A hero plate of wings",
        suggested_caption_angle="Keep it social and wing-specific.",
        primary_theme="wings",
        secondary_theme="wing night",
        mood="Playful",
        hook_style="direct",
        cta_category="send",
        caption_style="send_to_friend",
        prompt_template_name="daily_wing_reel",
        food_categories=["wings"],
        source_signals=["video_asset_library"],
        visual_style="realistic",
        image_composition="hero plate",
    )


def _success_result(*, caption: str, overlay: str, request_id: str = "req_1") -> OpenAIContentResult:
    return OpenAIContentResult(
        success=True,
        model="gpt-test",
        output={"variants": [{"caption": caption, "overlay_text": overlay, "cta_type": "send", "content_angle": "wing night", "caption_style": "send_to_friend"}]},
        usage={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150, "estimated_cost_usd": 0.01},
        fallback_used=False,
        fallback_reason=None,
        status_code=200,
        request_id=request_id,
        latency_ms=123,
        error_category=None,
        retryable=False,
        raw_content='{"variants":[{"caption":"ok"}]}',
        error=None,
    )


def _failure_result(*, category: str, retryable: bool, message: str, status_code: int | None = None) -> OpenAIContentResult:
    return OpenAIContentResult(
        success=False,
        model="gpt-test",
        output={},
        usage={"input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "estimated_cost_usd": None},
        fallback_used=True,
        fallback_reason=message,
        status_code=status_code,
        request_id="req_fail",
        latency_ms=45,
        error_category=category,
        retryable=retryable,
        raw_content=None,
        error=message,
    )


def _logger(tmp_path: Path):
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    stream = StringIO()
    logger = initialize_logging(replace(config, log_directory=tmp_path / "logs"), stream=stream)
    return logger, stream


def test_openai_copy_success_first_attempt(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("JALAPENO_OPENAI_MAX_ATTEMPTS", "3")
    monkeypatch.setenv("JALAPENO_ALLOW_COPY_FALLBACK", "false")
    fake_client = _FakeOpenAIClient([_success_result(caption="Send this to the person you're getting wings with.", overlay="SEND THIS TO\nYOUR WING CREW")])
    monkeypatch.setattr(OpenAIContentClient, "from_env", classmethod(lambda cls, **_kwargs: fake_client))
    logger, stream = _logger(tmp_path)

    package = generate_caption_package(_candidate(), snapshot={}, external_context={}, performance_context={}, recent_posts=[], logger=logger, require_ai_copy=True)

    assert package.copy_source == "openai"
    assert package.fallback_used is False
    assert package.openai_attempt_count == 1
    assert package.openai_model == "gpt-test"
    assert "openai_copy_generation_succeeded" in stream.getvalue()


def test_openai_copy_retries_rate_limit_then_succeeds(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("JALAPENO_OPENAI_MAX_ATTEMPTS", "3")
    fake_client = _FakeOpenAIClient(
        [
            _failure_result(category="rate_limit", retryable=True, message="rate limited", status_code=429),
            _success_result(caption="Tag the friend who would destroy this plate.", overlay="TAG YOUR\nWING FRIEND", request_id="req_2"),
        ]
    )
    monkeypatch.setattr(OpenAIContentClient, "from_env", classmethod(lambda cls, **_kwargs: fake_client))
    logger, stream = _logger(tmp_path)

    package = generate_caption_package(_candidate(), snapshot={}, external_context={}, performance_context={}, recent_posts=[], logger=logger, require_ai_copy=True)

    assert package.copy_source == "openai"
    assert package.openai_attempt_count == 2
    assert package.openai_retry_count == 1
    log_output = stream.getvalue()
    assert "openai_copy_generation_attempt_failed" in log_output
    assert "openai_copy_generation_retry_scheduled" in log_output


def test_openai_copy_retries_malformed_json_then_succeeds(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    fake_client = _FakeOpenAIClient(
        [
            _failure_result(category="malformed_json", retryable=True, message="OpenAI response content did not contain valid JSON"),
            _success_result(caption="Send this to the friend who never says no to wings.", overlay="SEND THIS TO\nYOUR WING CREW", request_id="req_3"),
        ]
    )
    monkeypatch.setattr(OpenAIContentClient, "from_env", classmethod(lambda cls, **_kwargs: fake_client))
    logger, _stream = _logger(tmp_path)

    package = generate_caption_package(_candidate(), snapshot={}, external_context={}, performance_context={}, recent_posts=[], logger=logger, require_ai_copy=True)

    assert package.copy_source == "openai"
    assert package.openai_attempt_count == 2


def test_openai_copy_duplicate_caption_triggers_retry(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    fake_client = _FakeOpenAIClient(
        [
            _success_result(caption="Send this to the person you're getting wings with.", overlay="SEND THIS TO\nYOUR WING CREW", request_id="req_dup"),
            _success_result(caption="Comment your sauce pick.", overlay="DROP YOUR\nSAUCE PICK", request_id="req_fresh"),
        ]
    )
    monkeypatch.setattr(OpenAIContentClient, "from_env", classmethod(lambda cls, **_kwargs: fake_client))
    logger, stream = _logger(tmp_path)
    recent_posts = [{"id": "post-1", "selected_caption": "Send this to the person you're getting wings with", "published_at": "2026-07-01T00:00:00+00:00"}]

    package = generate_caption_package(_candidate(), snapshot={}, external_context={}, performance_context={}, recent_posts=recent_posts, logger=logger, require_ai_copy=True)

    assert package.copy_source == "openai"
    assert package.openai_attempt_count == 2
    assert "caption_duplicate_detected" in stream.getvalue()


def test_openai_copy_401_fails_immediately(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("JALAPENO_OPENAI_MAX_ATTEMPTS", "3")
    fake_client = _FakeOpenAIClient([_failure_result(category="invalid_api_key", retryable=False, message="invalid key", status_code=401)])
    monkeypatch.setattr(OpenAIContentClient, "from_env", classmethod(lambda cls, **_kwargs: fake_client))
    logger, _stream = _logger(tmp_path)

    with pytest.raises(AICopyRequiredError) as exc_info:
        generate_caption_package(_candidate(), snapshot={}, external_context={}, performance_context={}, recent_posts=[], logger=logger, require_ai_copy=True)

    assert exc_info.value.attempt_count == 1
    assert exc_info.value.failure_category == "invalid_api_key"


def test_production_never_uses_fallback(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("JALAPENO_ALLOW_COPY_FALLBACK", "true")
    fake_client = _FakeOpenAIClient([_failure_result(category="server_error", retryable=False, message="server exploded", status_code=500)])
    monkeypatch.setattr(OpenAIContentClient, "from_env", classmethod(lambda cls, **_kwargs: fake_client))
    logger, _stream = _logger(tmp_path)

    with pytest.raises(AICopyRequiredError):
        generate_caption_package(_candidate(), snapshot={}, external_context={}, performance_context={}, recent_posts=[], logger=logger, require_ai_copy=True)


def test_nonproduction_fallback_requires_explicit_opt_in(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("JALAPENO_ALLOW_COPY_FALLBACK", "false")
    monkeypatch.setattr(OpenAIContentClient, "from_env", classmethod(lambda cls, **_kwargs: None))
    logger, _stream = _logger(tmp_path)

    with pytest.raises(AICopyRequiredError):
        generate_caption_package(_candidate(), snapshot={}, external_context={}, performance_context={}, recent_posts=[], logger=logger, require_ai_copy=False)

    monkeypatch.setenv("JALAPENO_ALLOW_COPY_FALLBACK", "true")
    package = generate_caption_package(_candidate(), snapshot={}, external_context={}, performance_context={}, recent_posts=[], logger=logger, require_ai_copy=False)
    assert package.copy_source == "fallback"
    assert package.fallback_used is True


def test_secret_is_redacted_from_logs(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "sk-secret-value")
    fake_client = _FakeOpenAIClient([_failure_result(category="connection_error", retryable=False, message="request failed sk-secret-value")])
    monkeypatch.setattr(OpenAIContentClient, "from_env", classmethod(lambda cls, **_kwargs: fake_client))
    logger, stream = _logger(tmp_path)

    with pytest.raises(AICopyRequiredError):
        generate_caption_package(_candidate(), snapshot={}, external_context={}, performance_context={}, recent_posts=[], logger=logger, require_ai_copy=True)

    log_output = stream.getvalue()
    assert "sk-secret-value" not in log_output
    assert "[redacted-openai-key]" in log_output
