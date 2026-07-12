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
    output: Any
    usage: dict[str, Any]
    fallback_used: bool
    fallback_reason: str | None
    status_code: int | None = None
    request_id: str | None = None
    latency_ms: int = 0
    error_category: str | None = None
    retryable: bool = False
    raw_content: str | None = None
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

    @staticmethod
    def _sanitize_error(message: str, *, limit: int = 400) -> str:
        cleaned = " ".join(str(message or "").replace("\r", " ").replace("\n", " ").split())
        cleaned = cleaned.replace(os.getenv("OPENAI_API_KEY", "").strip(), "[redacted-openai-key]") if os.getenv("OPENAI_API_KEY", "").strip() else cleaned
        if len(cleaned) <= limit:
            return cleaned
        return f"{cleaned[:limit]}..."

    def _strip_code_fences(self, text: str) -> str:
        stripped = text.strip()
        if not stripped.startswith("```"):
            return stripped
        lines = stripped.splitlines()
        if len(lines) >= 2 and lines[0].startswith("```"):
            if lines[-1].strip().startswith("```"):
                body = "\n".join(lines[1:-1]).strip()
                if body:
                    return body
        return stripped

    def _extract_json_fragment(self, text: str) -> str | None:
        start_index: int | None = None
        stack: list[str] = []
        in_string = False
        escape = False
        pairs = {"{": "}", "[": "]"}
        closers = {"}": "{", "]": "["}
        for index, char in enumerate(text):
            if start_index is None:
                if char in pairs:
                    start_index = index
                    stack.append(char)
                continue
            if in_string:
                if escape:
                    escape = False
                elif char == "\\":
                    escape = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
                continue
            if char in pairs:
                stack.append(char)
                continue
            if char in closers:
                if not stack or stack[-1] != closers[char]:
                    start_index = None
                    stack = []
                    continue
                stack.pop()
                if not stack and start_index is not None:
                    return text[start_index : index + 1]
        return None

    def _parse_json_text(self, text: str) -> Any:
        cleaned = self._strip_code_fences(text)
        for candidate in (cleaned, cleaned.strip()):
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                pass
        fragment = self._extract_json_fragment(cleaned)
        if fragment is not None:
            return json.loads(fragment)
        raise ValueError("OpenAI response content did not contain valid JSON")

    def _chat_completions(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        stage: str,
        options_count: int,
        response_format: dict[str, Any] | None = None,
    ) -> OpenAIContentResult:
        started_at = time.perf_counter()
        log_event(
            self.logger,
            "openai_request_started",
            stage=stage,
            model=self.model,
            options_count=options_count,
        )
        payload: dict[str, Any] = {
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": self.max_output_tokens,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        if response_format is not None:
            payload["response_format"] = response_format
        try:
            response = self._session.post(
                OPENAI_CHAT_COMPLETIONS_URL,
                headers=self._headers(),
                json=payload,
                timeout=self.timeout_seconds,
            )
            request_id = response.headers.get("x-request-id") or response.headers.get("request-id")
            if response.status_code >= 400:
                message = self._sanitize_error(response.text.strip() or response.reason)
                if response.status_code == 401:
                    category = "invalid_api_key"
                    retryable = False
                elif response.status_code == 429:
                    category = "rate_limit"
                    retryable = True
                elif response.status_code >= 500:
                    category = "server_error"
                    retryable = True
                elif response.status_code == 400:
                    category = "invalid_request"
                    retryable = False
                elif response.status_code == 404:
                    category = "unsupported_model"
                    retryable = False
                else:
                    category = "http_error"
                    retryable = False
                raise RuntimeError(f"{category}: OpenAI request failed ({response.status_code}): {message}")
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
                "openai_request_succeeded",
                stage=stage,
                model=self.model,
                options_count=options_count,
                duration_ms=duration_ms,
                total_tokens=normalized_usage["total_tokens"],
                request_id=request_id,
            )
            return OpenAIContentResult(
                success=True,
                model=self.model,
                output=output,
                usage=normalized_usage,
                fallback_used=False,
                fallback_reason=None,
                status_code=response.status_code,
                request_id=request_id,
                latency_ms=duration_ms,
                error_category=None,
                retryable=False,
                raw_content=content,
                error=None,
            )
        except Exception as exc:
            duration_ms = int((time.perf_counter() - started_at) * 1000)
            error_text = self._sanitize_error(str(exc))
            lowered = error_text.lower()
            status_code = None
            request_id = None
            retryable = False
            error_category = "unknown_error"
            if "openai request failed (" in lowered:
                status_match = None
                try:
                    status_match = int(lowered.split("openai request failed (", 1)[1].split(")", 1)[0])
                except Exception:
                    status_match = None
                status_code = status_match
            if "invalid_api_key:" in lowered:
                error_category = "invalid_api_key"
            elif "rate_limit:" in lowered:
                error_category = "rate_limit"
                retryable = True
            elif "server_error:" in lowered:
                error_category = "server_error"
                retryable = True
            elif "invalid_request:" in lowered:
                error_category = "invalid_request"
            elif "unsupported_model:" in lowered:
                error_category = "unsupported_model"
            elif "did not contain valid json" in lowered:
                error_category = "malformed_json"
                retryable = True
            elif "missing choices" in lowered or "missing message content" in lowered or "was not a json object" in lowered:
                error_category = "invalid_response"
                retryable = True
            elif "timed out" in lowered or "timeout" in lowered:
                error_category = "timeout"
                retryable = True
            elif "connection" in lowered or "max retries exceeded" in lowered:
                error_category = "connection_error"
                retryable = True
            log_event(
                self.logger,
                "openai_request_failed",
                level="warning",
                stage=stage,
                model=self.model,
                options_count=options_count,
                duration_ms=duration_ms,
                error=error_text,
                error_category=error_category,
                retryable=retryable,
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
                fallback_reason=error_text,
                status_code=status_code,
                request_id=request_id,
                latency_ms=duration_ms,
                error_category=error_category,
                retryable=retryable,
                raw_content=None,
                error=error_text,
            )

    def generate_variant_set(
        self,
        *,
        stage: str,
        system_prompt: str,
        user_prompt: str,
        options_count: int,
        response_format: dict[str, Any] | None = None,
    ) -> OpenAIContentResult:
        return self._chat_completions(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            stage=stage,
            options_count=options_count,
            response_format=response_format,
        )
