from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

from logging_utils import log_event


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True, slots=True)
class ContainerStatusResult:
    container_id: str
    status: str
    attempts: int
    ready: bool
    timed_out: bool
    duration_ms: int
    last_response: dict[str, Any] | None = None
    error: str | None = None


def wait_for_container_ready(
    client,
    *,
    container_id: str,
    max_attempts: int,
    wait_seconds: int,
    timeout_seconds: int,
    logger=None,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> ContainerStatusResult:
    started_at = time.perf_counter()
    log_event(
        logger,
        "container_status_check_started",
        container_id=container_id,
        status="started",
        attempts=0,
    )
    last_response: dict[str, Any] | None = None
    last_status = "UNKNOWN"
    for attempt in range(1, max_attempts + 1):
        if (time.perf_counter() - started_at) >= timeout_seconds:
            duration_ms = int((time.perf_counter() - started_at) * 1000)
            log_event(
                logger,
                "container_status_timeout",
                container_id=container_id,
                status="timeout",
                attempts=attempt - 1,
                duration_ms=duration_ms,
            )
            return ContainerStatusResult(
                container_id=container_id,
                status=last_status,
                attempts=attempt - 1,
                ready=False,
                timed_out=True,
                duration_ms=duration_ms,
                last_response=last_response,
                error="Container status polling timed out",
            )
        last_response = client.get_container_status(container_id)
        last_status = str(last_response.get("status_code") or last_response.get("status") or "UNKNOWN").upper()
        duration_ms = int((time.perf_counter() - started_at) * 1000)
        log_event(
            logger,
            "container_status_checked",
            container_id=container_id,
            status=last_status,
            attempts=attempt,
            duration_ms=duration_ms,
        )
        if last_status == "FINISHED":
            log_event(
                logger,
                "container_status_ready",
                container_id=container_id,
                status=last_status,
                attempts=attempt,
                duration_ms=duration_ms,
            )
            return ContainerStatusResult(
                container_id=container_id,
                status=last_status,
                attempts=attempt,
                ready=True,
                timed_out=False,
                duration_ms=duration_ms,
                last_response=last_response,
            )
        if last_status in {"ERROR", "EXPIRED"}:
            log_event(
                logger,
                "container_status_failed",
                container_id=container_id,
                status=last_status,
                attempts=attempt,
                duration_ms=duration_ms,
                error="Container became unavailable",
            )
            return ContainerStatusResult(
                container_id=container_id,
                status=last_status,
                attempts=attempt,
                ready=False,
                timed_out=False,
                duration_ms=duration_ms,
                last_response=last_response,
                error=f"Container status {last_status}",
            )
        sleep_fn(float(wait_seconds))
    duration_ms = int((time.perf_counter() - started_at) * 1000)
    log_event(
        logger,
        "container_status_timeout",
        container_id=container_id,
        status=last_status,
        attempts=max_attempts,
        duration_ms=duration_ms,
    )
    return ContainerStatusResult(
        container_id=container_id,
        status=last_status,
        attempts=max_attempts,
        ready=False,
        timed_out=True,
        duration_ms=duration_ms,
        last_response=last_response,
        error="Container did not reach FINISHED before the polling limit",
    )
