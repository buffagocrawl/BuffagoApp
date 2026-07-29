from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from enum import StrEnum
from typing import Any


class Platform(StrEnum):
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"


@dataclass(frozen=True, slots=True)
class Candidate:
    submission_id: str
    user_id: str
    destination_id: str
    created_at: datetime
    media_type: str
    processed_storage_path: str
    status: str = "approved"
    moderation_status: str = "likely_acceptable"
    wing_verification_status: str = "likely_wings"
    human_approved: bool = True
    source_media_kind: str = "community_submission"
    quality_score: float = 0.0
    wing_confidence: float = 0.0
    moderation_confidence: float = 0.0
    rating_completeness: float = 0.0
    caption_quality: float = 0.0
    duplicate_probability: float = 0.0
    duplicate_group: str | None = None
    manual_priority: int = 0
    city: str | None = None
    state: str | None = None
    media_style: str | None = None
    recent_user_features: int = 0
    recent_destination_features: int = 0
    recent_town_features: int = 0
    recent_style_features: int = 0
    recent_media_type_features: int = 0
    unsafe_flags: tuple[str, ...] = ()
    previously_selected: bool = False
    previously_posted: bool = False
    withdrawn: bool = False

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> "Candidate":
        created = row.get("created_at")
        if isinstance(created, str):
            created = datetime.fromisoformat(created.replace("Z", "+00:00"))
        if not isinstance(created, datetime):
            raise ValueError("candidate created_at is required")
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        return cls(
            submission_id=str(row["submission_id"]),
            user_id=str(row["user_id"]),
            destination_id=str(row["destination_id"]),
            created_at=created,
            media_type=str(row["media_type"]),
            processed_storage_path=str(row.get("processed_storage_path") or ""),
            status=str(row.get("status") or ""),
            moderation_status=str(row.get("moderation_status") or ""),
            wing_verification_status=str(row.get("wing_verification_status") or ""),
            human_approved=bool(row.get("human_approved")),
            source_media_kind=str(row.get("source_media_kind") or ""),
            quality_score=float(row.get("quality_score") or 0),
            wing_confidence=float(row.get("wing_confidence") or 0),
            moderation_confidence=float(row.get("moderation_confidence") or 0),
            rating_completeness=float(row.get("rating_completeness") or 0),
            caption_quality=float(row.get("caption_quality") or 0),
            duplicate_probability=float(row.get("duplicate_probability") or 0),
            duplicate_group=(
                str(row["duplicate_group"]) if row.get("duplicate_group") else None
            ),
            manual_priority=int(row.get("manual_priority") or row.get("priority") or 0),
            city=str(row["city"]) if row.get("city") else None,
            state=str(row["state"]) if row.get("state") else None,
            media_style=str(row["media_style"]) if row.get("media_style") else None,
            recent_user_features=int(row.get("recent_user_features") or 0),
            recent_destination_features=int(row.get("recent_destination_features") or 0),
            recent_town_features=int(row.get("recent_town_features") or 0),
            recent_style_features=int(row.get("recent_style_features") or 0),
            recent_media_type_features=int(row.get("recent_media_type_features") or 0),
            unsafe_flags=tuple(str(value) for value in row.get("unsafe_flags") or ()),
            previously_selected=bool(row.get("previously_selected")),
            previously_posted=bool(row.get("previously_posted")),
            withdrawn=bool(row.get("withdrawn")),
        )


@dataclass(frozen=True, slots=True)
class CandidateScore:
    submission_id: str
    total: float
    eligible: bool
    components: dict[str, float]
    exclusions: tuple[str, ...] = ()

    def as_claim_payload(self) -> dict[str, Any]:
        return {
            "submission_id": self.submission_id,
            "score": self.total,
            "score_components": dict(self.components),
        }


@dataclass(frozen=True, slots=True)
class SocialJob:
    job_id: str
    submission_id: str
    platform: Platform
    media_type: str
    generated_media_path: str
    generated_caption: str
    generated_alt_text: str | None
    idempotency_key: str
    dry_run: bool = True
    ingestion_url: str | None = None
    external_post_id: str | None = None
    external_permalink: str | None = None
    attempt_count: int = 0
    container_id: str | None = None
    claim_token: str | None = None

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> "SocialJob":
        return cls(
            job_id=str(row["job_id"]),
            submission_id=str(row["submission_id"]),
            platform=Platform(str(row["platform"])),
            media_type=str(row["media_type"]),
            generated_media_path=str(row["generated_media_path"]),
            generated_caption=str(row["generated_caption"]),
            generated_alt_text=(
                str(row["generated_alt_text"])
                if row.get("generated_alt_text")
                else None
            ),
            idempotency_key=str(row["idempotency_key"]),
            dry_run=bool(row.get("dry_run", True)),
            ingestion_url=(
                str(row["ingestion_url"]) if row.get("ingestion_url") else None
            ),
            external_post_id=(
                str(row["external_post_id"])
                if row.get("external_post_id")
                else None
            ),
            external_permalink=(
                str(row["external_permalink"])
                if row.get("external_permalink")
                else None
            ),
            attempt_count=int(row.get("attempt_count") or 0),
            container_id=str(row["container_id"]) if row.get("container_id") else None,
            claim_token=(
                str(row["claim_token"]) if row.get("claim_token") else None
            ),
        )


