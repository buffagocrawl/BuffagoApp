from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

import main as legacy_main
from config import ConfigError
from scheduling.community_schedule_guard import (
    LIVE_CONFIRMATION,
    ScheduleConfigurationError,
    build_workflow_receipt,
    validate_configuration,
)


NOW = datetime(2026, 7, 29, 1, 17, tzinfo=ZoneInfo("America/New_York"))
REPOSITORY = Path(__file__).resolve().parents[3]
WORKFLOW = REPOSITORY / ".github" / "workflows" / "jalapeno-schedule.yml"
GROWTH_WORKFLOW = (
    REPOSITORY / ".github" / "workflows" / "jalapeno-growth-loop.yml"
)


def base_environment() -> dict[str, str]:
    return {
        "SUPABASE_URL": "https://project.invalid",
        "SUPABASE_SERVICE_ROLE_KEY": "test-service-role",
    }


def live_environment() -> dict[str, str]:
    return {
        **base_environment(),
        "WING_SHOTS_LIVE_PUBLISHING_ENABLED": "true",
        "WING_INSTAGRAM_PUBLISHING_ENABLED": "true",
        "WING_FACEBOOK_PUBLISHING_ENABLED": "true",
        "META_LONG_LIVED_ACCESS_TOKEN": "test-token",
        "INSTAGRAM_BUSINESS_ACCOUNT_ID": "1234567890",
        "FACEBOOK_PAGE_ID": "9876543210",
        "META_GRAPH_API_VERSION": "v23.0",
    }


def test_scheduled_configuration_defaults_to_safe_community_dry_run() -> None:
    result = validate_configuration(
        mode="dry-run",
        requested_business_date=None,
        live_confirmation=None,
        environment=base_environment(),
        now=NOW,
    )
    assert result == {
        "schema_version": 1,
        "mode": "dry-run",
        "business_date": "2026-07-29",
        "dry_run": True,
        "human_final_approval_required": True,
        "platforms": ["instagram", "facebook"],
        "live_enabled_platforms": [],
        "legacy_content_generation_enabled": False,
    }


@pytest.mark.parametrize(
    ("environment_override", "confirmation", "expected"),
    [
        ({}, None, "confirmation"),
        (
            {"WING_SHOTS_LIVE_PUBLISHING_ENABLED": "false"},
            LIVE_CONFIRMATION,
            "WING_SHOTS_LIVE_PUBLISHING_ENABLED",
        ),
        (
            {
                "WING_INSTAGRAM_PUBLISHING_ENABLED": "false",
                "WING_FACEBOOK_PUBLISHING_ENABLED": "false",
            },
            LIVE_CONFIRMATION,
            "at least one platform",
        ),
        (
            {"META_LONG_LIVED_ACCESS_TOKEN": ""},
            LIVE_CONFIRMATION,
            "META_LONG_LIVED_ACCESS_TOKEN",
        ),
        (
            {"META_GRAPH_API_VERSION": ""},
            LIVE_CONFIRMATION,
            "META_GRAPH_API_VERSION",
        ),
    ],
)
def test_live_mode_fails_closed_without_every_control(
    environment_override: dict[str, str],
    confirmation: str | None,
    expected: str,
) -> None:
    environment = live_environment()
    environment.update(environment_override)
    with pytest.raises(ScheduleConfigurationError, match=expected):
        validate_configuration(
            mode="live",
            requested_business_date="2026-07-29",
            live_confirmation=confirmation,
            environment=environment,
            now=NOW,
        )


def test_live_mode_accepts_only_recent_explicit_business_date() -> None:
    result = validate_configuration(
        mode="live",
        requested_business_date="2026-07-28",
        live_confirmation=LIVE_CONFIRMATION,
        environment=live_environment(),
        now=NOW,
    )
    assert result["business_date"] == "2026-07-28"
    assert result["dry_run"] is False
    assert result["live_enabled_platforms"] == ["instagram", "facebook"]

    with pytest.raises(ScheduleConfigurationError, match="between"):
        validate_configuration(
            mode="live",
            requested_business_date="2026-07-20",
            live_confirmation=LIVE_CONFIRMATION,
            environment=live_environment(),
            now=NOW,
        )


@pytest.mark.parametrize(
    ("disabled_flag", "disabled_account", "expected_platform"),
    [
        (
            "WING_FACEBOOK_PUBLISHING_ENABLED",
            "FACEBOOK_PAGE_ID",
            "instagram",
        ),
        (
            "WING_INSTAGRAM_PUBLISHING_ENABLED",
            "INSTAGRAM_BUSINESS_ACCOUNT_ID",
            "facebook",
        ),
    ],
)
def test_live_platform_configuration_is_independent(
    disabled_flag: str,
    disabled_account: str,
    expected_platform: str,
) -> None:
    environment = live_environment()
    environment[disabled_flag] = "false"
    environment[disabled_account] = ""
    result = validate_configuration(
        mode="live",
        requested_business_date="2026-07-29",
        live_confirmation=LIVE_CONFIRMATION,
        environment=environment,
        now=NOW,
    )
    assert result["live_enabled_platforms"] == [expected_platform]


