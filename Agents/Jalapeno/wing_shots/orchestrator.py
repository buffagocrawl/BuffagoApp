from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import date, datetime, timezone
from typing import Callable, Mapping
from uuid import uuid4

from .models import NightlyRunReceipt, Platform, PublishResult, SocialJob
from .publishers import MetaPublisher
from .repository import SignedUrlProvider, WingShotsRepository
from .generation import WingShotsGenerationWorker


SKIPPED_NO_APPROVED_CONTENT = "SKIPPED_NO_APPROVED_CONTENT"


@dataclass(frozen=True, slots=True)
class NightlyConfig:
    dry_run: bool = True
    platforms: tuple[Platform, ...] = (
        Platform.INSTAGRAM,
        Platform.FACEBOOK,
    )
    worker_id: str = "jalapeno-wing-shots"
    lease_seconds: int = 600
    signed_url_seconds: int = 300


class WingShotsNightlyOrchestrator:
    """Coordinates database-owned selection with independent platform workers.

    The selection RPC owns eligibility, scoring, locking, stale-run recovery,
    and the generation job. The publication RPCs own leases, attempt history,
    state transitions, and the exactly-once reward/notification trigger edge.
    """

    def __init__(
        self,
        *,
        repository: WingShotsRepository,
        publishers: Mapping[Platform, MetaPublisher],
        generation_worker: WingShotsGenerationWorker | None = None,
        signed_urls: SignedUrlProvider | None = None,
        config: NightlyConfig | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.repository = repository
        self.publishers = dict(publishers)
        self.generation_worker = generation_worker
        self.signed_urls = signed_urls
        self.config = config or NightlyConfig()
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    @staticmethod
    def _validate_job(job: SocialJob, platform: Platform) -> None:
        expected_path = (
            f"publication/{job.submission_id}/{platform.value}/{job.job_id}"
        )
        if job.platform != platform:
            raise ValueError("platform_job_mismatch")
        if job.generated_media_path != expected_path:
            raise ValueError("untrusted_publication_media_path")
        if not job.generated_caption.strip():
            raise ValueError("generated_caption_required")
        if job.media_type not in {"photo", "video"}:
            raise ValueError("unsupported_publication_media_type")
        if not job.claim_token:
            raise ValueError("publication_claim_token_required")

    def _ingestion_ready_job(self, job: SocialJob) -> SocialJob:
        if job.dry_run:
            return job
        if self.signed_urls is None:
            raise ValueError("signed_url_provider_required")
        return replace(
            job,
            ingestion_url=self.signed_urls.signed_url(
                job.generated_media_path,
                expires_seconds=self.config.signed_url_seconds,
            ),
        )

    def _publish_claimed_job(
        self,
        *,
        job: SocialJob,
        platform: Platform,
        correlation_id: str,
    ) -> tuple[PublishResult, dict[str, object]]:
        try:
            self._validate_job(job, platform)
            publishable_job = self._ingestion_ready_job(job)
            publisher = self.publishers.get(platform)
            if publisher is None:
                result = PublishResult(
                    platform=platform,
                    job_id=job.job_id,
                    status="failed",
                    failure_code="publisher_not_configured",
                    failure_reason=f"No {platform.value} publisher configured",
                )
            else:
                result = publisher.publish(publishable_job)
        except Exception as exc:
            result = PublishResult(
                platform=platform,
                job_id=job.job_id,
                status="failed",
                failure_code="configuration_error",
                failure_reason=type(exc).__name__,
            )

        settlement = self.repository.record_publish_result(
            result=result,
            claim_token=str(job.claim_token),
            idempotency_key=(
                f"wing-publish-result:{job.job_id}:{max(1, job.attempt_count)}"
            ),
            correlation_id=correlation_id,
        )
        return result, settlement

    def run(
        self,
        *,
        business_date: date,
        correlation_id: str | None = None,
    ) -> NightlyRunReceipt:
        active_correlation_id = correlation_id or str(uuid4())
        started_at = self.clock()
        recovery = self.repository.recover_stale_platform_jobs(
            correlation_id=active_correlation_id,
        )
        selection = self.repository.run_nightly_selection(
            business_date=business_date,
            correlation_id=active_correlation_id,
        )
        selection_status = str(selection.get("status") or "").upper()
        receipt = NightlyRunReceipt(
            run_id=str(selection["receipt_id"]),
            business_date=business_date,
            correlation_id=active_correlation_id,
            dry_run=self.config.dry_run,
            status=selection_status or "FAILED",
            started_at=started_at,
            stale_claims_recovered=int(recovery.get("recovered_count") or 0),
        )
        if selection_status == SKIPPED_NO_APPROVED_CONTENT:
            receipt.completed_at = self.clock()
            return receipt
        if selection_status == "ALREADY_RUNNING":
            receipt.completed_at = self.clock()
            return receipt
        if selection_status in {"COMPLETED", "PARTIALLY_COMPLETED", "FAILED"}:
            receipt.status = "ALREADY_FINALIZED"
            receipt.completed_at = self.clock()
            return receipt
        if selection_status != "SELECTED":
            receipt.status = "FAILED"
            receipt.failure_code = "INVALID_SELECTION_RESULT"
            receipt.failure_reason = "Nightly selection returned an unknown status"
            receipt.completed_at = self.clock()
            return receipt

        if selection.get("submission_id"):
            receipt.selected_submission_id = str(selection["submission_id"])
            receipt.candidate_count = 1
        components = selection.get("score_components")
        if isinstance(components, dict):
            receipt.score_components = {
                str(key): float(value)
                for key, value in components.items()
                if isinstance(value, (int, float))
            }
            if isinstance(components.get("total"), (int, float)):
                receipt.selection_score = float(components["total"])

        if self.generation_worker is not None:
            generation = self.generation_worker.run_once()
            receipt.generation_result = {
                "status": generation.status,
                "job_id": str(generation.job_id) if generation.job_id else None,
                "submission_id": (
                    str(generation.submission_id)
                    if generation.submission_id
                    else None
                ),
                "error_code": generation.error_code,
            }
            if (
                receipt.selected_submission_id
                and generation.submission_id
                and str(generation.submission_id)
                != receipt.selected_submission_id
            ):
                receipt.status = "GENERATION_BACKLOG_PENDING"
                receipt.completed_at = self.clock()
                return receipt
            if generation.status in {"RETRY", "CLAIM_SETTLEMENT_FAILED"}:
                receipt.status = (
                    "GENERATION_RETRY_PENDING"
                    if generation.status == "RETRY"
                    else "GENERATION_CLAIM_SETTLEMENT_FAILED"
                )
                receipt.failure_code = generation.error_code
                receipt.completed_at = self.clock()
                return receipt
            if generation.status == "DEAD":
                receipt.status = "GENERATION_FAILED"
                receipt.failure_code = generation.error_code
                receipt.completed_at = self.clock()
                return receipt

        claimed_count = 0
        for platform in self.config.platforms:
            try:
                job = self.repository.claim_platform_job(
                    platform=platform.value,
                    worker_id=self.config.worker_id,
                    lease_seconds=self.config.lease_seconds,
                )
            except Exception as exc:
                receipt.platform_results[platform.value] = {
                    "platform": platform.value,
                    "status": "claim_failed",
                    "failure_code": "PLATFORM_CLAIM_FAILED",
                    "failure_reason": type(exc).__name__,
                }
                continue
            if job is None:
                receipt.platform_results[platform.value] = {
                    "platform": platform.value,
                    "status": "no_ready_job",
                }
                continue

            claimed_count += 1
            try:
                result, settlement = self._publish_claimed_job(
                    job=job,
                    platform=platform,
                    correlation_id=active_correlation_id,
                )
                safe_result = result.safe_receipt()
                safe_result["settlement_status"] = result.database_receipt()["status"]
                receipt.platform_results[platform.value] = safe_result
                if bool(
                    settlement.get("reward_and_notification_settled_by_transition")
                ):
                    receipt.reward_settled = True
                    receipt.notification_enqueued = True
            except Exception as exc:
                # A database settlement failure leaves the bounded lease for
                # server-side stale recovery. It never blocks the other platform.
                receipt.platform_results[platform.value] = {
                    "platform": platform.value,
                    "job_id": job.job_id,
                    "status": "settlement_failed",
                    "failure_code": "RESULT_SETTLEMENT_FAILED",
                    "failure_reason": type(exc).__name__,
                }

        statuses = {
            platform: str(result.get("status") or "")
            for platform, result in receipt.platform_results.items()
        }
        posted_count = sum(status == "posted" for status in statuses.values())
        dry_run_count = sum(
            status == "dry_run_succeeded" for status in statuses.values()
        )
        retry_count = sum(
            result.get("settlement_status") in {
                "retryable_failure",
                "rate_limited",
            }
            or result.get("status") in {"settlement_failed", "claim_failed"}
            for result in receipt.platform_results.values()
        )
        if claimed_count == 0:
            receipt.status = "GENERATION_PENDING"
        elif posted_count == len(self.config.platforms):
            receipt.status = "COMPLETED"
        elif posted_count:
            receipt.status = "PARTIALLY_COMPLETED"
        elif dry_run_count == len(self.config.platforms):
            receipt.status = "COMPLETED_DRY_RUN"
        elif dry_run_count:
            receipt.status = "PARTIALLY_COMPLETED_DRY_RUN"
        elif retry_count:
            receipt.status = "RETRY_PENDING"
        else:
            receipt.status = "FAILED"
            receipt.failure_code = "NO_PLATFORM_PUBLISHED"
            receipt.failure_reason = "No platform job reached a successful state"
        receipt.completed_at = self.clock()
        return receipt
