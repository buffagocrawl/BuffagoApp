from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass
from typing import Any

import requests

from caption_rules import CAPTION_STYLE_ORDER, choose_caption_style, finalize_caption, style_guidance, validate_caption
from ai_config import AIConfig, load_ai_config
from ai_prompts import DEFAULT_BRAND_RULES, PROMPT_LIBRARY_VERSION, load_prompt_bundle
from ai_schemas import (
    SchemaValidationError,
    fallback_brand_validation_output,
    fallback_image_output,
    fallback_text_output,
    normalize_brand_validation_output,
    normalize_image_output,
    normalize_text_output,
    sanitize_for_ai,
)
from logging_utils import log_event
from model_router import AIRunContext, ModelRoutingDecision, get_text_model
from prompt_library_loader import PromptLibraryError


RETRIABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}


@dataclass(frozen=True, slots=True)
class AIRequestResult:
    success: bool
    request_type: str
    schema_version: str
    model: str
    output: dict[str, Any]
    usage: dict[str, Any]
    safety: dict[str, Any]
    errors: list[str]
    backend_available: bool
    used_fallback: bool
    raw_response: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class AIBackendError(RuntimeError):
    pass


class JalapenoAIClient:
    def __init__(
        self,
        ai_config: AIConfig | None = None,
        *,
        logger=None,
        session: requests.Session | None = None,
    ) -> None:
        self.config = ai_config or load_ai_config()
        self.logger = logger
        self._session = session or requests.Session()

    @property
    def backend_available(self) -> bool:
        return bool(self.config.function_url and self.config.function_token)

    def _headers(self) -> dict[str, str]:
        token = self.config.function_token or ""
        return {
            "Authorization": f"Bearer {token}",
            "apikey": token,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _invoke_backend(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.backend_available:
            raise AIBackendError("Supabase AI backend is not configured")

        assert self.config.function_url is not None
        last_error: str | None = None
        for attempt in range(1, self.config.retry_count + 1):
            log_event(
                self.logger,
                "ai_backend_request_started",
                request_type=payload.get("request_type"),
                run_id=payload.get("run_id"),
                attempt=attempt,
                function_name=self.config.function_name,
            )
            try:
                response = self._session.post(
                    self.config.function_url,
                    json=payload,
                    headers=self._headers(),
                    timeout=self.config.timeout_seconds,
                )
                if response.status_code >= 400:
                    message = response.text.strip() or response.reason
                    if response.status_code in RETRIABLE_STATUS_CODES and attempt < self.config.retry_count:
                        last_error = f"HTTP {response.status_code}: {message}"
                        log_event(
                            self.logger,
                            "ai_backend_request_failed",
                            level="warning",
                            request_type=payload.get("request_type"),
                            run_id=payload.get("run_id"),
                            attempt=attempt,
                            status_code=response.status_code,
                            message=message,
                            retrying=True,
                        )
                        time.sleep(self.config.retry_backoff_seconds * attempt)
                        continue
                    raise AIBackendError(f"AI backend failed ({response.status_code}): {message}")

                data = response.json()
                if not isinstance(data, dict):
                    raise AIBackendError("AI backend returned an invalid payload")

                log_event(
                    self.logger,
                    "ai_backend_request_success",
                    request_type=payload.get("request_type"),
                    run_id=payload.get("run_id"),
                    attempt=attempt,
                    status_code=response.status_code,
                )
                return data
            except (requests.RequestException, ValueError) as exc:
                last_error = str(exc)
                if attempt < self.config.retry_count:
                    log_event(
                        self.logger,
                        "ai_backend_request_failed",
                        level="warning",
                        request_type=payload.get("request_type"),
                        run_id=payload.get("run_id"),
                        attempt=attempt,
                        message=last_error,
                        retrying=True,
                    )
                    time.sleep(self.config.retry_backoff_seconds * attempt)
                    continue
                break
            except AIBackendError as exc:
                last_error = str(exc)
                break

        raise AIBackendError(last_error or "AI backend request failed")

    def _build_payload(
        self,
        *,
        request_type: str,
        selected_text_model: str,
        selected_image_model: str,
        routing_reason: str,
        run_context: AIRunContext,
        agent_name: str,
        run_id: str,
        internal_snapshot: dict[str, Any],
        external_context: dict[str, Any],
        content_slot: str,
        output_schema_version: str,
        brand_rules: dict[str, Any] | None = None,
        selected_caption_style: str | None = None,
    ) -> dict[str, Any]:
        prompt_name = "buffago_post"
        if request_type == "image_prompt":
            prompt_name = "image_generation"
        elif request_type == "brand_validation":
            prompt_name = "quality_review"
        elif content_slot == "meme_post":
            prompt_name = "meme"

        payload = {
            "request_type": request_type,
            "agent_name": agent_name,
            "run_id": run_id,
            "internal_snapshot": sanitize_for_ai(internal_snapshot),
            "external_context": sanitize_for_ai(external_context),
            "content_slot": content_slot,
            "brand_rules": sanitize_for_ai(brand_rules or DEFAULT_BRAND_RULES),
            "output_schema_version": output_schema_version,
            "prompt_library_version": PROMPT_LIBRARY_VERSION,
            "prompt_name": prompt_name,
            "prompt_library": load_prompt_bundle(),
            "selected_text_model": selected_text_model,
            "selected_image_model": selected_image_model,
            "routing_reason": routing_reason,
            "run_context": run_context.to_payload(),
        }
        if request_type == "text_content" and selected_caption_style:
            payload["caption_style_system"] = {
                "selected_caption_style": selected_caption_style,
                "selected_caption_style_guidance": style_guidance(selected_caption_style),
                "allowed_caption_styles": list(CAPTION_STYLE_ORDER),
                "caption_rules_summary": [
                    "Do not be clever.",
                    "Do not use internet slang.",
                    "Do not personify wings, plates, photos, or posts.",
                    "Do not use metaphor joke formats or surreal AI jokes.",
                    "Write one simple shareable wing caption.",
                    "Prefer tag, send, comment, debate, challenge, or plan-making prompts.",
                    "Keep under 120 characters when possible.",
                    "Mention or clearly imply wings, wing night, sauce, flats/drums, cravings, friends, group chat, or someone owing wings.",
                    "Caption and image text must feel like one post.",
                ],
            }
        return payload

    def _response_usage(self, response: dict[str, Any]) -> dict[str, Any]:
        usage = response.get("usage")
        if isinstance(usage, dict):
            return {
                "input_tokens": int(usage.get("input_tokens") or 0),
                "output_tokens": int(usage.get("output_tokens") or 0),
                "total_tokens": int(usage.get("total_tokens") or 0),
                "estimated_cost_usd": usage.get("estimated_cost_usd"),
            }
        return {
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "estimated_cost_usd": None,
        }

    def _response_safety(self, response: dict[str, Any]) -> dict[str, Any]:
        safety = response.get("safety")
        if isinstance(safety, dict):
            normalized = dict(safety)
            if not isinstance(normalized.get("passed"), bool):
                normalized["passed"] = bool(normalized.get("passed", False))
            if not isinstance(normalized.get("reasons"), list):
                normalized["reasons"] = [str(normalized.get("reasons"))]
            if not isinstance(normalized.get("risk_level"), str):
                normalized["risk_level"] = "high"
            if "notes" not in normalized or not isinstance(normalized.get("notes"), list):
                normalized["notes"] = []
            return normalized
        return {"passed": False, "reasons": ["Missing safety response"], "risk_level": "high", "notes": []}

    def _response_output(self, response: dict[str, Any]) -> dict[str, Any]:
        output = response.get("output")
        if isinstance(output, dict):
            return output
        raise AIBackendError("AI backend response did not include a structured output object")

    def _wrap_result(
        self,
        *,
        request_type: str,
        schema_version: str,
        model: str,
        output: dict[str, Any],
        usage: dict[str, Any],
        safety: dict[str, Any],
        errors: list[str],
        backend_available: bool,
        used_fallback: bool,
        raw_response: dict[str, Any] | None = None,
    ) -> AIRequestResult:
        return AIRequestResult(
            success=not errors and bool(safety.get("passed", True)),
            request_type=request_type,
            schema_version=schema_version,
            model=model,
            output=output,
            usage=usage,
            safety=safety,
            errors=errors,
            backend_available=backend_available,
            used_fallback=used_fallback,
            raw_response=raw_response,
        )

    def _fallback_result(
        self,
        *,
        request_type: str,
        schema_version: str,
        model: str,
        content_slot: str,
        internal_snapshot: dict[str, Any],
        external_context: dict[str, Any],
        errors: list[str],
        run_id: str | None = None,
        selected_caption_style: str | None = None,
    ) -> AIRequestResult:
        if request_type == "image_prompt":
            output = fallback_image_output(
                content_slot=content_slot,
                internal_snapshot=internal_snapshot,
                external_context=external_context,
            )
        elif request_type == "brand_validation":
            output = fallback_brand_validation_output(
                request_type=request_type,
                content_slot=content_slot,
            )
        else:
            output = fallback_text_output(
                content_slot=content_slot,
                internal_snapshot=internal_snapshot,
                external_context=external_context,
                forced_style=selected_caption_style,
            )

        usage = {
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "estimated_cost_usd": None,
        }
        safety = {"passed": True, "reasons": ["Fallback output used"], "risk_level": "low", "notes": []}
        if errors:
            log_event(
                self.logger,
                "ai_generation_failed",
                level="error",
                request_type=request_type,
                model=model,
                content_slot=content_slot,
                run_id=run_id,
                message=errors[0],
            )
        log_event(self.logger, "ai_fallback_used", request_type=request_type, model=model, content_slot=content_slot, run_id=run_id)
        return self._wrap_result(
            request_type=request_type,
            schema_version=schema_version,
            model=model,
            output=output,
            usage=usage,
            safety=safety,
            errors=errors,
            backend_available=self.backend_available,
            used_fallback=True,
        )

    def _request(
        self,
        *,
        request_type: str,
        routing_decision: ModelRoutingDecision,
        run_context: AIRunContext,
        content_slot: str,
        agent_name: str,
        run_id: str,
        internal_snapshot: dict[str, Any],
        external_context: dict[str, Any],
        output_schema_version: str,
        brand_rules: dict[str, Any] | None = None,
    ) -> AIRequestResult:
        try:
            selected_caption_style = None
            if request_type == "text_content":
                source_summary = external_context.get("source_summary") if isinstance(external_context.get("source_summary"), dict) else {}
                raw_signals = source_summary.get("signals_used") if isinstance(source_summary, dict) else []
                signals = [str(signal).strip() for signal in raw_signals] if isinstance(raw_signals, list) else []
                selected_caption_style = choose_caption_style(seed=f"{run_id}:{content_slot}:{':'.join(signals) or 'fallback_context'}")
            payload = self._build_payload(
                request_type=request_type,
                selected_text_model=routing_decision.text_model,
                selected_image_model=routing_decision.image_model,
                routing_reason=routing_decision.routing_reason,
                run_context=run_context,
                agent_name=agent_name,
                run_id=run_id,
                internal_snapshot=internal_snapshot,
                external_context=external_context,
                content_slot=content_slot,
                output_schema_version=output_schema_version,
                brand_rules=brand_rules,
                selected_caption_style=selected_caption_style,
            )
        except PromptLibraryError as exc:
            return self._fallback_result(
                request_type=request_type,
                schema_version=output_schema_version,
                model=routing_decision.text_model,
                content_slot=content_slot,
                internal_snapshot=internal_snapshot,
                external_context=external_context,
                errors=[str(exc)],
                run_id=run_id,
                selected_caption_style=selected_caption_style,
            )
        input_size_chars = len(json.dumps(payload, default=str))
        prompt_name = str(payload.get("prompt_name") or request_type)
        prompt_version = str(payload.get("prompt_library_version") or PROMPT_LIBRARY_VERSION)
        started_at = time.perf_counter()
        log_event(
            self.logger,
            "model_selected",
            request_type=request_type,
            content_slot=content_slot,
            selected_text_model=routing_decision.text_model,
            selected_image_model=routing_decision.image_model,
            routing_reason=routing_decision.routing_reason,
            **run_context.to_log_fields(),
        )
        log_event(
            self.logger,
            "ai_prompt_execution_started",
            request_type=request_type,
            prompt_name=prompt_name,
            prompt_version=prompt_version,
            model=routing_decision.text_model,
            content_slot=content_slot,
            input_size_chars=input_size_chars,
            prompt_files=len(payload.get("prompt_library", {})),
        )
        try:
            response = self._invoke_backend(payload)
            success = bool(response.get("success", False))
            if not success:
                raise AIBackendError("; ".join(response.get("errors", []) or ["AI backend returned success=false"]))
            response_model = str(response.get("model") or routing_decision.text_model)
            output = self._response_output(response)
            if request_type == "text_content":
                output = normalize_text_output(output)
                caption_plan = finalize_caption(
                    seed=f"{run_id}:{content_slot}:{selected_caption_style or 'caption'}",
                    style=selected_caption_style,
                    raw_caption=output["caption"],
                    allowed_styles=[selected_caption_style] if selected_caption_style else None,
                    allow_openai_caption=True,
                )
                output["caption"] = caption_plan["caption"]
                output["selected_caption_style"] = caption_plan["selected_caption_style"]
                output["caption_source"] = caption_plan["caption_source"]
                output["caption_length"] = caption_plan["validation"]["caption_length"]
                output["validation_passed"] = caption_plan["validation_passed"]
                output["validation_failure_reason"] = caption_plan["validation_failure_reason"]
                output["fallback_used"] = caption_plan["fallback_used"]
                output["banned_phrase_detected"] = any(
                    issue.startswith("banned_phrase:") for issue in caption_plan["validation"].get("issues", [])
                )
            elif request_type == "image_prompt":
                output = normalize_image_output(output)
            else:
                output = normalize_brand_validation_output(output)
            usage = self._response_usage(response)
            safety = self._response_safety(response)
            generation_time_ms = int((time.perf_counter() - started_at) * 1000)
            output_size_chars = len(json.dumps(output, default=str))
            chosen_hashtags = output.get("hashtags") if isinstance(output.get("hashtags"), list) else None
            chosen_cta = output.get("cta") if isinstance(output.get("cta"), str) else None
            image_generation_prompt = output.get("image_prompt") if isinstance(output.get("image_prompt"), str) else None
            content_category = output.get("post_type") if isinstance(output.get("post_type"), str) else content_slot
            caption_length = output.get("caption_length") if isinstance(output.get("caption_length"), int) else None
            validation_passed = output.get("validation_passed") if isinstance(output.get("validation_passed"), bool) else None
            banned_phrase_detected = output.get("banned_phrase_detected") if isinstance(output.get("banned_phrase_detected"), bool) else None
            logged_caption_style = output.get("selected_caption_style") if isinstance(output.get("selected_caption_style"), str) else selected_caption_style
            caption_source = output.get("caption_source") if isinstance(output.get("caption_source"), str) else None
            validation_failure_reason = output.get("validation_failure_reason") if isinstance(output.get("validation_failure_reason"), str) else None
            generated_caption = output.get("caption") if isinstance(output.get("caption"), str) else None
            fallback_used = bool(output.get("fallback_used")) if "fallback_used" in output else False
            review_score = 100.0 if safety.get("passed", False) else 0.0
            rejected_reason = None if safety.get("passed", False) else "; ".join(safety.get("reasons", []) or [])
            log_event(
                self.logger,
                "ai_prompt_execution_completed",
                request_type=request_type,
                prompt_name=prompt_name,
                prompt_version=prompt_version,
                model=response_model,
                content_slot=content_slot,
                content_category=content_category,
                generation_time_ms=generation_time_ms,
                input_size_chars=input_size_chars,
                output_size_chars=output_size_chars,
                estimated_tokens=usage.get("total_tokens", 0),
                estimated_cost_usd=usage.get("estimated_cost_usd"),
                review_score=review_score,
                rejected_reason=rejected_reason,
                chosen_cta=chosen_cta,
                chosen_hashtags=chosen_hashtags,
                image_generation_prompt=image_generation_prompt,
                generated_caption=generated_caption,
                selected_caption_style=logged_caption_style,
                caption_source=caption_source,
                caption_length=caption_length,
                validation_passed=validation_passed,
                validation_failure_reason=validation_failure_reason,
                fallback_used=fallback_used,
                banned_phrase_detected=banned_phrase_detected,
            )
            log_event(
                self.logger,
                f"ai_{request_type}_success",
                model=response_model,
                run_id=run_id,
                content_slot=content_slot,
                selected_caption_style=logged_caption_style,
                caption_source=caption_source,
                generated_caption=generated_caption,
                caption_length=caption_length,
                validation_passed=validation_passed,
                validation_failure_reason=validation_failure_reason,
                fallback_used=fallback_used,
                banned_phrase_detected=banned_phrase_detected,
            )
            return self._wrap_result(
                request_type=request_type,
                schema_version=output_schema_version,
                model=response_model,
                output=output,
                usage=usage,
                safety=safety,
                errors=[],
                backend_available=True,
                used_fallback=fallback_used,
                raw_response=response,
            )
        except (SchemaValidationError, AIBackendError, ValueError, TypeError) as exc:
            errors = [str(exc)]
            fallback_result = self._fallback_result(
                request_type=request_type,
                schema_version=output_schema_version,
                model=routing_decision.text_model,
                content_slot=content_slot,
                internal_snapshot=internal_snapshot,
                external_context=external_context,
                errors=errors,
                run_id=run_id,
                selected_caption_style=selected_caption_style,
            )
            generation_time_ms = int((time.perf_counter() - started_at) * 1000)
            fallback_output = fallback_result.output
            fallback_caption_validation = (
                validate_caption(fallback_output.get("caption", ""))
                if request_type == "text_content" and isinstance(fallback_output.get("caption"), str)
                else None
            )
            if fallback_caption_validation is not None:
                fallback_output["caption"] = fallback_caption_validation["normalized_caption"]
                fallback_output["caption_length"] = fallback_caption_validation["caption_length"]
                fallback_output["validation_passed"] = fallback_caption_validation["passed"]
                fallback_output["selected_caption_style"] = (
                    fallback_output.get("selected_caption_style")
                    if isinstance(fallback_output.get("selected_caption_style"), str)
                    else selected_caption_style
                )
                fallback_output["caption_source"] = "fallback"
                fallback_output["validation_failure_reason"] = ", ".join(fallback_caption_validation["reasons"]) if not fallback_caption_validation["passed"] else None
                fallback_output["fallback_used"] = True
            log_event(
                self.logger,
                "ai_prompt_execution_completed",
                request_type=request_type,
                prompt_name=prompt_name,
                prompt_version=prompt_version,
                model=routing_decision.text_model,
                content_slot=content_slot,
                content_category=fallback_output.get("post_type") if isinstance(fallback_output.get("post_type"), str) else content_slot,
                generation_time_ms=generation_time_ms,
                input_size_chars=input_size_chars,
                output_size_chars=len(json.dumps(fallback_output, default=str)),
                estimated_tokens=fallback_result.usage.get("total_tokens", 0),
                estimated_cost_usd=fallback_result.usage.get("estimated_cost_usd"),
                review_score=100.0 if fallback_result.safety.get("passed", False) else 0.0,
                rejected_reason=str(exc),
                chosen_cta=fallback_output.get("cta") if isinstance(fallback_output.get("cta"), str) else None,
                chosen_hashtags=fallback_output.get("hashtags") if isinstance(fallback_output.get("hashtags"), list) else None,
                image_generation_prompt=fallback_output.get("image_prompt") if isinstance(fallback_output.get("image_prompt"), str) else None,
                generated_caption=fallback_output.get("caption") if isinstance(fallback_output.get("caption"), str) else None,
                selected_caption_style=fallback_output.get("selected_caption_style") if isinstance(fallback_output.get("selected_caption_style"), str) else selected_caption_style,
                caption_source=fallback_output.get("caption_source") if isinstance(fallback_output.get("caption_source"), str) else "fallback",
                caption_length=fallback_output.get("caption_length") if isinstance(fallback_output.get("caption_length"), int) else None,
                validation_passed=fallback_output.get("validation_passed") if isinstance(fallback_output.get("validation_passed"), bool) else None,
                validation_failure_reason=fallback_output.get("validation_failure_reason") if isinstance(fallback_output.get("validation_failure_reason"), str) else None,
                fallback_used=True,
            )
            return fallback_result

    def generate_text_content(
        self,
        *,
        agent_name: str,
        run_id: str,
        internal_snapshot: dict[str, Any],
        external_context: dict[str, Any],
        content_slot: str,
        output_schema_version: str = "1.0",
        brand_rules: dict[str, Any] | None = None,
        run_context: AIRunContext | None = None,
    ) -> AIRequestResult:
        active_run_context = run_context or AIRunContext(
            execution_source="python_cli",
            environment="development",
            scheduled=False,
            dry_run=False,
            validation=False,
            test_mode=False,
            manual_dispatch=True,
            manual=True,
        )
        return self._request(
            request_type="text_content",
            routing_decision=get_text_model(self.config, active_run_context),
            run_context=active_run_context,
            content_slot=content_slot,
            agent_name=agent_name,
            run_id=run_id,
            internal_snapshot=internal_snapshot,
            external_context=external_context,
            output_schema_version=output_schema_version,
            brand_rules=brand_rules,
        )

    def generate_image_prompt(
        self,
        *,
        agent_name: str,
        run_id: str,
        internal_snapshot: dict[str, Any],
        external_context: dict[str, Any],
        content_slot: str,
        output_schema_version: str = "1.0",
        brand_rules: dict[str, Any] | None = None,
        run_context: AIRunContext | None = None,
    ) -> AIRequestResult:
        active_run_context = run_context or AIRunContext(
            execution_source="python_cli",
            environment="development",
            scheduled=False,
            dry_run=False,
            validation=False,
            test_mode=False,
            manual_dispatch=True,
            manual=True,
        )
        return self._request(
            request_type="image_prompt",
            routing_decision=get_text_model(self.config, active_run_context),
            run_context=active_run_context,
            content_slot=content_slot,
            agent_name=agent_name,
            run_id=run_id,
            internal_snapshot=internal_snapshot,
            external_context=external_context,
            output_schema_version=output_schema_version,
            brand_rules=brand_rules,
        )

    def validate_brand(
        self,
        *,
        agent_name: str,
        run_id: str,
        internal_snapshot: dict[str, Any],
        external_context: dict[str, Any],
        content_slot: str,
        output_schema_version: str = "1.0",
        brand_rules: dict[str, Any] | None = None,
        run_context: AIRunContext | None = None,
    ) -> AIRequestResult:
        active_run_context = run_context or AIRunContext(
            execution_source="python_cli",
            environment="development",
            scheduled=False,
            dry_run=False,
            validation=False,
            test_mode=False,
            manual_dispatch=True,
            manual=True,
        )
        return self._request(
            request_type="brand_validation",
            routing_decision=get_text_model(self.config, active_run_context),
            run_context=active_run_context,
            content_slot=content_slot,
            agent_name=agent_name,
            run_id=run_id,
            internal_snapshot=internal_snapshot,
            external_context=external_context,
            output_schema_version=output_schema_version,
            brand_rules=brand_rules,
        )
