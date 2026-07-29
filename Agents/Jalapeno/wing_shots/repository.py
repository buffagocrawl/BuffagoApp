from __future__ import annotations

from datetime import date
from typing import Any, Protocol, runtime_checkable
from urllib.parse import quote

from .models import PublishResult, SocialJob


class RepositoryError(RuntimeError):
    pass


@runtime_checkable
class WingShotsRepository(Protocol):
    def recover_stale_platform_jobs(
        self, *, correlation_id: str
    ) -> dict[str, Any]: ...

    def run_nightly_selection(
        self, *, business_date: date, correlation_id: str
    ) -> dict[str, Any]: ...

    def run_approved_queue_selection(
        self, *, business_date: date, correlation_id: str,
        submission_id: str | None = None
    ) -> dict[str, Any]: ...

    def claim_platform_job(
        self,
        *,
        platform: str,
        worker_id: str,
        lease_seconds: int,
    ) -> SocialJob | None: ...

    def record_publish_result(
        self,
        *,
        result: PublishResult,
        claim_token: str,
        idempotency_key: str,
        correlation_id: str,
    ) -> dict[str, Any]: ...

    def prepare_manual_publish(
        self, *, submission_id: str, correlation_id: str
    ) -> dict[str, Any]: ...


@runtime_checkable
class SignedUrlProvider(Protocol):
    def signed_url(
        self, storage_path: str, *, expires_seconds: int = 300
    ) -> str: ...


class SupabaseRpcRepository:
    """Thin adapter over server-authoritative Wing Shot RPCs.

    Locking, uniqueness, eligibility rechecks, state transitions, reward
    idempotency, and notification deduplication belong in these database RPCs.
    Python never emulates their transactional guarantees.
    """

    def __init__(self, client: Any) -> None:
        self.client = client

    def _rpc(self, name: str, payload: dict[str, Any]) -> Any:
        result = self.client.request(
            "POST",
            f"rpc/{name}",
            json_payload=payload,
        )
        return result

    @staticmethod
    def _one(result: Any, *, rpc: str) -> dict[str, Any]:
        if isinstance(result, list):
            result = result[0] if result else None
        if not isinstance(result, dict):
            raise RepositoryError(f"{rpc} returned an invalid response")
        return result

    def run_nightly_selection(
        self, *, business_date: date, correlation_id: str
    ) -> dict[str, Any]:
        return self._one(
            self._rpc(
                "run_wing_nightly_selection",
                {
                    "p_business_date": business_date.isoformat(),
                    "p_correlation_id": correlation_id,
                },
            ), rpc="run_wing_nightly_selection"
        )

    def run_approved_queue_selection(
        self, *, business_date: date, correlation_id: str,
        submission_id: str | None = None
    ) -> dict[str, Any]:
        return self._one(
            self._rpc(
                "run_wing_approved_queue_selection",
                {
                    "p_business_date": business_date.isoformat(),
                    "p_correlation_id": correlation_id,
                    "p_submission_id": submission_id,
                },
            ), rpc="run_wing_approved_queue_selection"
        )

    def recover_stale_platform_jobs(
        self, *, correlation_id: str
    ) -> dict[str, Any]:
        return self._one(
            self._rpc(
                "recover_stale_wing_social_jobs",
                {"p_correlation_id": correlation_id},
            ),
            rpc="recover_stale_wing_social_jobs",
        )

    def claim_platform_job(
        self,
        *,
        platform: str,
        worker_id: str,
        lease_seconds: int = 600,
    ) -> SocialJob | None:
        result = self._rpc(
            "claim_wing_social_job",
            {
                "p_platform": platform,
                "p_worker": worker_id,
                "p_lease_seconds": lease_seconds,
            },
        )
        if isinstance(result, list):
            result = result[0] if result else None
        if result is None:
            return None
        if not isinstance(result, dict):
            raise RepositoryError("claim_wing_social_job returned invalid data")
        return SocialJob.from_row(result)

    def record_publish_result(
        self,
        *,
        result: PublishResult,
        claim_token: str,
        idempotency_key: str,
        correlation_id: str,
    ) -> dict[str, Any]:
        return self._one(
            self._rpc(
                "finish_wing_social_job",
                {
                    "p_job_id": result.job_id,
                    "p_claim_token": claim_token,
                    "p_result": result.database_receipt(),
                    "p_idempotency_key": idempotency_key,
                    "p_correlation_id": correlation_id,
                },
            ),
            rpc="finish_wing_social_job",
        )

    def prepare_manual_publish(
        self, *, submission_id: str, correlation_id: str
    ) -> dict[str, Any]:
        return self._one(
            self._rpc(
                "prepare_wing_manual_publish",
                {
                    "p_submission_id": submission_id,
                    "p_correlation_id": correlation_id,
                },
            ), rpc="prepare_wing_manual_publish"
        )


class SupabaseStorageSignedUrlProvider:
    """Creates short-lived ingestion URLs without persisting or logging them."""

    def __init__(self, client: Any, *, bucket: str = "wing-submissions") -> None:
        self.client = client
        self.bucket = bucket

    def signed_url(
        self, storage_path: str, *, expires_seconds: int = 300
    ) -> str:
        if not storage_path.startswith("publication/") or ".." in storage_path:
            raise RepositoryError("untrusted_publication_media_path")
        if expires_seconds < 60 or expires_seconds > 600:
            raise RepositoryError("signed_url_expiration_out_of_bounds")
        endpoint = self.client._storage_endpoint(
            f"object/sign/{quote(self.bucket)}/{quote(storage_path, safe='/')}"
        )
        response = self.client._session.post(
            endpoint,
            json={"expiresIn": expires_seconds},
            timeout=self.client.config.timeout_seconds,
        )
        if response.status_code >= 400:
            raise RepositoryError(
                f"storage signing failed ({response.status_code})"
            )
        payload = response.json() if response.content else {}
        signed = payload.get("signedURL") or payload.get("signedUrl")
        if not isinstance(signed, str) or not signed:
            raise RepositoryError("storage signing returned no URL")
        if signed.startswith("http://") or signed.startswith("https://"):
            return signed
        return f"{self.client.config.url.rstrip('/')}/storage/v1/{signed.lstrip('/')}"
