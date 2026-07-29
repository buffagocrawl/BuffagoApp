from __future__ import annotations

import shutil
from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

from PIL import Image

from wing_shots.generation import (
    BrandedContentGenerator,
    GenerationClaim,
    GenerationContext,
    GenerationOutcome,
    WingShotsGenerationWorker,
)
from wing_shots.models import (
    Candidate,
    Platform,
    PublishAttempt,
    PublishResult,
    SocialJob,
)
from wing_shots.orchestrator import (
    SKIPPED_NO_APPROVED_CONTENT,
    NightlyConfig,
    WingShotsNightlyOrchestrator,
)
from wing_shots.repository import SupabaseRpcRepository
from wing_shots.scoring import rank_candidates, score_candidate


NOW = datetime(2026, 7, 29, 0, 7, tzinfo=timezone.utc)


def candidate(
    submission_id: str,
    *,
    created_days_ago: int = 2,
    **overrides: Any,
) -> Candidate:
    values: dict[str, Any] = {
        "submission_id": submission_id,
        "user_id": f"user-{submission_id}",
        "destination_id": f"destination-{submission_id}",
        "created_at": NOW - timedelta(days=created_days_ago),
        "media_type": "photo",
        "processed_storage_path": f"processed/{submission_id}/primary",
        "quality_score": 85,
        "wing_confidence": 0.95,
        "moderation_confidence": 0.95,
        "rating_completeness": 1,
        "caption_quality": 0.8,
    }
    values.update(overrides)
    return Candidate(**values)


def social_job(
    platform: Platform,
    *,
    submission_id: str = "community-1",
    dry_run: bool = False,
    attempt_count: int = 1,
) -> SocialJob:
    job_id = f"job-{platform.value}"
    return SocialJob(
        job_id=job_id,
        submission_id=submission_id,
        platform=platform,
        media_type="photo",
        generated_media_path=(
            f"publication/{submission_id}/{platform.value}/{job_id}"
        ),
        generated_caption="Community wings rated on BuffaGo.",
        generated_alt_text="A submitted plate of chicken wings.",
        idempotency_key=f"social:{submission_id}:{platform.value}",
        dry_run=dry_run,
        attempt_count=attempt_count,
        claim_token=f"claim-{platform.value}",
    )


class FakeRepository:
    def __init__(
        self,
        *,
        selection: dict[str, Any] | None = None,
        jobs: dict[Platform, SocialJob | None] | None = None,
    ) -> None:
        self.selection = selection or {
            "receipt_id": "run-1",
            "status": "SELECTED",
            "submission_id": "community-1",
            "generation_job_id": "generation-1",
            "score_components": {"quality": 29.75, "total": 70.5},
        }
        self.jobs = jobs or {}
        self.claimed_platforms: list[str] = []
        self.results: list[tuple[PublishResult, str, str]] = []
        self.featured = False

    def recover_stale_platform_jobs(self, *, correlation_id):
        return {"recovered_count": 2, "exhausted_submission_count": 0}

    def run_nightly_selection(self, *, business_date, correlation_id):
        return dict(self.selection)

    def claim_platform_job(self, *, platform, worker_id, lease_seconds):
        self.claimed_platforms.append(platform)
        return self.jobs.get(Platform(platform))

    def record_publish_result(
        self,
        *,
        result,
        claim_token,
        idempotency_key,
        correlation_id,
    ):
        self.results.append((result, claim_token, idempotency_key))
        featured_now = result.posted and not self.featured
        self.featured = self.featured or featured_now
        return {
            "job_id": result.job_id,
            "status": result.database_receipt()["status"],
            "featured_now": featured_now,
            "reward_and_notification_settled_by_transition": featured_now,
        }


