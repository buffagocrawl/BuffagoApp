from __future__ import annotations

import json
from dataclasses import replace
from io import StringIO
from pathlib import Path
import sys

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from ai_config import load_ai_config  # noqa: E402
from config import initialize_logging, load_configuration  # noqa: E402
from data_snapshot import generate_latest_snapshot  # noqa: E402
from model_router import AIRunContext, get_text_model  # noqa: E402
from validation import validate_phase5_environment  # noqa: E402


def _context(
    *,
    execution_source: str,
    environment: str,
    scheduled: bool,
    scheduled_post_type: str | None = None,
    dry_run: bool = False,
    validation: bool = False,
    test_mode: bool = False,
    manual_dispatch: bool = False,
    manual: bool = False,
    fake_publish: bool = False,
) -> AIRunContext:
    return AIRunContext(
        execution_source=execution_source,
        environment=environment,
        scheduled=scheduled,
        scheduled_post_type=scheduled_post_type,
        dry_run=dry_run,
        validation=validation,
        test_mode=test_mode,
        manual_dispatch=manual_dispatch,
        manual=manual,
        fake_publish=fake_publish,
    )


def test_scheduled_buffago_post_routes_to_gpt_55() -> None:
    decision = get_text_model(
        load_ai_config(),
        _context(
            execution_source="github_actions_scheduler",
            environment="production",
            scheduled=True,
            scheduled_post_type="buffago_post",
        ),
    )

    assert decision.text_model == "gpt-5.5"
    assert decision.routing_reason == "scheduled_production_run"


def test_scheduled_meme_post_routes_to_gpt_55() -> None:
    decision = get_text_model(
        load_ai_config(),
        _context(
            execution_source="github_actions_scheduler",
            environment="production",
            scheduled=True,
            scheduled_post_type="meme_post",
        ),
    )

    assert decision.text_model == "gpt-5.5"
    assert decision.routing_reason == "scheduled_production_run"


def test_validation_routes_to_gpt_54_mini() -> None:
    decision = get_text_model(
        load_ai_config(),
        _context(
            execution_source="python_main_validate",
            environment="development",
            scheduled=False,
            validation=True,
            dry_run=True,
            manual=True,
        ),
    )

    assert decision.text_model == "gpt-5.4-mini"
    assert decision.routing_reason == "validation_run"


def test_dry_run_routes_to_gpt_54_mini() -> None:
    decision = get_text_model(
        load_ai_config(),
        _context(
            execution_source="python_main",
            environment="development",
            scheduled=False,
            dry_run=True,
            manual=True,
        ),
    )

    assert decision.text_model == "gpt-5.4-mini"
    assert decision.routing_reason == "dry_run"


def test_manual_local_execution_routes_to_gpt_54_mini() -> None:
    decision = get_text_model(
        load_ai_config(),
        _context(
            execution_source="python_main",
            environment="development",
            scheduled=False,
            manual=True,
            manual_dispatch=True,
        ),
    )

    assert decision.text_model == "gpt-5.4-mini"
    assert decision.routing_reason == "manual_execution"


def test_image_model_uses_gpt_54_across_profiles() -> None:
    config = load_ai_config()

    assert config.models.production.image == "gpt-5.4"
    assert config.models.development.image == "gpt-5.4"


def test_phase5_validation_logs_selected_models(tmp_path: Path) -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    snapshot = generate_latest_snapshot(output_path=tmp_path / "latest_snapshot.json").snapshot
    external_context = {
        "agent": "Jalapeno",
        "phase": 4,
        "source_summary": {"signals_used": ["fallback_context"], "fallback_used": True},
    }
    stream = StringIO()
    logger = initialize_logging(replace(config, log_directory=tmp_path / "logs"), stream=stream)

    result = validate_phase5_environment(
        config,
        snapshot,
        external_context,
        logger=logger,
        skip_ai=True,
        output_path=tmp_path / "latest_ai_output.json",
        usage_path=tmp_path / "ai_usage_latest.json",
    )

    assert result.text_result["model"] == "gpt-5.4-mini"
    assert result.image_result["model"] == "gpt-5.4-mini"
    assert result.brand_result["model"] == "gpt-5.4-mini"
    payload = json.loads((tmp_path / "latest_ai_output.json").read_text(encoding="utf-8"))
    assert payload["text_result"]["model"] == "gpt-5.4-mini"
    assert payload["image_result"]["model"] == "gpt-5.4-mini"
    assert payload["brand_result"]["model"] == "gpt-5.4-mini"
    log_output = stream.getvalue()
    assert "model_selected" in log_output
    assert "selected_text_model=gpt-5.4-mini" in log_output
    assert "selected_image_model=gpt-5.4" in log_output
    assert "routing_reason=validation_run" in log_output
