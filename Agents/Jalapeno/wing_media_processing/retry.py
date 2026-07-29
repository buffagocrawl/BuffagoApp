"""Bounded retry/dead-letter state transitions for durable job workers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Generic, TypeVar

from .errors import PermanentMediaError, RetryableMediaError
from .models import RetryDecision, RetryPolicy

T = TypeVar("T")


@dataclass(frozen=True)
class AttemptResult(Generic[T]):
    decision: RetryDecision
    attempt_count: int
    value: T | None = None
    failure_code: str | None = None
    failure_reason: str | None = None


def run_attempt(
    operation: Callable[[], T],
    *,
    prior_attempt_count: int,
    policy: RetryPolicy,
) -> AttemptResult[T]:
    """Run one attempt; persistence and scheduling remain caller-owned."""
    if prior_attempt_count < 0:
        raise ValueError("prior_attempt_count cannot be negative")
    attempt_count = prior_attempt_count + 1
    try:
        return AttemptResult(
            decision=RetryDecision.COMPLETED,
            attempt_count=attempt_count,
            value=operation(),
        )
    except PermanentMediaError as exc:
        return AttemptResult(
            decision=RetryDecision.REJECTED,
            attempt_count=attempt_count,
            failure_code=type(exc).__name__,
            failure_reason=str(exc),
        )
    except RetryableMediaError as exc:
        exhausted = attempt_count >= policy.max_attempts
        return AttemptResult(
            decision=RetryDecision.DEAD_LETTER if exhausted else RetryDecision.RETRY,
            attempt_count=attempt_count,
            failure_code=type(exc).__name__,
            failure_reason=str(exc),
        )
