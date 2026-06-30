from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from logging_utils import log_event


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True, slots=True)
class PublishReport:
    run_id: str
    scheduled_post_type: str | None
    candidate_id: str
    content_type: str
    caption_preview: str
    hashtags: list[str]
    image_url: str | None
    container_id: str | None
    published_media_id: str | None
    permalink: str | None
    status: str
    quality_score: int
    retry_count: int
    failure_reason: str | None
    duration_ms: int
    cost_estimate: float | None
    created_at: str = ""
    metadata: dict[str, Any] | None = None


def create_publish_report(
    *,
    run_id: str,
    scheduled_post_type: str | None,
    candidate_id: str,
    content_type: str,
    caption: str,
    hashtags: list[str],
    image_url: str | None,
    container_id: str | None,
    published_media_id: str | None,
    permalink: str | None,
    status: str,
    quality_score: int,
    retry_count: int,
    failure_reason: str | None,
    duration_ms: int,
    cost_estimate: float | None = None,
    metadata: dict[str, Any] | None = None,
) -> PublishReport:
    report = PublishReport(
        run_id=run_id,
        scheduled_post_type=scheduled_post_type,
        candidate_id=candidate_id,
        content_type=content_type,
        caption_preview=caption[:140],
        hashtags=hashtags,
        image_url=image_url,
        container_id=container_id,
        published_media_id=published_media_id,
        permalink=permalink,
        status=status,
        quality_score=quality_score,
        retry_count=retry_count,
        failure_reason=failure_reason,
        duration_ms=duration_ms,
        cost_estimate=cost_estimate,
        created_at=_utcnow().isoformat(),
        metadata=metadata or {},
    )
    return report


def write_publish_report(path: Path, report: PublishReport) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = asdict(report)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True, default=str)
        handle.write("\n")
    return payload


def send_publish_notification(
    *,
    report: PublishReport,
    logger=None,
    notifications_enabled: bool = True,
    console_enabled: bool = True,
    email_enabled: bool = False,
    webhook_enabled: bool = False,
) -> None:
    if not notifications_enabled:
        log_event(
            logger,
            "publish_notification_sent",
            run_id=report.run_id,
            candidate_id=report.candidate_id,
            status=report.status,
            duration_ms=report.duration_ms,
        )
        return
    try:
        if console_enabled and logger is not None:
            logger.info("publish report | %s", json.dumps(asdict(report), sort_keys=True, default=str))
        if email_enabled or webhook_enabled:
            pass
        log_event(
            logger,
            "publish_notification_sent",
            run_id=report.run_id,
            candidate_id=report.candidate_id,
            status=report.status,
            duration_ms=report.duration_ms,
        )
    except Exception as exc:  # pragma: no cover - defensive
        log_event(
            logger,
            "publish_notification_failed",
            level="error",
            run_id=report.run_id,
            candidate_id=report.candidate_id,
            status=report.status,
            duration_ms=report.duration_ms,
            error=str(exc),
        )
        raise