class FixedPublisher:
    def __init__(self, status: str) -> None:
        self.status = status
        self.calls: list[SocialJob] = []

    def publish(self, job: SocialJob) -> PublishResult:
        self.calls.append(job)
        if self.status == "posted":
            return PublishResult(
                platform=job.platform,
                job_id=job.job_id,
                status="posted",
                external_post_id=f"external-{job.platform.value}",
            )
        if self.status == "dry_run_succeeded":
            return PublishResult(
                platform=job.platform,
                job_id=job.job_id,
                status="dry_run_succeeded",
            )
        return PublishResult(
            platform=job.platform,
            job_id=job.job_id,
            status="failed",
            failure_code="provider_transient",
            attempts=(
                PublishAttempt(
                    attempt_number=1,
                    outcome="retryable_failure",
                    retryable=True,
                ),
            ),
        )


class RecordingSignedUrls:
    def __init__(self) -> None:
        self.paths: list[tuple[str, int]] = []

    def signed_url(self, storage_path: str, *, expires_seconds: int = 300):
        self.paths.append((storage_path, expires_seconds))
        return "https://storage.invalid/short-lived-ingestion"


class IntegratedGenerationRepository:
    def __init__(
        self, nightly_repository: FakeRepository, source: Path
    ) -> None:
        self.nightly_repository = nightly_repository
        self.source = source
        self.calls: list[str] = []
        self.submission_id = UUID("11111111-1111-4111-8111-111111111111")
        self.generation_id = UUID("22222222-2222-4222-8222-222222222222")
        self.claim_token = UUID("33333333-3333-4333-8333-333333333333")
        self.instagram_id = UUID("55555555-5555-4555-8555-555555555555")
        self.facebook_id = UUID("66666666-6666-4666-8666-666666666666")

    def claim_generation(self, *, worker_id, lease_seconds):
        self.calls.append("claim")
        return GenerationClaim(
            job_id=self.generation_id,
            submission_id=self.submission_id,
            claim_token=self.claim_token,
            instagram_media_path=(
                f"publication/{self.submission_id}/instagram/"
                f"{self.instagram_id}"
            ),
            facebook_media_path=(
                f"publication/{self.submission_id}/facebook/{self.facebook_id}"
            ),
        )

    def begin_generation(self, active_claim):
        self.calls.append("begin")
        return GenerationContext(
            job_id=self.generation_id,
            submission_id=self.submission_id,
            claim_token=self.claim_token,
            correlation_id=UUID("44444444-4444-4444-8444-444444444444"),
            bucket="wing-submissions",
            media_type="photo",
            processed_path=f"processed/{self.submission_id}/primary",
            instagram_media_path=active_claim.instagram_media_path,
            facebook_media_path=active_claim.facebook_media_path,
            restaurant_name="Anchor Bar",
            city="Buffalo",
            state_code="NY",
            overall=9,
            crispiness=8,
            sauce=9,
            meat=7,
            spice_level=6,
            would_order_again=True,
            attribution="@wingfan",
            anonymous_attribution=False,
        )

    def download_processed(
        self, active_context, destination, *, maximum_bytes
    ):
        self.calls.append("download")
        assert self.source.stat().st_size <= maximum_bytes
        shutil.copyfile(self.source, destination)

    def upload_generated(
        self,
        active_context,
        *,
        storage_path,
        local_path,
        content_type,
    ):
        self.calls.append(f"upload:{storage_path.split('/')[2]}")
        assert local_path.stat().st_size > 0
        assert content_type == "image/jpeg"

    def complete_generation(self, active_claim, assets):
        self.calls.append("complete")
        self.nightly_repository.jobs = {
            Platform.INSTAGRAM: social_job(
                Platform.INSTAGRAM,
                submission_id=str(self.submission_id),
                dry_run=True,
            ),
            Platform.FACEBOOK: social_job(
                Platform.FACEBOOK,
                submission_id=str(self.submission_id),
                dry_run=True,
            ),
        }
        return {"submission_status": "ready_to_post"}

    def fail_generation(
        self,
        active_claim,
        *,
        retryable,
        error_code,
        error_reason,
    ):
        raise AssertionError(f"generation unexpectedly failed: {error_code}")


class StaticGenerationWorker:
    def __init__(self, outcome: GenerationOutcome) -> None:
        self.outcome = outcome

    def run_once(self) -> GenerationOutcome:
        return self.outcome


