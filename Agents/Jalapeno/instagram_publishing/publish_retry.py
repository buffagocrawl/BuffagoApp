from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Callable, TypeVar

from logging_utils import log_event


T = TypeVar("T")


@dataclass(frozen=True, slots=True)
class RetrySettings:
    max_retries: int
    backoff_seconds: int
    retryable_error_codes: tuple[str, ...]


def is_retryable_error(error_code: str | None, retryable_error_codes: tuple[str, ...]) -> bool:
    if error_code is None:
        return False
    normalized = error_code.strip().upper()
    return normalized in {code.strip().upper() for code in retryable_error_codes}


def run_with_retries(
    operation: Callable[[int], T],
    *,
    settings: RetrySettings,
    logger=None,
    run_id: str,
    candidate_id: str,
    container_id: str | None = None,
    published_media_id: str | None = None,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> T:
    last_error: Exception | None = None
    total_attempts = settings.max_retries + 1
    for attempt in range(1, total_attempts + 1):
        if published_media_id:
            return operation(attempt)
        if attempt > 1:
            log_event(
                logger,
                "publish_retry_started",
                run_id=run_id,
                candidate_id=candidate_id,
                container_id=container_id,
                published_media_id=published_media_id,
                status="retrying",
                retry_count=attempt - 1,
                duration_ms=(attempt - 1) * settings.backoff_seconds * 1000,
            )
            sleep_fn(float(settings.backoff_seconds))
        try:
            result = operation(attempt)
            log_event(
                logger,
                "publish_retry_succeeded",
                run_id=run_id,
                candidate_id=candidate_id,
                container_id=container_id,
                published_media_id=published_media_id,
                status="succeeded",
                retry_count=attempt - 1,
            )
            return result
        except Exception as exc:  # pragma: no cover - retry coordination
            last_error = exc
            error_code = getattr(exc, "error_code", None) or getattr(exc, "code", None)
            if attempt > settings.max_retries or not is_retryable_error(str(error_code) if error_code is not None else None, settings.retryable_error_codes):
                log_event(
                    logger,
                    "publish_retry_failed",
                    level="error",
                    run_id=run_id,
                    candidate_id=candidate_id,
                    container_id=container_id,
                    published_media_id=published_media_id,
                    status="failed",
                    retry_count=attempt - 1,
                    error=str(exc),
                )
                raise
            log_event(
                logger,
                "publish_retry_scheduled",
                run_id=run_id,
                candidate_id=candidate_id,
                container_id=container_id,
                published_media_id=published_media_id,
                status="scheduled",
                retry_count=attempt - 1,
                error=str(exc),
            )
    if last_error is not None:
        raise last_error
    raise RuntimeError("Retry loop exited unexpectedly")
