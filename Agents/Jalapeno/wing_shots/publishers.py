from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Any, Callable, Protocol

from .models import Platform, PublishAttempt, PublishResult, SocialJob


TOKEN_ERROR_CODES = {190}
PERMISSION_ERROR_CODES = {10, 200, 294}
RATE_LIMIT_ERROR_CODES = {4, 17, 32, 613}
TRANSIENT_ERROR_CODES = {1, 2, 341}
SAFE_FAILURE_LIMIT = 300
MAX_RECEIPT_ATTEMPTS = 12


@dataclass(frozen=True, slots=True)
class MetaConfig:
    account_id: str = ""
    access_token: str = ""
    api_version: str = ""
    enabled: bool = False
    dry_run: bool = True
    max_attempts: int = 3
    retry_base_seconds: float = 1.0
    request_timeout_seconds: float = 30.0
    container_poll_attempts: int = 8
    container_poll_seconds: float = 2.0


@dataclass(frozen=True, slots=True)
class HttpResponse:
    status_code: int
    payload: dict[str, Any]
    headers: dict[str, str]


class HttpTransport(Protocol):
    def request(
        self,
        method: str,
        url: str,
        *,
        data: dict[str, Any],
        timeout: float,
    ) -> HttpResponse: ...


class RequestsTransport:
    def request(
        self,
        method: str,
        url: str,
        *,
        data: dict[str, Any],
        timeout: float,
    ) -> HttpResponse:
        import requests

        response = requests.request(method, url, data=data, timeout=timeout)
        try:
            payload = response.json() if response.content else {}
        except ValueError:
            payload = {}
        return HttpResponse(
            status_code=response.status_code,
            payload=payload if isinstance(payload, dict) else {},
            headers={str(k): str(v) for k, v in response.headers.items()},
        )


@dataclass(frozen=True, slots=True)
class _CallResult:
    payload: dict[str, Any] | None
    attempts: tuple[PublishAttempt, ...]
    failure_code: str | None = None
    failure_reason: str | None = None


def _safe_reason(value: Any) -> str:
    text = str(value or "Meta request failed")
    text = re.sub(r"https?://\S+", "[redacted-url]", text)
    text = re.sub(
        r"(?i)(access[_ -]?token|authorization|secret)\s*[:=]\s*\S+",
        r"\1=[redacted]",
        text,
    )
    return text[:SAFE_FAILURE_LIMIT]


def _provider_error(response: HttpResponse) -> tuple[int | None, str, str | None]:
    error = response.payload.get("error")
    if not isinstance(error, dict):
        return None, _safe_reason(f"Meta HTTP {response.status_code}"), None
    code = error.get("code")
    try:
        parsed_code = int(code) if code is not None else None
    except (TypeError, ValueError):
        parsed_code = None
    return (
        parsed_code,
        _safe_reason(error.get("message")),
        str(error.get("fbtrace_id")) if error.get("fbtrace_id") else None,
    )