def test_manual_priority_never_bypasses_safety_gate() -> None:
    unsafe = candidate(
        "unsafe",
        manual_priority=100,
        unsafe_flags=("graphic_content",),
        quality_score=100,
    )
    safe = candidate("safe", manual_priority=0, quality_score=70)
    ranked = rank_candidates([unsafe, safe], now=NOW)
    assert [row.submission_id for row, _ in ranked] == ["safe"]
    unsafe_score = score_candidate(unsafe, now=NOW)
    assert unsafe_score.eligible is False
    assert "unsafe_content" in unsafe_score.exclusions


def test_scoring_is_transparent_and_age_diversity_prevent_starvation() -> None:
    repeated = candidate(
        "repeated",
        created_days_ago=1,
        recent_user_features=4,
        recent_destination_features=4,
        recent_town_features=4,
        recent_style_features=4,
    )
    waiting = candidate("waiting", created_days_ago=30)
    waiting_score = score_candidate(waiting, now=NOW)
    assert "queue_age" in waiting_score.components
    assert "diversity" in waiting_score.components
    assert "manual_priority" in waiting_score.components
    ranked = rank_candidates([repeated, waiting], now=NOW)
    assert ranked[0][0].submission_id == "waiting"


def test_empty_queue_is_clean_skip_without_platform_claims() -> None:
    repository = FakeRepository(
        selection={
            "receipt_id": "run-empty",
            "status": SKIPPED_NO_APPROVED_CONTENT,
        }
    )
    receipt = WingShotsNightlyOrchestrator(
        repository=repository,
        publishers={},
        clock=lambda: NOW,
    ).run(business_date=date(2026, 7, 28))
    assert receipt.status == SKIPPED_NO_APPROVED_CONTENT
    assert receipt.selected_submission_id is None
    assert receipt.stale_claims_recovered == 2
    assert repository.claimed_platforms == []
    assert repository.results == []


def test_concurrent_runner_observes_database_lock_and_does_no_work() -> None:
    repository = FakeRepository(
        selection={"receipt_id": "run-existing", "status": "ALREADY_RUNNING"}
    )
    receipt = WingShotsNightlyOrchestrator(
        repository=repository,
        publishers={},
        clock=lambda: NOW,
    ).run(business_date=date(2026, 7, 28))
    assert receipt.status == "ALREADY_RUNNING"
    assert repository.claimed_platforms == []


def test_finalized_selection_can_publish_jobs_approved_after_generation() -> None:
    repository = FakeRepository(
        selection={"receipt_id": "run-finalized", "status": "COMPLETED"},
        jobs={
            Platform.INSTAGRAM: social_job(Platform.INSTAGRAM),
            Platform.FACEBOOK: social_job(Platform.FACEBOOK),
        },
    )
    receipt = WingShotsNightlyOrchestrator(
        repository=repository,
        publishers={
            Platform.INSTAGRAM: FixedPublisher("posted"),
            Platform.FACEBOOK: FixedPublisher("posted"),
        },
        signed_urls=RecordingSignedUrls(),
        config=NightlyConfig(dry_run=False),
        clock=lambda: NOW,
    ).run(business_date=date(2026, 7, 28))

    assert receipt.status == "COMPLETED"
    assert receipt.selected_submission_id is None
    assert repository.claimed_platforms == ["instagram", "facebook"]
    assert [result[0].platform for result in repository.results] == [
        Platform.INSTAGRAM,
        Platform.FACEBOOK,
    ]


def test_selected_submission_waits_cleanly_for_generation() -> None:
    repository = FakeRepository()
    receipt = WingShotsNightlyOrchestrator(
        repository=repository,
        publishers={},
        clock=lambda: NOW,
    ).run(business_date=date(2026, 7, 28))
    assert receipt.status == "GENERATION_PENDING"
    assert receipt.selected_submission_id == "community-1"
    assert repository.claimed_platforms == ["instagram", "facebook"]
    assert repository.results == []


