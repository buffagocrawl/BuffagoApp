"""Service-role-only RPC and private Storage adapter."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import quote
from uuid import UUID

import requests

from .errors import RetryableWorkerError, WorkerContractError
from .models import (
    CleanupClaim,
    FingerprintCandidate,
    ProcessingClaim,
    ProcessingContext,
)


class ProcessingRepository:
    def __init__(self, client: Any, *, bucket: str = "wing-submissions") -> None:
        self.client = client
        self.bucket = bucket

    def _rpc(self, name: str, payload: dict[str, Any]) -> Any:
        try:
            return self.client.request("POST", f"rpc/{name}", json_payload=payload)
        except Exception as exc:
            raise RetryableWorkerError() from exc

    @staticmethod
    def _scalar(payload: Any) -> Any:
        if isinstance(payload, list):
            return payload[0] if payload else None
        return payload

    def enqueue_backlog(self, *, limit: int = 100) -> int:
        result = self._scalar(
            self._rpc("enqueue_wing_processing_backlog", {"p_limit": limit})
        )
        if isinstance(result, bool) or not isinstance(result, int):
            raise WorkerContractError()
        return result

    def claim(self, *, worker_id: str, lease_seconds: int = 300) -> ProcessingClaim | None:
        payload = self._scalar(
            self._rpc(
                "claim_wing_processing_job",
                {"p_worker": worker_id, "p_lease_seconds": lease_seconds},
            )
        )
        if payload is None:
            return None
        try:
            return ProcessingClaim.from_payload(payload)
        except (KeyError, TypeError, ValueError) as exc:
            raise WorkerContractError() from exc

    def begin(self, claim: ProcessingClaim) -> ProcessingContext:
        payload = self._scalar(
            self._rpc(
                "begin_wing_processing_job",
                {
                    "p_job_id": str(claim.job_id),
                    "p_claim_token": str(claim.claim_token),
                },
            )
        )
        try:
            context = ProcessingContext.from_payload(payload)
        except (KeyError, TypeError, ValueError) as exc:
            raise WorkerContractError() from exc
        if context.submission_id != claim.submission_id:
            raise WorkerContractError()
        return context

    def _signed_download_url(self, context: ProcessingContext, *, expires: int = 120) -> str:
        if expires < 60 or expires > 300:
            raise WorkerContractError()
        endpoint = self.client._storage_endpoint(
            f"object/sign/{quote(context.bucket)}/"
            f"{quote(context.original_path, safe='/')}"
        )
        try:
            response = self.client._session.post(
                endpoint,
                json={"expiresIn": expires},
                timeout=self.client.config.timeout_seconds,
            )
        except requests.RequestException as exc:
            raise RetryableWorkerError() from exc
        if response.status_code >= 500 or response.status_code == 429:
            raise RetryableWorkerError()
        if response.status_code >= 400:
            raise WorkerContractError()
        try:
            payload = response.json()
        except ValueError as exc:
            raise WorkerContractError() from exc
        signed = payload.get("signedURL") or payload.get("signedUrl")
        if not isinstance(signed, str) or not signed:
            raise WorkerContractError()
        if signed.startswith(("http://", "https://")):
            return signed
        return (
            f"{self.client.config.url.rstrip('/')}/storage/v1/"
            f"{signed.lstrip('/')}"
        )

    def download_original(
        self,
        context: ProcessingContext,
        destination: Path,
        *,
        maximum_bytes: int,
    ) -> None:
        url = self._signed_download_url(context)
        try:
            with self.client._session.get(
                url,
                stream=True,
                timeout=self.client.config.timeout_seconds,
            ) as response:
                if response.status_code >= 500 or response.status_code == 429:
                    raise RetryableWorkerError()
                if response.status_code >= 400:
                    raise WorkerContractError()
                received = 0
                with destination.open("wb") as output:
                    for chunk in response.iter_content(64 * 1024):
                        if not chunk:
                            continue
                        received += len(chunk)
                        if received > maximum_bytes:
                            raise WorkerContractError()
                        output.write(chunk)
        except (requests.Timeout, requests.ConnectionError, OSError) as exc:
            destination.unlink(missing_ok=True)
            raise RetryableWorkerError() from exc
        except Exception:
            destination.unlink(missing_ok=True)
            raise

    def upload_artifact(
        self,
        context: ProcessingContext,
        *,
        storage_path: str,
        local_path: Path,
        content_type: str,
    ) -> None:
        submission = str(context.submission_id)
        allowed = {
            context.processed_path,
            context.thumbnail_path,
            f"processed/{submission}/square",
            f"processed/{submission}/portrait",
        }
        if storage_path not in allowed:
            raise WorkerContractError()
        try:
            self.client.upload_storage_object(
                context.bucket,
                storage_path,
                data=local_path.read_bytes(),
                content_type=content_type,
                upsert=True,
            )
        except OSError as exc:
            raise RetryableWorkerError() from exc
        except Exception as exc:
            raise RetryableWorkerError() from exc

    def fingerprint_candidates(
        self,
        context: ProcessingContext,
        *,
        algorithm: str,
        version: str,
    ) -> list[FingerprintCandidate]:
        payload = self._rpc(
            "get_wing_fingerprint_candidates",
            {
                "p_submission_id": str(context.submission_id),
                "p_media_type": context.media_type,
                "p_algorithm": algorithm,
                "p_algorithm_version": version,
                "p_limit": 500,
            },
        )
        if payload is None:
            return []
        if not isinstance(payload, list):
            raise WorkerContractError()
        candidates: list[FingerprintCandidate] = []
        try:
            for item in payload:
                candidates.append(
                    FingerprintCandidate(
                        submission_id=UUID(str(item["submission_id"])),
                        fingerprint=str(item["fingerprint"]),
                    )
                )
        except (KeyError, TypeError, ValueError) as exc:
            raise WorkerContractError() from exc
        return candidates

    def register_exact_media(
        self, context: ProcessingContext, *, content_hash: str, size_bytes: int
    ) -> bool:
        result = self._scalar(
            self._rpc(
                "register_wing_exact_media",
                {
                    "p_submission_id": str(context.submission_id),
                    "p_media_type": context.media_type,
                    "p_sha256": content_hash,
                    "p_size_bytes": size_bytes,
                },
            )
        )
        if not isinstance(result, dict) or not isinstance(result.get("duplicate"), bool):
            raise WorkerContractError()
        return result["duplicate"]

    def record_moderation(
        self,
        context: ProcessingContext,
        *,
        payload: dict[str, Any],
    ) -> None:
        self._rpc(
            "record_wing_ai_moderation",
            {
                "p_submission_id": str(context.submission_id),
                "p_result": payload,
                "p_idempotency_key": f"moderation:{context.submission_id}:1",
                "p_correlation_id": str(context.correlation_id),
            },
        )

    def record_fingerprint(
        self,
        context: ProcessingContext,
        *,
        algorithm: str,
        version: str,
        fingerprint: str,
        nearest_submission_id: UUID | None,
        similarity: float | None,
    ) -> None:
        self._rpc(
            "record_wing_fingerprint",
            {
                "p_submission_id": str(context.submission_id),
                "p_media_type": context.media_type,
                "p_algorithm": algorithm,
                "p_algorithm_version": version,
                "p_fingerprint": fingerprint,
                "p_nearest_submission_id": (
                    str(nearest_submission_id) if nearest_submission_id else None
                ),
                "p_similarity": similarity,
                "p_idempotency_key": f"fingerprint:{context.submission_id}:{version}",
                "p_correlation_id": str(context.correlation_id),
            },
        )

    def settle_success(
        self,
        claim: ProcessingClaim,
        context: ProcessingContext,
        *,
        perceptual_hash: str | None,
    ) -> dict[str, Any]:
        result = self._scalar(
            self._rpc(
                "settle_wing_processing_job",
                {
                    "p_job_id": str(claim.job_id),
                    "p_claim_token": str(claim.claim_token),
                    "p_succeeded": True,
                    "p_retryable": False,
                    "p_processed_path": context.processed_path,
                    "p_thumbnail_path": context.thumbnail_path,
                    "p_perceptual_hash": perceptual_hash,
                    "p_error_code": None,
                    "p_error_reason": None,
                },
            )
        )
        if not isinstance(result, dict):
            raise WorkerContractError()
        return result

    def settle_failure(
        self,
        claim: ProcessingClaim,
        *,
        retryable: bool,
        error_code: str,
        error_reason: str,
    ) -> dict[str, Any]:
        result = self._scalar(
            self._rpc(
                "settle_wing_processing_job",
                {
                    "p_job_id": str(claim.job_id),
                    "p_claim_token": str(claim.claim_token),
                    "p_succeeded": False,
                    "p_retryable": retryable,
                    "p_processed_path": None,
                    "p_thumbnail_path": None,
                    "p_perceptual_hash": None,
                    "p_error_code": error_code[:100],
                    "p_error_reason": error_reason[:1000],
                },
            )
        )
        if not isinstance(result, dict):
            raise WorkerContractError()
        return result

    def enqueue_cleanup(self, *, limit: int = 100) -> int:
        result = self._scalar(
            self._rpc("enqueue_wing_media_cleanup", {"p_limit": limit})
        )
        if isinstance(result, bool) or not isinstance(result, int):
            raise WorkerContractError()
        return result

    def claim_cleanup(
        self,
        *,
        worker_id: str,
        lease_seconds: int = 120,
    ) -> CleanupClaim | None:
        payload = self._scalar(
            self._rpc(
                "claim_wing_media_cleanup_job",
                {
                    "p_worker": worker_id,
                    "p_lease_seconds": lease_seconds,
                },
            )
        )
        if payload is None:
            return None
        try:
            return CleanupClaim.from_payload(payload)
        except (KeyError, TypeError, ValueError) as exc:
            raise WorkerContractError() from exc

    def delete_cleanup_object(self, claim: CleanupClaim) -> str:
        endpoint = self.client._storage_endpoint(
            f"object/{quote(claim.bucket)}/{quote(claim.object_path, safe='/')}"
        )
        try:
            response = self.client._session.delete(
                endpoint,
                timeout=self.client.config.timeout_seconds,
            )
        except requests.RequestException as exc:
            raise RetryableWorkerError() from exc
        if response.status_code == 404:
            return "missing"
        if response.status_code == 429 or response.status_code >= 500:
            raise RetryableWorkerError()
        if response.status_code >= 400:
            raise WorkerContractError()
        return "deleted"

    def finish_cleanup(
        self,
        claim: CleanupClaim,
        *,
        outcome: str,
        retryable: bool = False,
        error_code: str | None = None,
    ) -> dict[str, Any]:
        result = self._scalar(
            self._rpc(
                "finish_wing_media_cleanup_job",
                {
                    "p_job_id": str(claim.job_id),
                    "p_claim_token": str(claim.claim_token),
                    "p_object_outcome": outcome,
                    "p_retryable": retryable,
                    "p_error_code": error_code,
                },
            )
        )
        if not isinstance(result, dict):
            raise WorkerContractError()
        return result
