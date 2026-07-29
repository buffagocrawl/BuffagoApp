from __future__ import annotations

import argparse
import json
import os
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Mapping
from zoneinfo import ZoneInfo


SCHEDULE_TIMEZONE = ZoneInfo("America/New_York")
LIVE_CONFIRMATION = "PUBLISH_APPROVED_COMMUNITY_WING_SHOTS"
SAFE_RECEIPT_KEYS = {
    "run_id",
    "business_date",
    "correlation_id",
    "dry_run",
    "status",
    "started_at",
    "completed_at",
    "selected_submission_id",
    "candidate_count",
    "selection_score",
    "score_components",
    "platform_results",
    "stale_claims_recovered",
    "reward_settled",
    "notification_enqueued",
    "failure_code",
}
SAFE_PLATFORM_KEYS = {
    "platform",
    "job_id",
    "status",
    "external_post_id",
    "external_permalink",
    "reconciled",
    "failure_code",
    "attempt_count",
    "settlement_status",
}
SUCCESS_STATUSES = {
    "SKIPPED_NO_APPROVED_CONTENT",
    "ALREADY_RUNNING",
    "ALREADY_FINALIZED",
    "GENERATION_PENDING",
    "COMPLETED",
    "PARTIALLY_COMPLETED",
    "COMPLETED_DRY_RUN",
    "PARTIALLY_COMPLETED_DRY_RUN",
    "RETRY_PENDING",
}


class ScheduleConfigurationError(ValueError):
    pass


