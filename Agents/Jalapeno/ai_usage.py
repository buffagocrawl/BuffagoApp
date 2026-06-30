from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ai_config import AIConfig, ModelPricing


@dataclass(frozen=True, slots=True)
class AIUsageRecord:
    request_type: str
    model: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost_usd: float | None
    backend_used: bool
    used_fallback: bool
    prompt_name: str | None = None
    prompt_version: str | None = None
    content_slot: str | None = None
    content_category: str | None = None
    chosen_cta: str | None = None
    chosen_hashtags: list[str] | None = None
    image_generation_prompt: str | None = None
    review_score: float | None = None
    rejected_reason: str | None = None
    input_size_chars: int | None = None
    output_size_chars: int | None = None
    generation_time_ms: int | None = None


def _get_pricing(ai_config: AIConfig, model_name: str) -> ModelPricing | None:
    return ai_config.pricing.get(model_name)


def estimate_cost_usd(ai_config: AIConfig, model_name: str, *, input_tokens: int, output_tokens: int) -> float | None:
    pricing = _get_pricing(ai_config, model_name)
    if pricing is None:
        return None
    if pricing.input_cost_per_million_usd is None or pricing.output_cost_per_million_usd is None:
        return None
    if input_tokens < 0 or output_tokens < 0:
        return None
    input_cost = (input_tokens / 1_000_000.0) * pricing.input_cost_per_million_usd
    output_cost = (output_tokens / 1_000_000.0) * pricing.output_cost_per_million_usd
    return round(input_cost + output_cost, 6)


def build_usage_record(
    ai_config: AIConfig,
    *,
    request_type: str,
    model: str,
    prompt_name: str | None = None,
    prompt_version: str | None = None,
    content_slot: str | None = None,
    content_category: str | None = None,
    chosen_cta: str | None = None,
    chosen_hashtags: list[str] | None = None,
    image_generation_prompt: str | None = None,
    review_score: float | None = None,
    rejected_reason: str | None = None,
    input_size_chars: int | None = None,
    output_size_chars: int | None = None,
    generation_time_ms: int | None = None,
    input_tokens: int = 0,
    output_tokens: int = 0,
    total_tokens: int = 0,
    backend_used: bool,
    used_fallback: bool,
) -> AIUsageRecord:
    estimated_cost_usd = estimate_cost_usd(
        ai_config,
        model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )
    return AIUsageRecord(
        request_type=request_type,
        model=model,
        prompt_name=prompt_name,
        prompt_version=prompt_version,
        content_slot=content_slot,
        content_category=content_category,
        chosen_cta=chosen_cta,
        chosen_hashtags=chosen_hashtags,
        image_generation_prompt=image_generation_prompt,
        review_score=review_score,
        rejected_reason=rejected_reason,
        input_size_chars=input_size_chars,
        output_size_chars=output_size_chars,
        generation_time_ms=generation_time_ms,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        estimated_cost_usd=estimated_cost_usd,
        backend_used=backend_used,
        used_fallback=used_fallback,
    )


def summarize_usage(records: list[AIUsageRecord]) -> dict[str, Any]:
    totals = {
        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "estimated_cost_usd": 0.0,
    }
    estimated_cost_available = True
    for record in records:
        totals["input_tokens"] += record.input_tokens
        totals["output_tokens"] += record.output_tokens
        totals["total_tokens"] += record.total_tokens
        if record.estimated_cost_usd is None:
            estimated_cost_available = False
        else:
            totals["estimated_cost_usd"] += record.estimated_cost_usd

    return {
        "totals": {
            "input_tokens": totals["input_tokens"],
            "output_tokens": totals["output_tokens"],
            "total_tokens": totals["total_tokens"],
            "estimated_cost_usd": round(totals["estimated_cost_usd"], 6) if estimated_cost_available else None,
        },
        "records": [
            {
                "request_type": record.request_type,
                "model": record.model,
                "prompt_name": record.prompt_name,
                "prompt_version": record.prompt_version,
                "content_slot": record.content_slot,
                "content_category": record.content_category,
                "chosen_cta": record.chosen_cta,
                "chosen_hashtags": record.chosen_hashtags,
                "image_generation_prompt": record.image_generation_prompt,
                "review_score": record.review_score,
                "rejected_reason": record.rejected_reason,
                "input_size_chars": record.input_size_chars,
                "output_size_chars": record.output_size_chars,
                "generation_time_ms": record.generation_time_ms,
                "input_tokens": record.input_tokens,
                "output_tokens": record.output_tokens,
                "total_tokens": record.total_tokens,
                "estimated_cost_usd": record.estimated_cost_usd,
                "backend_used": record.backend_used,
                "used_fallback": record.used_fallback,
            }
            for record in records
        ],
    }


def write_usage_summary(path: Path, *, run_id: str, records: list[AIUsageRecord]) -> dict[str, Any]:
    summary = summarize_usage(records)
    payload = {
        "run_id": run_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        **summary,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True, default=str)
        handle.write("\n")
    return payload