def test_normal_nightly_flow_selects_generates_then_publishes(
    tmp_path: Path,
) -> None:
    submission_id = "11111111-1111-4111-8111-111111111111"
    repository = FakeRepository(
        selection={
            "receipt_id": "run-full-cycle",
            "status": "SELECTED",
            "submission_id": submission_id,
            "generation_job_id": "generation-full-cycle",
            "score_components": {"total": 81.5},
        }
    )
    source = tmp_path / "processed-community.jpg"
    Image.new("RGB", (1000, 800), (184, 68, 22)).save(source, "JPEG")
    generation_repository = IntegratedGenerationRepository(repository, source)
    generator = WingShotsGenerationWorker(
        repository=generation_repository,
        generator=BrandedContentGenerator(
            logo_path=(
                Path(__file__).resolve().parents[3]
                / "crawl/assets/images/buffago-logo.png"
            )
        ),
    )
    receipt = WingShotsNightlyOrchestrator(
        repository=repository,
        publishers={
            Platform.INSTAGRAM: FixedPublisher("dry_run_succeeded"),
            Platform.FACEBOOK: FixedPublisher("dry_run_succeeded"),
        },
        generation_worker=generator,
        clock=lambda: NOW,
    ).run(business_date=date(2026, 7, 28))
    assert generation_repository.calls == [
        "claim",
        "begin",
        "download",
        "upload:instagram",
        "upload:facebook",
        "complete",
    ]
    assert receipt.generation_result["status"] == "READY_TO_POST"
    assert receipt.status == "COMPLETED_DRY_RUN"
    assert [result[0].platform for result in repository.results] == [
        Platform.INSTAGRAM,
        Platform.FACEBOOK,
    ]


def test_generation_retry_has_clean_receipt_and_does_not_publish() -> None:
    submission_id = UUID("11111111-1111-4111-8111-111111111111")
    repository = FakeRepository(
        selection={
            "receipt_id": "run-generation-retry",
            "status": "SELECTED",
            "submission_id": str(submission_id),
        }
    )
    receipt = WingShotsNightlyOrchestrator(
        repository=repository,
        publishers={},
        generation_worker=StaticGenerationWorker(
            GenerationOutcome(
                status="RETRY",
                job_id=UUID("22222222-2222-4222-8222-222222222222"),
                submission_id=submission_id,
                error_code="GENERATION_DEPENDENCY_FAILURE",
            )
        ),
        clock=lambda: NOW,
    ).run(business_date=date(2026, 7, 28))
    assert receipt.status == "GENERATION_RETRY_PENDING"
    assert receipt.failure_code == "GENERATION_DEPENDENCY_FAILURE"
    assert receipt.generation_result["status"] == "RETRY"
    assert repository.claimed_platforms == []


def test_platform_results_are_independent_and_first_success_settles_once() -> None:
    repository = FakeRepository(
        jobs={
            Platform.INSTAGRAM: social_job(Platform.INSTAGRAM),
            Platform.FACEBOOK: social_job(Platform.FACEBOOK),
        }
    )
    signed_urls = RecordingSignedUrls()
    receipt = WingShotsNightlyOrchestrator(
        repository=repository,
        publishers={
            Platform.INSTAGRAM: FixedPublisher("posted"),
            Platform.FACEBOOK: FixedPublisher("failed"),
        },
        signed_urls=signed_urls,
        config=NightlyConfig(dry_run=False),
        clock=lambda: NOW,
    ).run(business_date=date(2026, 7, 28))
    assert receipt.status == "PARTIALLY_COMPLETED"
    assert receipt.platform_results["instagram"]["status"] == "posted"
    assert receipt.platform_results["facebook"]["settlement_status"] == (
        "retryable_failure"
    )
    assert len(repository.results) == 2
    assert repository.results[0][1] == "claim-instagram"
    assert repository.results[0][2] == "wing-publish-result:job-instagram:1"
    assert receipt.reward_settled is True
    assert receipt.notification_enqueued is True
    assert len(signed_urls.paths) == 2


