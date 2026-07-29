"""Service-role adapter for protected Wing Shot generation assets."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests

from .generation import (
    GeneratedAssets,
    GenerationClaim,
    GenerationContext,
    GenerationContractError,
    GenerationDependencyError,
)


class SupabaseGenerationRepository:
    def __init__(self, client: Any, *, bucket: str = "wing-submissions") -> None:
        self.client = client
        self.bucket = bucket

    def _rpc(self, name: str, payload: dict[str, Any]) -> Any:
        try:
            return self.client.request(
                "POST", f"rpc/{name}", json_payload=payload
            )
        except Exception as exc:
            raise GenerationDependencyError(
                "GENERATION_DATABASE_UNAVAILABLE",
                "The generation database contract was temporarily unavailable.",
            ) from exc

    @staticmethod
    def _scalar(payload: Any) -> Any:
        if isinstance(payload, list):
            return payload[0] if payload else None
        return payload

    def claim_generation(
        self, *, worker_id: str, lease_seconds: int = 600
    ) -> GenerationClaim | None:
        payload = self._scalar(
            self._rpc(
                "claim_wing_generation_job",
                {
                    "p_worker": worker_id,
                    "p_lease_seconds": lease_seconds,
                },
            )
        )
        if payload is None:
            return None
        try:
            return GenerationClaim.from_payload(payload)
        except (KeyError, TypeError, ValueError) as exc:
            raise GenerationContractError("INVALID_GENERATION_CLAIM") from exc

    def begin_generation(
        self, claim: GenerationClaim
    ) -> GenerationContext:
        payload = self._scalar(
            self._rpc(
                "begin_wing_generation_job",
                {
                    "p_job_id": str(claim.job_id),
                    "p_claim_token": str(claim.claim_token),
                },
            )
        )
        try:
            return GenerationContext.from_payload(payload)
        except (KeyError, TypeError, ValueError) as exc:
            raise GenerationContractError("INVALID_GENERATION_CONTEXT") from exc

    def _signed_processed_url(
        self, context: GenerationContext, *, expires_seconds: int = 120
    ) -> str:
        if expires_seconds < 60 or expires_seconds > 300:
            raise GenerationContractError("SIGNED_URL_EXPIRATION_INVALID")
        if context.bucket != self.bucket:
            raise GenerationContractError("GENERATION_BUCKET_MISMATCH")
        endpoint = self.client._storage_endpoint(
            f"object/sign/{quote(self.bucket)}/"
            f"{quote(context.processed_path, safe='/')}"
        )
        try:
            response = self.client._session.post(
                endpoint,
                json={"expiresIn": expires_seconds},
                timeout=self.client.config.timeout_seconds,
            )
        except requests.RequestException as exc:
            raise GenerationDependencyError(
                "GENERATION_STORAGE_SIGNING_UNAVAILABLE"
            ) from exc
        if response.status_code >= 500 or response.status_code == 429:
            raise GenerationDependencyError(
                "GENERATION_STORAGE_SIGNING_UNAVAILABLE"
            )
        if response.status_code >= 400:
            raise GenerationContractError("PROCESSED_MEDIA_ACCESS_DENIED")
        try:
            payload = response.json()
        except ValueError as exc:
            raise GenerationContractError("SIGNED_URL_RESPONSE_INVALID") from exc
        signed = payload.get("signedURL") or payload.get("signedUrl")
        if not isinstance(signed, str) or not signed:
            raise GenerationContractError("SIGNED_URL_RESPONSE_INVALID")
        if signed.startswith(("http://", "https://")):
            return signed
        return (
            f"{self.client.config.url.rstrip('/')}/storage/v1/"
            f"{signed.lstrip('/')}"
        )

    def download_processed(
        self,
        context: GenerationContext,
        destination: Path,
        *,
        maximum_bytes: int,
    ) -> None:
        url = self._signed_processed_url(context)
        try:
            with self.client._session.get(
                url,
                stream=True,
                timeout=self.client.config.timeout_seconds,
            ) as response:
                if response.status_code >= 500 or response.status_code == 429:
                    raise GenerationDependencyError(
                        "PROCESSED_MEDIA_DOWNLOAD_UNAVAILABLE"
                    )
                if response.status_code >= 400:
                    raise GenerationContractError(
                        "PROCESSED_MEDIA_DOWNLOAD_DENIED"
                    )
                received = 0
                with destination.open("wb") as output:
                    for chunk in response.iter_content(64 * 1024):
                        if not chunk:
                            continue
                        received += len(chunk)
                        if received > maximum_bytes:
                            raise GenerationContractError(
                                "PROCESSED_MEDIA_TOO_LARGE"
                            )
                        output.write(chunk)
        except (requests.Timeout, requests.ConnectionError, OSError) as exc:
            destination.unlink(missing_ok=True)
            raise GenerationDependencyError(
                "PROCESSED_MEDIA_DOWNLOAD_UNAVAILABLE"
            ) from exc
        except Exception:
            destination.unlink(missing_ok=True)
            raise
        if not destination.is_file() or destination.stat().st_size == 0:
            raise GenerationContractError("PROCESSED_MEDIA_EMPTY")

    def upload_generated(
        self,
        context: GenerationContext,
        *,
        storage_path: str,
        local_path: Path,
        content_type: str,
    ) -> None:
        if storage_path not in {
            context.instagram_media_path,
            context.facebook_media_path,
        }:
            raise GenerationContractError("GENERATED_OUTPUT_PATH_MISMATCH")
        if content_type not in {"image/jpeg", "video/mp4"}:
            raise GenerationContractError("GENERATED_CONTENT_TYPE_INVALID")
        try:
            self.client.upload_storage_object(
                self.bucket,
                storage_path,
                data=local_path.read_bytes(),
                content_type=content_type,
                upsert=True,
            )
        except OSError as exc:
            raise GenerationDependencyError(
                "GENERATED_ASSET_UPLOAD_UNAVAILABLE"
            ) from exc
        except Exception as exc:
            raise GenerationDependencyError(
                "GENERATED_ASSET_UPLOAD_UNAVAILABLE"
            ) from exc

    def complete_generation(
        self,
        claim: GenerationClaim,
        assets: GeneratedAssets,
    ) -> dict[str, Any]:
        result = self._scalar(
            self._rpc(
                "complete_wing_generation",
                {
                    "p_generation_job_id": str(claim.job_id),
                    "p_claim_token": str(claim.claim_token),
                    "p_instagram_post_type": assets.instagram_post_type,
                    "p_instagram_caption": assets.instagram_caption,
                    "p_facebook_post_type": assets.facebook_post_type,
                    "p_facebook_caption": assets.facebook_caption,
                    "p_metadata": assets.metadata,
                },
            )
        )
        if not isinstance(result, dict):
            raise GenerationContractError(
                "GENERATION_COMPLETION_RESPONSE_INVALID"
            )
        return result

    def fail_generation(
        self,
        claim: GenerationClaim,
        *,
        retryable: bool,
        error_code: str,
        error_reason: str,
    ) -> dict[str, Any]:
        result = self._scalar(
            self._rpc(
                "fail_wing_generation_job",
                {
                    "p_job_id": str(claim.job_id),
                    "p_claim_token": str(claim.claim_token),
                    "p_retryable": retryable,
                    "p_error_code": error_code[:100],
                    "p_error_reason": error_reason[:1000],
                },
            )
        )
        if not isinstance(result, dict):
            raise GenerationContractError(
                "GENERATION_FAILURE_RESPONSE_INVALID"
            )
        return result
