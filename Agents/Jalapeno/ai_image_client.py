from __future__ import annotations

from typing import Any

from ai_client import AIRequestResult, JalapenoAIClient
from ai_prompts import DEFAULT_BRAND_RULES
from model_router import AIRunContext


class JalapenoImageClient:
    def __init__(self, client: JalapenoAIClient | None = None) -> None:
        self.client = client or JalapenoAIClient()

    def generate(
        self,
        *,
        agent_name: str,
        run_id: str,
        internal_snapshot: dict[str, Any],
        external_context: dict[str, Any],
        content_slot: str = "meme_post",
        output_schema_version: str = "1.0",
        brand_rules: dict[str, Any] | None = None,
        run_context: AIRunContext | None = None,
    ) -> AIRequestResult:
        return self.client.generate_image_prompt(
            agent_name=agent_name,
            run_id=run_id,
            internal_snapshot=internal_snapshot,
            external_context=external_context,
            content_slot=content_slot,
            output_schema_version=output_schema_version,
            brand_rules=brand_rules or DEFAULT_BRAND_RULES,
            run_context=run_context,
        )
