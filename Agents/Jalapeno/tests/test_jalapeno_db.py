from __future__ import annotations

from datetime import datetime, timezone
from io import StringIO
from pathlib import Path
from dataclasses import replace
from uuid import UUID, uuid4

import pytest

PROJECT_DIR = Path(__file__).resolve().parents[1]

import sys

if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from config import initialize_logging, load_configuration  # noqa: E402
from jalapeno_db import (  # noqa: E402
    POST_CANDIDATE_SCHEMA_COLUMNS_SET,
    JalapenoRunContext,
    build_post_candidate_payload,
    ensure_selected_post_candidate,
    format_post_candidate_schema_mismatch,
    missing_post_candidate_columns,
)
from supabase_client import SupabaseError  # noqa: E402


class _SchemaClient:
    def __init__(self, columns: set[str]) -> None:
        self.columns = columns

    def table_columns(self, table_name: str) -> set[str]:
        assert table_name == "jalapeno_post_candidates"
        return self.columns


class _PersistenceClient:
    def __init__(self, *, raise_on_candidate_insert: bool = True) -> None:
        self.runs: dict[str, dict[str, object]] = {}
        self.candidates: dict[str, dict[str, object]] = {}
        self.inserted_payloads: list[dict[str, object]] = []
        self.raise_on_candidate_insert = raise_on_candidate_insert

    def fetch_rows(self, table_name: str, *, filters=None, select: str = "*") -> list[dict[str, object]]:
        filters = filters or {}
        if table_name == "jalapeno_runs":
            run_id = str(filters.get("run_id", "")).removeprefix("eq.")
            row = self.runs.get(run_id)
            return [row] if row is not None else []
        if table_name == "jalapeno_post_candidates":
            candidate_id = str(filters.get("id", "")).removeprefix("eq.")
            row = self.candidates.get(candidate_id)
            return [row] if row is not None else []
        return []

    def insert_row(self, table_name: str, payload):
        row = dict(payload)
        if table_name == "jalapeno_runs":
            self.runs[str(row["run_id"])] = row
            return [row]
        if table_name == "jalapeno_post_candidates":
            self.inserted_payloads.append(row)
            if self.raise_on_candidate_insert:
                raise SupabaseError("Could not find the 'copy_source' column of 'jalapeno_post_candidates'")
            self.candidates[str(row["id"])] = row
            return [row]
        raise AssertionError(f"Unexpected table insert: {table_name}")

    def update_rows(self, table_name: str, filters, payload):
        row = dict(payload)
        if table_name == "jalapeno_runs":
            run_id = str(filters.get("run_id", "")).removeprefix("eq.")
            current = dict(self.runs.get(run_id, {"run_id": run_id}))
            current.update(row)
            self.runs[run_id] = current
            return [current]
        if table_name == "jalapeno_post_candidates":
            candidate_id = str(filters.get("id", "")).removeprefix("eq.")
            current = dict(self.candidates.get(candidate_id, {"id": candidate_id}))
            current.update(row)
            self.candidates[candidate_id] = current
            return [current]
        return [row]


def test_build_post_candidate_payload_normalizes_contract_fields() -> None:
    run_id = uuid4()
    candidate_id = uuid4()
    publish_caption = "Send this to someone who owes you wings.\n\n#Buffago #WingNight"
    payload = build_post_candidate_payload(
        run_id=run_id,
        candidate_id=candidate_id,
        candidate_number=7,
        post_type="buffago_post",
        idea="Wing night debate",
        reasoning="Highest scoring candidate.",
        caption=publish_caption,
        hashtags=["#Buffago", " #WingNight ", ""],
        image_prompt="Hero plate of wings",
        image_storage_path="assets/wings.png",
        image_url="https://example.com/wings.png",
        raw_text_prompt={"topic": "wings"},
        raw_image_prompt={},
        raw_ai_response={"variants": []},
        engagement_prediction=9.5,
        uniqueness_score=7.25,
        brand_alignment_score=8.5,
        humor_score=2.0,
        quality_score=94.0,
        duplicate_score=1.0,
        overall_score=92.0,
        selected=True,
        caption_options=[{"caption": publish_caption}],
        overlay_options=[{"overlay_text": "SEND THIS TO YOUR WING CREW"}],
        selected_overlay="SEND THIS TO YOUR WING CREW",
        ranking_reason="highest score",
        ranking_score=92.0,
        ranking_breakdown={"score": 92.0},
        openai_used=True,
        openai_model="gpt-4.1-mini",
        fallback_reason=None,
        feedback_summary_version="feedback-v1",
        feedback_summary={"summary": "ok"},
        caption_text=publish_caption,
        copy_source="openai",
        generated_at=datetime(2026, 1, 1, 12, 30, tzinfo=timezone.utc),
    )

    assert set(payload).issubset(POST_CANDIDATE_SCHEMA_COLUMNS_SET)
    assert payload["run_id"] == str(run_id)
    assert payload["id"] == str(candidate_id)
    assert payload["hashtags"] == ["#Buffago", "#WingNight"]
    assert payload["raw_text_prompt"] == {"topic": "wings"}
    assert payload["raw_image_prompt"] == {}
    assert payload["raw_ai_response"] == {"variants": []}
    assert payload["caption_options"] == [{"caption": publish_caption}]
    assert payload["overlay_options"] == [{"overlay_text": "SEND THIS TO YOUR WING CREW"}]
    assert payload["selected_caption"] == "Send this to someone who owes you wings."
    assert payload["selected_overlay"] == "SEND THIS TO YOUR WING CREW"
    assert payload["caption_text"] == publish_caption
    assert payload["caption"] == publish_caption
    assert payload["generated_at"] == "2026-01-01T12:30:00+00:00"
    assert "created_at" not in payload
    assert "updated_at" not in payload
    assert "selected" in payload
    assert payload["openai_used"] is True