def enabled(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def resolve_business_date(
    requested: str | None,
    *,
    mode: str,
    now: datetime | None = None,
) -> date:
    current = now or datetime.now(SCHEDULE_TIMEZONE)
    today = current.astimezone(SCHEDULE_TIMEZONE).date()
    try:
        selected = date.fromisoformat(requested) if requested else today
    except ValueError as exc:
        raise ScheduleConfigurationError(
            "business_date must use YYYY-MM-DD"
        ) from exc
    maximum_age = 7 if mode == "live" else 31
    if selected > today or selected < today - timedelta(days=maximum_age):
        raise ScheduleConfigurationError(
            f"{mode} business_date must be between "
            f"{today - timedelta(days=maximum_age)} and {today}"
        )
    return selected


def validate_configuration(
    *,
    mode: str,
    requested_business_date: str | None,
    live_confirmation: str | None,
    environment: Mapping[str, str],
    now: datetime | None = None,
) -> dict[str, Any]:
    if mode not in {"dry-run", "live"}:
        raise ScheduleConfigurationError("mode must be dry-run or live")
    business_date = resolve_business_date(
        requested_business_date,
        mode=mode,
        now=now,
    )
    missing = [
        name
        for name in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
        if not environment.get(name, "").strip()
    ]
    if missing:
        raise ScheduleConfigurationError(
            "missing required configuration: " + ", ".join(missing)
        )
    supabase_url = environment["SUPABASE_URL"].strip()
    if not supabase_url.startswith("https://") or any(
        character.isspace() for character in supabase_url
    ):
        raise ScheduleConfigurationError(
            "SUPABASE_URL must be a valid HTTPS project URL"
        )

    if mode == "live":
        if live_confirmation != LIVE_CONFIRMATION:
            raise ScheduleConfigurationError(
                "live confirmation phrase did not match"
            )
        if not enabled(environment.get("WING_SHOTS_LIVE_PUBLISHING_ENABLED")):
            raise ScheduleConfigurationError(
                "WING_SHOTS_LIVE_PUBLISHING_ENABLED must be true"
            )
        instagram_enabled = enabled(
            environment.get("WING_INSTAGRAM_PUBLISHING_ENABLED")
        )
        facebook_enabled = enabled(
            environment.get("WING_FACEBOOK_PUBLISHING_ENABLED")
        )
        if not instagram_enabled and not facebook_enabled:
            raise ScheduleConfigurationError(
                "at least one platform publishing flag must be true"
            )
        live_missing = [
            name
            for name in ("META_LONG_LIVED_ACCESS_TOKEN", "META_GRAPH_API_VERSION")
            if not environment.get(name, "").strip()
        ]
        if instagram_enabled and not environment.get(
            "INSTAGRAM_BUSINESS_ACCOUNT_ID", ""
        ).strip():
            live_missing.append("INSTAGRAM_BUSINESS_ACCOUNT_ID")
        if facebook_enabled and not environment.get(
            "FACEBOOK_PAGE_ID", ""
        ).strip():
            live_missing.append("FACEBOOK_PAGE_ID")
        if live_missing:
            raise ScheduleConfigurationError(
                "missing live publishing configuration: "
                + ", ".join(live_missing)
            )
        account_names = []
        if instagram_enabled:
            account_names.append("INSTAGRAM_BUSINESS_ACCOUNT_ID")
        if facebook_enabled:
            account_names.append("FACEBOOK_PAGE_ID")
        for account_name in account_names:
            if not environment[account_name].strip().isdigit():
                raise ScheduleConfigurationError(
                    f"{account_name} must be a numeric Meta asset ID"
                )
        api_version = environment.get("META_GRAPH_API_VERSION", "").strip()
        if not re.fullmatch(r"v[0-9]{1,2}\.[0-9]{1,2}", api_version):
            raise ScheduleConfigurationError(
                "META_GRAPH_API_VERSION must use vNN.N format"
            )

    return {
        "schema_version": 1,
        "mode": mode,
        "business_date": business_date.isoformat(),
        "dry_run": mode == "dry-run",
        "human_final_approval_required": True,
        "platforms": ["instagram", "facebook"],
        "live_enabled_platforms": (
            [
                platform
                for platform, is_enabled in (
                    (
                        "instagram",
                        enabled(
                            environment.get(
                                "WING_INSTAGRAM_PUBLISHING_ENABLED"
                            )
                        ),
                    ),
                    (
                        "facebook",
                        enabled(
                            environment.get(
                                "WING_FACEBOOK_PUBLISHING_ENABLED"
                            )
                        ),
                    ),
                )
                if mode == "live" and is_enabled
            ]
        ),
        "legacy_content_generation_enabled": False,
    }


def _sanitize_platform_results(value: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(value, dict):
        return {}
    safe: dict[str, dict[str, Any]] = {}
    for platform in ("instagram", "facebook"):
        raw = value.get(platform)
        if isinstance(raw, dict):
            safe[platform] = {
                key: raw[key] for key in SAFE_PLATFORM_KEYS if key in raw
            }
    return safe


def sanitize_entrypoint_receipt(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("entrypoint receipt must be a JSON object")
    safe = {key: raw[key] for key in SAFE_RECEIPT_KEYS if key in raw}
    score_components = raw.get("score_components")
    safe["score_components"] = (
        {
            str(key): float(value)
            for key, value in score_components.items()
            if isinstance(value, (int, float))
        }
        if isinstance(score_components, dict)
        else {}
    )
    safe["platform_results"] = _sanitize_platform_results(
        raw.get("platform_results")
    )
    if not isinstance(safe.get("status"), str):
        raise ValueError("entrypoint receipt status is required")
    return safe


def build_workflow_receipt(
    *,
    mode: str,
    business_date: str,
    exit_code: int,
    stdout_text: str,
    workflow_run_id: str | None,
    workflow_run_attempt: str | None,
) -> dict[str, Any]:
    entrypoint: dict[str, Any] | None = None
    parse_succeeded = False
    if exit_code == 0:
        try:
            entrypoint = sanitize_entrypoint_receipt(json.loads(stdout_text))
            parse_succeeded = True
        except (json.JSONDecodeError, ValueError):
            exit_code = 1

    status = (
        str(entrypoint["status"])
        if parse_succeeded and entrypoint is not None
        else "WORKFLOW_FAILED"
    )
    if exit_code == 0 and status not in SUCCESS_STATUSES:
        exit_code = 1
        status = "WORKFLOW_FAILED"
    return {
        "workflow_receipt_schema_version": 1,
        "workflow_run_id": workflow_run_id,
        "workflow_run_attempt": workflow_run_attempt,
        "mode": mode,
        "business_date": business_date,
        "exit_code": exit_code,
        "status": status,
        "successful_terminal_or_pending_status": (
            exit_code == 0 and status in SUCCESS_STATUSES
        ),
        "entrypoint_receipt": entrypoint,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate and sanitize the Wing Shots nightly workflow."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    validate = subparsers.add_parser("validate")
    validate.add_argument("--mode", choices=("dry-run", "live"), required=True)
    validate.add_argument("--business-date")
    validate.add_argument("--live-confirmation")

    receipt = subparsers.add_parser("receipt")
    receipt.add_argument("--mode", choices=("dry-run", "live"), required=True)
    receipt.add_argument("--business-date", required=True)
    receipt.add_argument("--exit-code", required=True, type=int)
    receipt.add_argument("--stdout-file", type=Path, required=True)
    receipt.add_argument("--output", type=Path, required=True)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.command == "validate":
        try:
            result = validate_configuration(
                mode=args.mode,
                requested_business_date=args.business_date,
                live_confirmation=args.live_confirmation,
                environment=os.environ,
            )
        except ScheduleConfigurationError as exc:
            print(f"Configuration invalid: {exc}")
            return 2
        print(json.dumps(result, sort_keys=True))
        return 0

    stdout_text = args.stdout_file.read_text(
        encoding="utf-8", errors="replace"
    )
    result = build_workflow_receipt(
        mode=args.mode,
        business_date=args.business_date,
        exit_code=args.exit_code,
        stdout_text=stdout_text,
        workflow_run_id=os.getenv("GITHUB_RUN_ID"),
        workflow_run_attempt=os.getenv("GITHUB_RUN_ATTEMPT"),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["exit_code"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