@dataclass(frozen=True, slots=True)
class PublishAttempt:
    attempt_number: int
    outcome: str
    http_status: int | None = None
    failure_code: str | None = None
    retryable: bool = False
    retry_after_seconds: float | None = None
    provider_request_id: str | None = None

    def safe_dict(self) -> dict[str, Any]:
        return {
            "attempt_number": self.attempt_number,
            "outcome": self.outcome,
            "http_status": self.http_status,
            "failure_code": self.failure_code,
            "retryable": self.retryable,
            "retry_after_seconds": self.retry_after_seconds,
            "provider_request_id": self.provider_request_id,
        }


@dataclass(frozen=True, slots=True)
class PublishResult:
    platform: Platform
    job_id: str
    status: str
    external_post_id: str | None = None
    external_permalink: str | None = None
    container_id: str | None = None
    failure_code: str | None = None
    failure_reason: str | None = None
    attempts: tuple[PublishAttempt, ...] = ()
    reconciled: bool = False

    @property
    def posted(self) -> bool:
        return self.status == "posted" and self.external_post_id is not None

    def safe_receipt(self) -> dict[str, Any]:
        return {
            "platform": self.platform.value,
            "job_id": self.job_id,
            "status": self.status,
            "external_post_id": self.external_post_id,
            "external_permalink": self.external_permalink,
            "container_id": self.container_id,
            "failure_code": self.failure_code,
            "failure_reason": self.failure_reason,
            "attempts": [attempt.safe_dict() for attempt in self.attempts],
            "reconciled": self.reconciled,
        }

    def database_receipt(self) -> dict[str, Any]:
        """Return the secret-free result shape accepted by the settlement RPC."""
        status = self.status
        last_attempt = self.attempts[-1] if self.attempts else None
        if status == "failed":
            if self.failure_code in {
                "configuration_error",
                "platform_disabled",
                "publisher_not_configured",
            }:
                status = "configuration_error"
            elif (
                self.failure_code == "rate_limited"
                or (last_attempt is not None and last_attempt.outcome == "rate_limited")
            ):
                status = "rate_limited"
            elif self.failure_code in {
                "provider_transient",
                "transport_error",
                "container_timeout",
                "container_status_failed",
                "retry_exhausted",
            }:
                status = "retryable_failure"
            elif last_attempt is not None and last_attempt.retryable:
                status = "retryable_failure"
            else:
                status = "permanent_failure"
        return {
            **self.safe_receipt(),
            "status": status,
            "provider_request_id": (
                last_attempt.provider_request_id if last_attempt else None
            ),
            "http_status": last_attempt.http_status if last_attempt else None,
        }


@dataclass(slots=True)
class NightlyRunReceipt:
    run_id: str
    business_date: date
    correlation_id: str
    dry_run: bool
    status: str
    started_at: datetime
    completed_at: datetime | None = None
    selected_submission_id: str | None = None
    candidate_count: int = 0
    selection_score: float | None = None
    score_components: dict[str, float] = field(default_factory=dict)
    generation_result: dict[str, Any] = field(default_factory=dict)
    platform_results: dict[str, dict[str, Any]] = field(default_factory=dict)
    stale_claims_recovered: int = 0
    reward_settled: bool = False
    notification_enqueued: bool = False
    failure_code: str | None = None
    failure_reason: str | None = None

    def finish(self, status: str, now: datetime) -> None:
        self.status = status
        self.completed_at = now

    def safe_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "business_date": self.business_date.isoformat(),
            "correlation_id": self.correlation_id,
            "dry_run": self.dry_run,
            "status": self.status,
            "started_at": self.started_at.isoformat(),
            "completed_at": (
                self.completed_at.isoformat() if self.completed_at else None
            ),
            "selected_submission_id": self.selected_submission_id,
            "candidate_count": self.candidate_count,
            "selection_score": self.selection_score,
            "score_components": dict(self.score_components),
            "generation_result": dict(self.generation_result),
            "platform_results": dict(self.platform_results),
            "stale_claims_recovered": self.stale_claims_recovered,
            "reward_settled": self.reward_settled,
            "notification_enqueued": self.notification_enqueued,
            "failure_code": self.failure_code,
            "failure_reason": self.failure_reason,
        }