def test_build_post_candidate_payload_omits_defaulted_json_and_boolean_fields() -> None:
    payload = build_post_candidate_payload(
        run_id=uuid4(),
        caption="Send this to someone who owes you wings.",
        hashtags=["#Buffago", "#WingNight"],
    )

    assert "raw_text_prompt" not in payload
    assert "raw_image_prompt" not in payload
    assert "raw_ai_response" not in payload
    assert "caption_options" not in payload
    assert "overlay_options" not in payload
    assert "selected" not in payload
    assert "openai_used" not in payload


def test_missing_post_candidate_columns_reports_every_missing_column() -> None:
    client = _SchemaClient({"run_id", "caption", "selected", "created_at"})

    missing = missing_post_candidate_columns(client)  # type: ignore[arg-type]

    assert missing == sorted(POST_CANDIDATE_SCHEMA_COLUMNS_SET - {"run_id", "caption", "selected", "created_at"})
    assert format_post_candidate_schema_mismatch(["copy_source", "generated_at"]) == (
        "jalapeno_post_candidates schema mismatch. Missing columns: copy_source, generated_at"
    )


def test_ensure_selected_post_candidate_logs_insert_schema_failure() -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    stream = StringIO()
    run_dir = PROJECT_DIR / "tmp" / f"jalapeno-db-test-{uuid4().hex}"
    run_dir.mkdir(parents=True, exist_ok=True)
    logger = initialize_logging(replace(config, log_directory=run_dir / "logs"), stream=stream)
    client = _PersistenceClient()
    run_context = JalapenoRunContext(run_id=UUID("11111111-1111-1111-1111-111111111111"), dry_run=False)

    with pytest.raises(SupabaseError, match="copy_source"):
        ensure_selected_post_candidate(
            client,  # type: ignore[arg-type]
            run_context=run_context,
            winner_payload={
                "candidate_id": "22222222-2222-2222-2222-222222222222",
                "content_type": "restaurant_spotlight",
                "scheduled_post_type": "buffago_post",
                "caption": "Send this to someone who owes you wings. #Buffago #WingNight",
                "hashtags": ["#Buffago", "#WingNight"],
                "image_prompt": "Hero plate of wings",
                "overlay_text": "SEND THIS TO YOUR WING CREW",
                "copy_source": "openai",
                "generated_at": "2026-01-01T12:30:00+00:00",
            },
            decision_summary={"winner_reasoning": ["best candidate"]},
            logger=logger,
        )

    output = stream.getvalue()
    assert "candidate_persistence_failed" in output
    assert "table=jalapeno_post_candidates" in output
    assert "operation=insert" in output
    assert "missing_column=copy_source" in output
    assert "payload_keys=" in output


def test_ensure_selected_post_candidate_persists_video_fields_with_caption_contract() -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    stream = StringIO()
    run_dir = PROJECT_DIR / "tmp" / f"jalapeno-db-test-{uuid4().hex}"
    run_dir.mkdir(parents=True, exist_ok=True)
    logger = initialize_logging(replace(config, log_directory=run_dir / "logs"), stream=stream)
    client = _PersistenceClient(raise_on_candidate_insert=False)
    run_context = JalapenoRunContext(run_id=UUID("11111111-1111-1111-1111-111111111111"), dry_run=False)

    row = ensure_selected_post_candidate(
        client,  # type: ignore[arg-type]
        run_context=run_context,
        winner_payload={
            "candidate_id": "22222222-2222-2222-2222-222222222222",
            "content_type": "daily_wing_reel",
            "scheduled_post_type": "daily_wing_reel",
            "caption": "Vote on the last wing.\n\n#Buffago #BuffaloWings #WingNight #ChickenWings #WingLovers",
            "hashtags": ["#Buffago", "#BuffaloWings", "#WingNight", "#ChickenWings", "#WingLovers"],
            "image_prompt": "Preloaded video asset",
            "overlay_text": "WHO GETS THE LAST WING? VOTE.",
            "copy_source": "template",
            "generated_at": "2026-01-01T12:30:00+00:00",
            "selected_overlay": "WHO GETS THE LAST WING? VOTE.",
        },
        decision_summary={"winner_reasoning": ["video candidate"]},
        logger=logger,
    )

    persisted = client.candidates["22222222-2222-2222-2222-222222222222"]
    assert row["selected"] is True
    assert persisted["caption_text"] == "Vote on the last wing.\n\n#Buffago #BuffaloWings #WingNight #ChickenWings #WingLovers"
    assert persisted["selected_overlay"] == "WHO GETS THE LAST WING? VOTE."
    assert persisted["copy_source"] == "template"
    assert persisted["generated_at"] == "2026-01-01T12:30:00+00:00"
    assert persisted["selected_caption"] == "Vote on the last wing."
    assert persisted["hashtags"] == ["#Buffago", "#BuffaloWings", "#WingNight", "#ChickenWings", "#WingLovers"]
