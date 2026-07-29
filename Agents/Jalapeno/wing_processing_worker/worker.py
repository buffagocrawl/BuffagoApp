"""One-claim-at-a-time secure media processing coordinator."""

from __future__ import annotations

import json
import logging
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import UUID

from wing_media_processing import (
    PermanentMediaError,
    PhotoArtifacts,
    RetryableMediaError,
    VideoArtifacts,
    WingMediaProcessor,
)

from .errors import WorkerContractError, WorkerError
from .models import FingerprintCandidate, ProcessingClaim, ProcessingContext
from .moderation import ModerationProvider
from .repository import ProcessingRepository


@dataclass(frozen=True, slots=True)
class ProcessingOutcome:
    status: str
    job_id: UUID | None = None
    submission_id: UUID | None = None
    error_code: str | None = None


def _photo_similarity(left: str, right: str) -> float:
    if len(left) != 16 or len(right) != 16:
        return 0.0
    try:
        distance = (int(left, 16) ^ int(right, 16)).bit_count()
    except ValueError:
        return 0.0
    return 1.0 - (distance / 64.0)


def _nearest(
    fingerprint: str,
    candidates: list[FingerprintCandidate],
    *,
    media_type: str,
) -> tuple[UUID | None, float]:
    best_id: UUID | None = None
    best = 0.0
    for candidate in candidates:
        similarity = (
            _photo_similarity(fingerprint, candidate.fingerprint)
            if media_type == "photo"
            else float(fingerprint == candidate.fingerprint)
        )
        if similarity > best:
            best_id = candidate.submission_id
            best = similarity
    return best_id, best