class MetaPublisher:
    platform: Platform

    def __init__(
        self,
        config: MetaConfig,
        *,
        transport: HttpTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.config = config
        self.transport = transport or RequestsTransport()
        self.sleep = sleep

    @property
    def base_url(self) -> str:
        return f"https://graph.facebook.com/{self.config.api_version}"

    def _configuration_error(self, job: SocialJob) -> PublishResult | None:
        if not self.config.enabled:
            return PublishResult(
                platform=self.platform,
                job_id=job.job_id,
                status="failed",
                failure_code="platform_disabled",
                failure_reason=f"{self.platform.value} publishing is disabled",
            )
        missing: list[str] = []
        if not self.config.account_id:
            missing.append("account_id")
        if not self.config.access_token:
            missing.append("access_token")
        if not re.fullmatch(r"v[0-9]{2,3}\.[0-9]+", self.config.api_version):
            missing.append("api_version")
        if not job.ingestion_url:
            missing.append("ingestion_url")
        if missing:
            return PublishResult(
                platform=self.platform,
                job_id=job.job_id,
                status="failed",
                failure_code="configuration_error",
                failure_reason="Missing live publish configuration: " + ", ".join(missing),
            )
        return None

    def _call(
        self,
        method: str,
        path: str,
        *,
        data: dict[str, Any],
        starting_attempt: int,
    ) -> _CallResult:
        attempts: list[PublishAttempt] = []
        request_data = {
            **data,
            "access_token": self.config.access_token,
        }
        remaining_budget = max(0, MAX_RECEIPT_ATTEMPTS - starting_attempt + 1)
        attempt_budget = min(max(1, self.config.max_attempts), remaining_budget)
        if attempt_budget == 0:
            return _CallResult(
                payload=None,
                attempts=(),
                failure_code="retry_exhausted",
                failure_reason="Meta request receipt budget exhausted",
            )
        for offset in range(attempt_budget):
            attempt_number = starting_attempt + offset
            try:
                response = self.transport.request(
                    method,
                    f"{self.base_url}/{path.lstrip('/')}",
                    data=request_data,
                    timeout=self.config.request_timeout_seconds,
                )
            except Exception as exc:
                retryable = offset + 1 < attempt_budget
                attempts.append(
                    PublishAttempt(
                        attempt_number=attempt_number,
                        outcome=(
                            "retryable_failure" if retryable else "permanent_failure"
                        ),
                        failure_code="transport_error",
                        retryable=retryable,
                    )
                )
                if not retryable:
                    return _CallResult(
                        payload=None,
                        attempts=tuple(attempts),
                        failure_code="transport_error",
                        failure_reason=_safe_reason(type(exc).__name__),
                    )
                self.sleep(self.config.retry_base_seconds * (2**offset))
                continue

            if 200 <= response.status_code < 300 and not response.payload.get("error"):
                attempts.append(
                    PublishAttempt(
                        attempt_number=attempt_number,
                        outcome="succeeded",
                        http_status=response.status_code,
                        provider_request_id=response.headers.get("x-fb-request-id"),
                    )
                )
                return _CallResult(
                    payload=response.payload,
                    attempts=tuple(attempts),
                )

            code, reason, trace_id = _provider_error(response)
            if code in TOKEN_ERROR_CODES:
                failure_code = "token_expired_or_invalid"
                retryable = False
            elif code in PERMISSION_ERROR_CODES:
                failure_code = "permission_denied"
                retryable = False
            elif code in RATE_LIMIT_ERROR_CODES or response.status_code == 429:
                failure_code = "rate_limited"
                retryable = offset + 1 < attempt_budget
            elif (
                code in TRANSIENT_ERROR_CODES
                or response.status_code >= 500
                or response.status_code in {408, 409, 425}
            ):
                failure_code = "provider_transient"
                retryable = offset + 1 < attempt_budget
            else:
                failure_code = "provider_rejected"
                retryable = False
            retry_after_raw = response.headers.get("retry-after")
            try:
                retry_after = (
                    max(0.0, float(retry_after_raw))
                    if retry_after_raw is not None
                    else None
                )
            except ValueError:
                retry_after = None
            attempts.append(
                PublishAttempt(
                    attempt_number=attempt_number,
                    outcome=(
                        "rate_limited"
                        if failure_code == "rate_limited"
                        else (
                            "retryable_failure"
                            if retryable
                            else "permanent_failure"
                        )
                    ),
                    http_status=response.status_code,
                    failure_code=failure_code,
                    retryable=retryable,
                    retry_after_seconds=retry_after,
                    provider_request_id=(
                        response.headers.get("x-fb-request-id") or trace_id
                    ),
                )
            )
            if not retryable:
                return _CallResult(
                    payload=None,
                    attempts=tuple(attempts),
                    failure_code=failure_code,
                    failure_reason=reason,
                )
            self.sleep(
                retry_after
                if retry_after is not None
                else self.config.retry_base_seconds * (2**offset)
            )
        return _CallResult(
            payload=None,
            attempts=tuple(attempts),
            failure_code="retry_exhausted",
            failure_reason="Meta retry budget exhausted",
        )

    def _dry_run_or_reconcile(self, job: SocialJob) -> PublishResult | None:
        if job.external_post_id:
            return PublishResult(
                platform=self.platform,
                job_id=job.job_id,
                status="posted",
                external_post_id=job.external_post_id,
                external_permalink=job.external_permalink,
                container_id=job.container_id,
                reconciled=True,
            )
        if job.dry_run or self.config.dry_run:
            return PublishResult(
                platform=self.platform,
                job_id=job.job_id,
                status="dry_run_succeeded",
                attempts=(
                    PublishAttempt(
                        attempt_number=max(1, job.attempt_count + 1),
                        outcome="dry_run_succeeded",
                    ),
                ),
            )
        return None

    def publish(self, job: SocialJob) -> PublishResult:
        raise NotImplementedError


class InstagramPublisher(MetaPublisher):
    platform = Platform.INSTAGRAM

    def publish(self, job: SocialJob) -> PublishResult:
        early = self._dry_run_or_reconcile(job)
        if early:
            return early
        invalid = self._configuration_error(job)
        if invalid:
            return invalid
        attempts: list[PublishAttempt] = []
        next_attempt = max(1, job.attempt_count + 1)
        container_id = job.container_id

        if not container_id:
            creation_data: dict[str, Any] = {
                "caption": job.generated_caption,
                "client_mutation_id": job.idempotency_key,
            }
            if job.media_type == "video":
                creation_data.update(
                    {"media_type": "REELS", "video_url": job.ingestion_url}
                )
            else:
                creation_data["image_url"] = job.ingestion_url
                if job.generated_alt_text:
                    creation_data["alt_text"] = job.generated_alt_text
            created = self._call(
                "POST",
                f"{self.config.account_id}/media",
                data=creation_data,
                starting_attempt=next_attempt,
            )
            attempts.extend(created.attempts)
            if created.payload is None or not created.payload.get("id"):
                return PublishResult(
                    platform=self.platform,
                    job_id=job.job_id,
                    status="failed",
                    failure_code=created.failure_code or "container_creation_failed",
                    failure_reason=created.failure_reason,
                    attempts=tuple(attempts),
                )
            container_id = str(created.payload["id"])
            next_attempt += len(created.attempts)

        ready = False
        for _ in range(max(1, self.config.container_poll_attempts)):
            if next_attempt > MAX_RECEIPT_ATTEMPTS:
                break
            polled = self._call(
                "GET",
                container_id,
                data={"fields": "status_code"},
                starting_attempt=next_attempt,
            )
            attempts.extend(polled.attempts)
            next_attempt += len(polled.attempts)
            if polled.payload is None:
                return PublishResult(
                    platform=self.platform,
                    job_id=job.job_id,
                    status="failed",
                    container_id=container_id,
                    failure_code=polled.failure_code or "container_status_failed",
                    failure_reason=polled.failure_reason,
                    attempts=tuple(attempts),
                )
            status_code = str(polled.payload.get("status_code") or "").upper()
            if status_code == "FINISHED":
                ready = True
                break
            if status_code in {"ERROR", "EXPIRED"}:
                return PublishResult(
                    platform=self.platform,
                    job_id=job.job_id,
                    status="failed",
                    container_id=container_id,
                    failure_code=f"container_{status_code.lower()}",
                    failure_reason=f"Instagram container reached {status_code}",
                    attempts=tuple(attempts),
                )
            self.sleep(self.config.container_poll_seconds)
        if not ready:
            return PublishResult(
                platform=self.platform,
                job_id=job.job_id,
                status="failed",
                container_id=container_id,
                failure_code="container_timeout",
                failure_reason="Instagram container did not become ready",
                attempts=tuple(attempts),
            )

        published = self._call(
            "POST",
            f"{self.config.account_id}/media_publish",
            data={
                "creation_id": container_id,
                "client_mutation_id": job.idempotency_key,
            },
            starting_attempt=next_attempt,
        )
        attempts.extend(published.attempts)
        if published.payload is None or not published.payload.get("id"):
            return PublishResult(
                platform=self.platform,
                job_id=job.job_id,
                status="failed",
                container_id=container_id,
                failure_code=published.failure_code or "publish_failed",
                failure_reason=published.failure_reason,
                attempts=tuple(attempts),
            )
        return PublishResult(
            platform=self.platform,
            job_id=job.job_id,
            status="posted",
            container_id=container_id,
            external_post_id=str(published.payload["id"]),
            attempts=tuple(attempts),
        )


class FacebookPublisher(MetaPublisher):
    platform = Platform.FACEBOOK

    def publish(self, job: SocialJob) -> PublishResult:
        early = self._dry_run_or_reconcile(job)
        if early:
            return early
        invalid = self._configuration_error(job)
        if invalid:
            return invalid
        if job.media_type == "video":
            path = f"{self.config.account_id}/videos"
            data = {
                "file_url": job.ingestion_url,
                "description": job.generated_caption,
                "published": "true",
                "client_mutation_id": job.idempotency_key,
            }
        else:
            path = f"{self.config.account_id}/photos"
            data = {
                "url": job.ingestion_url,
                "caption": job.generated_caption,
                "published": "true",
                "client_mutation_id": job.idempotency_key,
            }
            if job.generated_alt_text:
                data["alt_text_custom"] = job.generated_alt_text
        published = self._call(
            "POST",
            path,
            data=data,
            starting_attempt=max(1, job.attempt_count + 1),
        )
        external_id = (
            published.payload.get("post_id") or published.payload.get("id")
            if published.payload
            else None
        )
        if not external_id:
            return PublishResult(
                platform=self.platform,
                job_id=job.job_id,
                status="failed",
                failure_code=published.failure_code or "publish_failed",
                failure_reason=published.failure_reason,
                attempts=published.attempts,
            )
        return PublishResult(
            platform=self.platform,
            job_id=job.job_id,
            status="posted",
            external_post_id=str(external_id),
            attempts=published.attempts,
        )
