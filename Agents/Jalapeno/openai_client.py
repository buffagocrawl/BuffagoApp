from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Any

import requests

from logging_utils import log_event


OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"


@dataclass(frozen=True, slots=True)
class OpenAIContentResult:
    success: bool
    model: str
    output: dict[str, Any]
    usage: dict[str, Any]
    fallback_used: bool
    fallback_reason: str | None
    error: str | None = None


class OpenAIContentClient:
    def __init__(
        self,
        api_key: str,
        *,
        model: str,
        timeout_seconds: float = 75.0,
        temperature: float = 0.7,
        max_output_tokens: int = 1200,
        logger=None,
        session: requests.Session | None = None,
    ) -> None:
        self.api_key = api_key.strip()
        self.model = model.strip()
        self.timeout_seconds = timeout_seconds
        self.temperature = temperature
        self.max_output_tokens = max_output_tokens
        self.logger = logger
        self._session = session or requests.Session()

    @classmethod
    def from_env(
        cls,
        *,
        logger=None,
        timeout_seconds: float = 75.0,
        temperature: float = 0.7,
        max_output_tokens: int = 1200,
    ) -> OpenAIContentClient | None:
        api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
        model = (os.getenv("OPENAI_MODEL") or "").strip() or "gpt-4.1-mini"
        if not api_key:
            return None
        return cls(
            api_key,
            model=model,
            timeout_seconds=timeout_seconds,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            logger=logger,
        )

    @property
    def configured(self) -> bool:
        return bool(self.api_key and self.model)

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _parse_json_text(self, text: str) -> dict[str, Any]:
        payload = json.loads(text)
        if not isinstance(payload, dict):
            raise ValueError("OpenAI response content was not a JSON object")
        return payload

    def _chat_completions(self, *, system_prompt: str, user_prompt: str, stage: str, options_count: int) -> OpenAIContentResult:
        started_at = time.perf_counter()
        log_event(
            self.logger,
            "openai_generation_started",
            stage=stage,
            model=self.model,
            options_count=options_count,
        )
        payload = {
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": self.max_output_tokens,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        try:
            response = self._session.post(
                OPENAI_CHAT_COMPLETIONS_URL,
                headers=self._headers(),
                json=payload,
                timeout=self.timeout_seconds,
            )
            if response.status_code >= 400:
                message = response.text.strip() or response.reason
                raise RuntimeError(f"OpenAI request failed ({response.status_code}): {message}")
            data = response.json()
            if not isinstance(data, dict):
                raise ValueError("OpenAI response was not a JSON object")
            choices = data.get("choices")
            if not isinstance(choices, list) or not choices:
                raise ValueError("OpenAI response missing choices")
            message = choices[0].get("message") if isinstance(choices[0], dict) else None
            content = message.get("content") if isinstance(message, dict) else None
            if not isinstance(content, str) or not content.strip():
                raise ValueError("OpenAI response missing message content")
            output = self._parse_json_text(content)
            usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
            normalized_usage = {
                "input_tokens": int(usage.get("prompt_tokens") or 0),
                "output_tokens": int(usage.get("completion_tokens") or 0),
                "total_tokens": int(usage.get("total_tokens") or 0),
                "estimated_cost_usd": None,
            }
            duration_ms = int((time.perf_counter() - started_at) * 1000)
            log_event(
                self.logger,
                "openai_generation_completed",
                stage=stage,
                model=self.model,
                options_count=options_count,
                duration_ms=duration_ms,
                total_tokens=normalized_usage["total_tokens"],
            )
            return OpenAIContentResult(
                success=True,
                model=self.model,
                output=output,
                usage=normalized_usage,
                fallback_used=False,
                fallback_reason=None,
                error=None,
            )
        except Exception as exc:
            duration_ms = int((time.perf_counter() - started_at) * 1000)
            log_event(
                self.logger,
                "openai_generation_failed",
                level="warning",
                stage=stage,
                model=self.model,
                options_count=options_count,
                duration_ms=duration_ms,
                error=str(exc),
            )
            return OpenAIContentResult(
                success=False,
                model=self.model,
                output={},
                usage={
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "total_tokens": 0,
                    "estimated_cost_usd": None,
                },
                fallback_used=True,
                fallback_reason=str(exc),
                error=str(exc),
            )

    def generate_variant_set(
        self,
        *,
        stage: str,
        system_prompt: str,
        user_prompt: str,
        options_count: int,
    ) -> OpenAIContentResult:
        return self._chat_completions(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            stage=stage,
            options_count=options_count,
        )