def test_skip_receipt_proves_zero_content_did_not_publish_or_leak() -> None:
    raw = {
        "run_id": "run-empty",
        "business_date": "2026-07-29",
        "correlation_id": "correlation-empty",
        "dry_run": True,
        "status": "SKIPPED_NO_APPROVED_CONTENT",
        "selected_submission_id": None,
        "candidate_count": 0,
        "platform_results": {},
        "reward_settled": False,
        "notification_enqueued": False,
        "access_token": "must-not-survive",
        "signed_url": "https://private.invalid/signed",
        "original_storage_path": "originals/private",
        "failure_reason": "must-not-survive",
    }
    receipt = build_workflow_receipt(
        mode="dry-run",
        business_date="2026-07-29",
        exit_code=0,
        stdout_text=json.dumps(raw),
        workflow_run_id="123",
        workflow_run_attempt="1",
    )
    assert receipt["status"] == "SKIPPED_NO_APPROVED_CONTENT"
    assert receipt["successful_terminal_or_pending_status"] is True
    safe = receipt["entrypoint_receipt"]
    assert safe["candidate_count"] == 0
    assert safe["selected_submission_id"] is None
    assert safe["platform_results"] == {}
    assert "access_token" not in safe
    assert "signed_url" not in safe
    assert "original_storage_path" not in safe
    assert "failure_reason" not in safe


def test_invalid_or_failed_entrypoint_never_becomes_success() -> None:
    receipt = build_workflow_receipt(
        mode="dry-run",
        business_date="2026-07-29",
        exit_code=0,
        stdout_text="not-json",
        workflow_run_id="123",
        workflow_run_attempt="2",
    )
    assert receipt["exit_code"] == 1
    assert receipt["status"] == "WORKFLOW_FAILED"
    assert receipt["successful_terminal_or_pending_status"] is False

    unknown = build_workflow_receipt(
        mode="dry-run",
        business_date="2026-07-29",
        exit_code=0,
        stdout_text=json.dumps({"status": "UNKNOWN_SUCCESS"}),
        workflow_run_id="123",
        workflow_run_attempt="3",
    )
    assert unknown["exit_code"] == 1
    assert unknown["status"] == "WORKFLOW_FAILED"


def test_workflow_has_one_community_only_off_hour_schedule_and_safe_controls() -> None:
    workflow = WORKFLOW.read_text(encoding="utf-8")
    assert 'cron: "17 5 * * *"' in workflow
    assert workflow.count("cron:") == 1
    assert "default: dry-run" in workflow
    assert "PUBLISH_APPROVED_COMMUNITY_WING_SHOTS" in workflow
    assert "python wing_shots_main.py" in workflow
    assert "python main.py" not in workflow
    assert "post_type:" not in workflow
    assert "--content-type" not in workflow
    assert "buffago_post" not in workflow
    assert "daily_wing_reel" not in workflow
    assert "image-pipeline-live" not in workflow
    assert "preloaded" not in workflow
    assert "OPENAI_API_KEY" not in workflow
    assert "META_APP_SECRET" not in workflow
    assert "META_GRAPH_API_VERSION: ${{ vars.META_GRAPH_API_VERSION }}" in workflow
    assert "META_GRAPH_API_VERSION ||" not in workflow
    assert workflow.count("SUPABASE_SERVICE_ROLE_KEY:") == 2
    assert workflow.count("META_LONG_LIVED_ACCESS_TOKEN:") == 2
    assert "permissions:\n  contents: read" in workflow
    assert "cancel-in-progress: false" in workflow
    assert "timeout-minutes: 30" in workflow
    assert "actions/upload-artifact@v4" in workflow
    assert "retention-days: 14" in workflow


@pytest.mark.parametrize(
    ("call", "mode"),
    [
        (lambda: legacy_main.run_production(), "production"),
        (lambda: legacy_main.run_image_pipeline_live(), "image-pipeline-live"),
        (
            lambda: legacy_main.run_instagram_publish_live(),
            "instagram-publish-live",
        ),
    ],
)
def test_legacy_live_entrypoints_are_hard_disabled(call, mode: str) -> None:
    with pytest.raises(ConfigError, match="approved community Wing Shots"):
        call()
    assert legacy_main.main([f"--{mode}"]) == 1


def test_legacy_manual_fabricated_content_choices_are_unreachable() -> None:
    with pytest.raises(SystemExit) as exc:
        legacy_main.build_parser().parse_args(
            ["--production", "--content-type", "video"]
        )
    assert exc.value.code == 2


def test_legacy_growth_workflow_is_read_only() -> None:
    workflow = GROWTH_WORKFLOW.read_text(encoding="utf-8")
    assert "growth-report" in workflow
    assert "recommend-strategy" in workflow
    assert "apply-strategy" not in workflow
    with pytest.raises(ConfigError, match="approved community Wing Shots"):
        legacy_main.run_apply_strategy()
    assert legacy_main.main(["--apply-strategy"]) == 1


def test_historical_metrics_reader_remains_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    called = {"metrics": False}

    def fake_metrics(**_kwargs) -> int:
        called["metrics"] = True
        return 0

    monkeypatch.setattr(legacy_main, "run_metrics", fake_metrics)
    assert legacy_main.main(["--metrics", "--metrics-dry-run"]) == 0
    assert called["metrics"] is True
