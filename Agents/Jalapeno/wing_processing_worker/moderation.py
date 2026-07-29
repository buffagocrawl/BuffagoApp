"""Strict, pluggable advisory moderation without facial identification."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Protocol

import requests

from .errors import (
    ProviderContractError,
    ProviderRejectedRequest,
    ProviderTemporaryError,
)

BOOLEAN_FIELDS = (
    "contains_food",
    "contains_chicken_wings",
    "nudity_or_sexual_content",
    "graphic_content",
    "weapons",
    "hate_symbols",
    "illegal_activity",
    "intoxication_concern",
    "minors_visible",
    "personal_information_visible",
    "faces_visible",
    "alcohol_dominant",
    "offensive_text",
)
PROBABILITY_FIELDS = (
    "wing_confidence",
    "spam_probability",
    "duplicate_probability",
)
RECOMMENDATIONS = frozenset({"reject", "manual_review", "likely_acceptable"})
REQUIRED_FIELDS = frozenset(
    (
        *BOOLEAN_FIELDS,
        *PROBABILITY_FIELDS,
        "quality_score",
        "moderation_recommendation",
        "explanation",
        "model",
        "version",
        "evaluated_at",
    )
)


@dataclass(frozen=True, slots=True)
class ModerationResult:
    contains_food: bool
    contains_chicken_wings: bool
    wing_confidence: float
    nudity_or_sexual_content: bool
    graphic_content: bool
    weapons: bool
    hate_symbols: bool
    illegal_activity: bool
    intoxication_concern: bool
    minors_visible: bool
    personal_information_visible: bool
    faces_visible: bool
    alcohol_dominant: bool
    offensive_text: bool
    spam_probability: float
    duplicate_probability: float
    quality_score: float
    moderation_recommendation: str
    explanation: str
    model: str
    version: str
    evaluated_at: str

    @classmethod
    def from_mapping(cls, payload: Mapping[str, Any]) -> "ModerationResult":
        if set(payload) != REQUIRED_FIELDS:
            raise ProviderContractError()
        for field in BOOLEAN_FIELDS:
            if type(payload[field]) is not bool:
                raise ProviderContractError()
        for field in PROBABILITY_FIELDS:
            value = payload[field]
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ProviderContractError()
            if not 0 <= float(value) <= 1:
                raise ProviderContractError()
        quality = payload["quality_score"]
        if isinstance(quality, bool) or not isinstance(quality, (int, float)):
            raise ProviderContractError()
        if not 0 <= float(quality) <= 100:
            raise ProviderContractError()
        if payload["moderation_recommendation"] not in RECOMMENDATIONS:
            raise ProviderContractError()
        for field, maximum in (("explanation", 2000), ("model", 120), ("version", 80)):
            value = payload[field]
            if not isinstance(value, str) or not value.strip() or len(value) > maximum:
                raise ProviderContractError()
        evaluated_at = payload["evaluated_at"]
        if not isinstance(evaluated_at, str):
            raise ProviderContractError()
        try:
            parsed = datetime.fromisoformat(evaluated_at.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ProviderContractError() from exc
        if parsed.tzinfo is None:
            raise ProviderContractError()
        return cls(**{field: payload[field] for field in REQUIRED_FIELDS})

    def with_duplicate_probability(self, probability: float) -> "ModerationResult":
        return replace(
            self,
            duplicate_probability=max(
                self.duplicate_probability,
                min(1.0, max(0.0, probability)),
            ),
        )

    def database_payload(self) -> dict[str, Any]:
        return {
            field: getattr(self, field)
            for field in REQUIRED_FIELDS
        }


class ModerationProvider(Protocol):
    def evaluate(self, media_path: Path, *, media_type: str) -> ModerationResult: ...


class HttpModerationProvider:
    """Vendor-neutral multipart adapter for the Wing moderation JSON contract."""

    def __init__(
        self,
        *,
        endpoint: str,
        api_key: str,
        model: str,
        model_version: str,
        timeout_seconds: float = 30,
        session: requests.Session | None = None,
    ) -> None:
        if not endpoint.startswith("https://"):
            raise ValueError("moderation endpoint must use HTTPS")
        if not api_key or not model or not model_version:
            raise ValueError("moderation provider identity is required")
        if timeout_seconds < 3 or timeout_seconds > 60:
            raise ValueError("moderation timeout must be between 3 and 60 seconds")
        self.endpoint = endpoint
        self.api_key = api_key
        self.model = model
        self.model_version = model_version
        self.timeout_seconds = timeout_seconds
        self.session = session or requests.Session()

    def evaluate(self, media_path: Path, *, media_type: str) -> ModerationResult:
        mime = "image/jpeg" if media_type == "photo" else "video/mp4"
        try:
            with media_path.open("rb") as media:
                response = self.session.post(
                    self.endpoint,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Accept": "application/json",
                    },
                    data={
                        "schema_version": "1",
                        "model": self.model,
                        "model_version": self.model_version,
                        "prohibited_capability": "facial_identification",
                    },
                    files={"media": ("wing-shot", media, mime)},
                    timeout=self.timeout_seconds,
                )
        except (requests.Timeout, requests.ConnectionError) as exc:
            raise ProviderTemporaryError() from exc
        except OSError as exc:
            raise ProviderTemporaryError() from exc
        if response.status_code == 429 or response.status_code >= 500:
            raise ProviderTemporaryError()
        if response.status_code >= 400:
            raise ProviderRejectedRequest()
        if len(response.content) > 64 * 1024:
            raise ProviderContractError()
        try:
            payload = response.json()
        except (requests.JSONDecodeError, ValueError) as exc:
            raise ProviderContractError() from exc
        if not isinstance(payload, dict):
            raise ProviderContractError()
        return ModerationResult.from_mapping(payload)


class ManualReviewTestProvider:
    """No-key non-production adapter that can never recommend acceptance."""

    def evaluate(self, media_path: Path, *, media_type: str) -> ModerationResult:
        del media_path, media_type
        now = datetime.now(timezone.utc).isoformat()
        return ModerationResult.from_mapping(
            {
                "contains_food": False,
                "contains_chicken_wings": False,
                "wing_confidence": 0.5,
                "nudity_or_sexual_content": False,
                "graphic_content": False,
                "weapons": False,
                "hate_symbols": False,
                "illegal_activity": False,
                "intoxication_concern": False,
                "minors_visible": False,
                "personal_information_visible": False,
                "faces_visible": False,
                "alcohol_dominant": False,
                "offensive_text": False,
                "spam_probability": 0.5,
                "duplicate_probability": 0.5,
                "quality_score": 0.0,
                "moderation_recommendation": "manual_review",
                "explanation": "Non-production adapter; human review is required.",
                "model": "manual-review-test-adapter",
                "version": "1",
                "evaluated_at": now,
            }
        )