def test_dry_run_never_requests_signed_url_or_settles_feature() -> None:
    repository = FakeRepository(
        jobs={
            Platform.INSTAGRAM: social_job(
                Platform.INSTAGRAM, dry_run=True
            ),
            Platform.FACEBOOK: social_job(Platform.FACEBOOK, dry_run=True),
        }
    )
    signed_urls = RecordingSignedUrls()
    receipt = WingShotsNightlyOrchestrator(
        repository=repository,
        publishers={
            Platform.INSTAGRAM: FixedPublisher("dry_run_succeeded"),
            Platform.FACEBOOK: FixedPublisher("dry_run_succeeded"),
        },
        signed_urls=signed_urls,
        clock=lambda: NOW,
    ).run(business_date=date(2026, 7, 28))
    assert receipt.status == "COMPLETED_DRY_RUN"
    assert receipt.reward_settled is False
    assert receipt.notification_enqueued is False
    assert signed_urls.paths == []


def test_untrusted_generated_path_is_failed_without_exposing_signed_url() -> None:
    bad_job = social_job(Platform.INSTAGRAM)
    bad_job = replace(
        bad_job,
        generated_media_path="originals/private-user-media",
    )
    repository = FakeRepository(
        jobs={
            Platform.INSTAGRAM: bad_job,
            Platform.FACEBOOK: None,
        }
    )
    signed_urls = RecordingSignedUrls()
    receipt = WingShotsNightlyOrchestrator(
        repository=repository,
        publishers={Platform.INSTAGRAM: FixedPublisher("posted")},
        signed_urls=signed_urls,
        config=NightlyConfig(dry_run=False),
        clock=lambda: NOW,
    ).run(business_date=date(2026, 7, 28))
    assert receipt.platform_results["instagram"]["failure_code"] == (
        "configuration_error"
    )
    assert repository.results[0][0].database_receipt()["status"] == (
        "configuration_error"
    )
    assert signed_urls.paths == []


class RecordingClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, Any]]] = []

    def request(self, method, path, *, json_payload):
        self.calls.append((method, path, json_payload))
        if path.endswith("run_wing_nightly_selection"):
            return {"receipt_id": "run-rpc", "status": "SELECTED"}
        if path.endswith("recover_stale_wing_social_jobs"):
            return {"recovered_count": 0, "exhausted_submission_count": 0}
        if path.endswith("claim_wing_social_job"):
            return None
        if path.endswith("finish_wing_social_job"):
            return {
                "job_id": json_payload["p_job_id"],
                "status": "retry",
                "featured_now": False,
            }
        raise AssertionError(path)


def test_supabase_adapter_uses_actual_selection_claim_and_finish_rpcs() -> None:
    client = RecordingClient()
    repository = SupabaseRpcRepository(client)
    recovered = repository.recover_stale_platform_jobs(
        correlation_id="correlation-rpc"
    )
    selected = repository.run_nightly_selection(
        business_date=date(2026, 7, 28),
        correlation_id="correlation-rpc",
    )
    assert recovered["recovered_count"] == 0
    claimed = repository.claim_platform_job(
        platform="instagram",
        worker_id="jalapeno-wing-shots",
        lease_seconds=600,
    )
    result = PublishResult(
        platform=Platform.INSTAGRAM,
        job_id="job-rpc",
        status="failed",
        failure_code="rate_limited",
    )
    finished = repository.record_publish_result(
        result=result,
        claim_token="claim-rpc",
        idempotency_key="publish-result-rpc",
        correlation_id="correlation-rpc",
    )
    assert selected["receipt_id"] == "run-rpc"
    assert claimed is None
    assert finished["status"] == "retry"
    assert [call[1] for call in client.calls] == [
        "rpc/recover_stale_wing_social_jobs",
        "rpc/run_wing_nightly_selection",
        "rpc/claim_wing_social_job",
        "rpc/finish_wing_social_job",
    ]
    finish_payload = client.calls[-1][2]
    assert finish_payload["p_claim_token"] == "claim-rpc"
    assert finish_payload["p_result"]["status"] == "rate_limited"
    assert "access_token" not in str(finish_payload).lower()
