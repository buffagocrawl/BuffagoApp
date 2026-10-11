"""Dedicated photo queue using the trusted processor and private Storage adapter."""
from __future__ import annotations

from pathlib import Path
from uuid import UUID

from .errors import WorkerContractError, ExistingDerivativeConflict, RetryableWorkerError
from .models import ProcessingClaim, ProcessingContext
from .repository import ProcessingRepository


class PhotoDerivativeRepository(ProcessingRepository):
    """Running this worker never implicitly selects existing approvals."""

    active_claim: ProcessingClaim | None = None

    def __init__(self, client, *, submission_id: UUID | None = None, review_only: bool = False) -> None:
        super().__init__(client)
        self.submission_id = submission_id
        self.review_only = review_only

    def enqueue_backlog(self, *, limit: int = 100) -> int:
        # Future uploads are atomically queued by the submission insert trigger.
        # Existing records require an explicit, audited request/dry run.
        return 0

    def claim(self, *, worker_id: str, lease_seconds: int = 300) -> ProcessingClaim | None:
        args = {"p_worker": worker_id, "p_lease_seconds": lease_seconds}
        if self.submission_id is not None:
            args["p_submission_id"] = str(self.submission_id)
        payload = self._scalar(self._rpc("claim_wing_photo_derivative_job", args))
        if payload is None:
            self.active_claim = None
            return None
        try:
            self.active_claim = ProcessingClaim.from_payload(payload)
            if self.submission_id is not None and self.active_claim.submission_id != self.submission_id:
                self.active_claim = None
                raise WorkerContractError()
        except (KeyError, TypeError, ValueError) as exc:
            raise WorkerContractError() from exc
        return self.active_claim

    def begin(self, claim: ProcessingClaim) -> ProcessingContext:
        payload = self._scalar(self._rpc("begin_wing_photo_derivative_job", {
            "p_job_id": str(claim.job_id), "p_claim_token": str(claim.claim_token),
        }))
        try:
            context = ProcessingContext.from_payload(payload)
        except (KeyError, TypeError, ValueError) as exc:
            raise WorkerContractError() from exc
        if (context.submission_id != claim.submission_id or context.media_type != "photo"
                or (self.review_only and context.preserve_approval)):
            raise WorkerContractError()
        self.active_claim = claim
        return context

    def _revalidate(self, context: ProcessingContext) -> None:
        if self.active_claim is None or self.begin(self.active_claim) != context:
            raise WorkerContractError()

    def download_original(self, context: ProcessingContext, destination: Path, *, maximum_bytes: int) -> None:
        self._revalidate(context)
        super().download_original(context, destination, maximum_bytes=maximum_bytes)

    def register_exact_media(self, context: ProcessingContext, **fields) -> bool:
        self._revalidate(context)
        return super().register_exact_media(context, **fields)

    def record_moderation(self, context: ProcessingContext, **fields) -> None:
        self._revalidate(context)
        super().record_moderation(context, **fields)

    def record_fingerprint(self, context: ProcessingContext, **fields) -> None:
        self._revalidate(context)
        super().record_fingerprint(context, **fields)

    def upload_artifact(self, context: ProcessingContext, *, storage_path: str, local_path: Path, content_type: str) -> None:
        self._revalidate(context)
        allowed = {context.processed_path, context.thumbnail_path,
                   f"processed/{context.submission_id}/square", f"processed/{context.submission_id}/portrait"}
        if storage_path not in allowed or content_type != "image/jpeg":
            raise WorkerContractError()
        # Exact comparison with the freshly generated, metadata-stripped artifact
        # proves source/transform compatibility without trusting object names.
        expected = local_path.read_bytes()
        def exists_and_matches():
            prefix, name = storage_path.rsplit("/", 1)
            objects = self.client.list_storage_objects(context.bucket, prefix=prefix)
            matches = [o for o in objects if o.get("name") == name]
            if not matches:
                return False
            metadata = matches[0].get("metadata") or {}
            if (metadata.get("mimetype", metadata.get("contentType")) != content_type
                    or str(metadata.get("size", 0)) != str(len(expected))):
                raise ExistingDerivativeConflict()
            if self.client.download_storage_object(context.bucket, storage_path, maximum_bytes=len(expected)) != expected:
                raise ExistingDerivativeConflict()
            return True
        try:
            if exists_and_matches():
                return
            self._revalidate(context)
            try:
                self.client.create_storage_object(context.bucket, storage_path,
                    data=expected, content_type=content_type)
            except Exception:
                # Includes concurrent creation and ambiguous upload responses.
                if not exists_and_matches():
                    raise RetryableWorkerError()
            if not exists_and_matches():
                raise RetryableWorkerError()
        except WorkerContractError:
            raise
        except Exception as exc:
            raise RetryableWorkerError() from exc

    def _settle(self, claim: ProcessingClaim, **fields) -> dict:
        result = self._scalar(self._rpc("settle_wing_photo_derivative_job", {
            "p_job_id": str(claim.job_id), "p_claim_token": str(claim.claim_token), **fields,
        }))
        if not isinstance(result, dict):
            raise WorkerContractError()
        return result

    def settle_success(self, claim: ProcessingClaim, context: ProcessingContext, *, perceptual_hash: str | None) -> dict:
        return self._settle(claim, p_succeeded=True, p_retryable=False,
                            p_processed_path=context.processed_path, p_thumbnail_path=context.thumbnail_path,
                            p_perceptual_hash=perceptual_hash)

    def settle_failure(self, claim: ProcessingClaim, *, retryable: bool, error_code: str, error_reason: str) -> dict:
        return self._settle(claim, p_succeeded=False, p_retryable=retryable,
                            p_error_code=error_code[:100], p_error_reason=error_reason[:1000])