class WingProcessingWorker:
    def __init__(
        self,
        *,
        repository: ProcessingRepository,
        processor: WingMediaProcessor,
        moderation_provider: ModerationProvider,
        worker_id: str,
        logger: logging.Logger | None = None,
    ) -> None:
        if len(worker_id) < 3 or len(worker_id) > 120:
            raise ValueError("worker_id must contain 3 to 120 characters")
        self.repository = repository
        self.processor = processor
        self.moderation_provider = moderation_provider
        self.worker_id = worker_id
        self.logger = logger or logging.getLogger(__name__)

    def _event(self, event: str, **fields: Any) -> None:
        allowed = {
            key: value
            for key, value in fields.items()
            if key in {"job_id", "submission_id", "status", "error_code"}
        }
        self.logger.info(json.dumps({"event": event, **allowed}, sort_keys=True))

    def run_once(self) -> ProcessingOutcome:
        self.repository.enqueue_backlog(limit=100)
        claim = self.repository.claim(worker_id=self.worker_id, lease_seconds=300)
        if claim is None:
            self._event("wing_processing_idle", status="NO_JOB")
            return ProcessingOutcome(status="NO_JOB")
        try:
            context = self.repository.begin(claim)
            self._process_claim(claim, context)
            self.repository.settle_success(
                claim,
                context,
                perceptual_hash=self._perceptual_hash,
            )
            self._event(
                "wing_processing_completed",
                job_id=str(claim.job_id),
                submission_id=str(claim.submission_id),
                status="IN_REVIEW",
            )
            return ProcessingOutcome(
                status="IN_REVIEW",
                job_id=claim.job_id,
                submission_id=claim.submission_id,
            )
        except Exception as exc:
            return self._handle_failure(claim, exc)

    def _process_claim(
        self,
        claim: ProcessingClaim,
        context: ProcessingContext,
    ) -> None:
        del claim
        self._perceptual_hash: str | None = None
        maximum = (
            self.processor.limits.max_photo_bytes
            if context.media_type == "photo"
            else self.processor.limits.max_video_bytes
        )
        with tempfile.TemporaryDirectory(prefix="wing-processing-") as temporary:
            work = Path(temporary)
            source = work / "source"
            output = work / "output"
            self.repository.download_original(
                context,
                source,
                maximum_bytes=maximum,
            )
            artifacts = self.processor.process(
                source,
                output,
                submission_id=context.submission_id,
            )
            if context.media_type == "photo" and not isinstance(
                artifacts, PhotoArtifacts
            ):
                raise WorkerContractError()
            if context.media_type == "video" and not isinstance(
                artifacts, VideoArtifacts
            ):
                raise WorkerContractError()

            if isinstance(artifacts, PhotoArtifacts):
                primary = artifacts.normalized_path
                fingerprint = artifacts.perceptual_hash
                algorithm = "phash"
                version = "1"
                self._perceptual_hash = fingerprint
                self.repository.upload_artifact(
                    context,
                    storage_path=f"processed/{context.submission_id}/square",
                    local_path=artifacts.square_path,
                    content_type="image/jpeg",
                )
                self.repository.upload_artifact(
                    context,
                    storage_path=f"processed/{context.submission_id}/portrait",
                    local_path=artifacts.portrait_path,
                    content_type="image/jpeg",
                )
            else:
                primary = artifacts.processed_path
                fingerprint = artifacts.fingerprint
                algorithm = "frame-sha256"
                version = "1"

            self.repository.upload_artifact(
                context,
                storage_path=context.processed_path,
                local_path=primary,
                content_type=(
                    "image/jpeg" if context.media_type == "photo" else "video/mp4"
                ),
            )
            self.repository.upload_artifact(
                context,
                storage_path=context.thumbnail_path,
                local_path=artifacts.thumbnail_path,
                content_type="image/jpeg",
            )

            candidates = self.repository.fingerprint_candidates(
                context,
                algorithm=algorithm,
                version=version,
            )
            nearest_id, similarity = _nearest(
                fingerprint,
                candidates,
                media_type=context.media_type,
            )
            moderation = self.moderation_provider.evaluate(
                primary,
                media_type=context.media_type,
            ).with_duplicate_probability(similarity)
            # Moderation is recorded first so a duplicate signal can
            # subsequently force manual review and cannot be overwritten.
            self.repository.record_moderation(
                context,
                payload=moderation.database_payload(),
            )
            self.repository.record_fingerprint(
                context,
                algorithm=algorithm,
                version=version,
                fingerprint=fingerprint,
                nearest_submission_id=nearest_id,
                similarity=similarity if nearest_id else None,
            )

    def _handle_failure(
        self,
        claim: ProcessingClaim,
        exc: Exception,
    ) -> ProcessingOutcome:
        if isinstance(exc, PermanentMediaError):
            code = "INVALID_MEDIA"
            retryable = False
            reason = "The uploaded media failed safe validation."
        elif isinstance(exc, RetryableMediaError):
            code = "MEDIA_TOOL_TEMPORARY_FAILURE"
            retryable = True
            reason = "A required media-processing tool was temporarily unavailable."
        elif isinstance(exc, WorkerError):
            code = exc.code
            retryable = exc.retryable
            reason = exc.public_reason
        else:
            code = "UNEXPECTED_PROCESSING_FAILURE"
            retryable = True
            reason = "An unexpected processing dependency failed."
        try:
            receipt = self.repository.settle_failure(
                claim,
                retryable=retryable,
                error_code=code,
                error_reason=reason,
            )
            status = str(receipt.get("job_status", "FAILED")).upper()
        except Exception:
            status = "CLAIM_SETTLEMENT_FAILED"
        self._event(
            "wing_processing_failed",
            job_id=str(claim.job_id),
            submission_id=str(claim.submission_id),
            status=status,
            error_code=code,
        )
        return ProcessingOutcome(
            status=status,
            job_id=claim.job_id,
            submission_id=claim.submission_id,
            error_code=code,
        )

    def run_cleanup_once(self) -> ProcessingOutcome:
        self.repository.enqueue_cleanup(limit=100)
        claim = self.repository.claim_cleanup(
            worker_id=self.worker_id,
            lease_seconds=120,
        )
        if claim is None:
            self._event("wing_cleanup_idle", status="NO_JOB")
            return ProcessingOutcome(status="NO_JOB")
        try:
            object_outcome = self.repository.delete_cleanup_object(claim)
            receipt = self.repository.finish_cleanup(
                claim,
                outcome=object_outcome,
            )
            status = str(receipt.get("status", "succeeded")).upper()
            self._event(
                "wing_cleanup_completed",
                job_id=str(claim.job_id),
                status=status,
            )
            return ProcessingOutcome(status=status, job_id=claim.job_id)
        except Exception as exc:
            retryable = not isinstance(exc, WorkerContractError)
            code = (
                exc.code
                if isinstance(exc, WorkerError)
                else "STORAGE_DELETE_FAILED"
            )
            try:
                receipt = self.repository.finish_cleanup(
                    claim,
                    outcome="failed",
                    retryable=retryable,
                    error_code=code,
                )
                status = str(receipt.get("status", "failed")).upper()
            except Exception:
                status = "CLAIM_SETTLEMENT_FAILED"
            self._event(
                "wing_cleanup_failed",
                job_id=str(claim.job_id),
                status=status,
                error_code=code,
            )
            return ProcessingOutcome(
                status=status,
                job_id=claim.job_id,
                error_code=code,
            )
