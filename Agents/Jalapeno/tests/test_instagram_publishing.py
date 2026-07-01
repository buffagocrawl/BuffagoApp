from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path
from io import StringIO
import sys

import pytest

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

import instagram_publishing.instagram_publishing as publishing_module  # noqa: E402
from config import load_configuration, initialize_logging  # noqa: E402
from instagram_publishing.media_container import ApprovedInstagramPost  # noqa: E402
from instagram_publishing.publisher import precheck_approved_post, publish_instagram_post  # noqa: E402
from validation import validate_instagram_publishing_environment  # noqa: E402


def _sample_post() -> ApprovedInstagramPost:
    return ApprovedInstagramPost(
        run_id="11111111-1111-1111-1111-111111111111",
        candidate_id="22222222-2222-2222-2222-222222222222",
        caption="Buffago test caption",
        hashtags=["buffago", "wingnight"],
        alt_text="A test alt text",
        image_prompt="A test prompt",
        public_image_url="https://example.com/public-image.jpg",
        content_type="restaurant_spotlight",
        quality_score=95,
        image_source="real_ai",
        image_validation_status="passed",
        image_validation_reason=None,
        prompt_quality=100,
        approved=True,
        scheduled_post_type="buffago_post",
    )


def test_instagram_publishing_config_sections_load() -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")

    assert config.instagram.enabled is False
    assert config.instagram.dry_run is True
    assert config.instagram.api_version == "v23.0"
    assert config.instagram.quality_threshold == 85
    assert config.publishing.container_poll_max_attempts == 10
    assert config.notifications.enabled is True
    assert config.notifications.channels.console is True


def test_validation_mode_simulates_instagram_publish_without_live_calls(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("META_LONG_LIVED_ACCESS_TOKEN", "test-access-token")
    monkeypatch.setenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "test-ig-user-id")
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    stream = StringIO()
    logger = initialize_logging(replace(config, log_directory=tmp_path / "logs"), stream=stream)

    result = validate_instagram_publishing_environment(config, logger=logger, report_path=tmp_path / "publish_report.json")

    assert result.modules_imported is True
    assert result.config_keys_present is True
    assert result.secrets_resolved is True
    assert result.dry_run_blocked is True
    assert result.fake_precheck_passed is True
    assert result.fake_publish_succeeded is True
    assert result.retry_no_duplicate is True
    assert result.report_generated is True
    assert result.result["candidate_persistence_checked"] is True
    assert Path(result.report_path).exists()
    payload = json.loads(Path(result.report_path).read_text(encoding="utf-8"))
    assert payload["status"] in {"published", "published_with_permalink_pending"}
    assert payload["published_media_id"]
    log_output = stream.getvalue()
    assert "publish_pipeline_started" in log_output
    assert "publish_precheck_passed" in log_output
    assert "publish_succeeded" in log_output
    assert "publish_report_created" in log_output
    assert "candidate_persistence_started" in log_output
    assert "candidate_persistence_succeeded" in log_output
    assert "candidate_already_existed" in log_output


def test_precheck_blocks_dry_run() -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    post = _sample_post()

    result = precheck_approved_post(config, post, dry_run=True, test_mode=False)

    assert result.passed is False
    assert result.reason == "dry_run enabled"


def test_simulated_publish_reuses_existing_media_id(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("META_LONG_LIVED_ACCESS_TOKEN", "test-access-token")
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    config = replace(
        config,
        instagram=replace(config.instagram, enabled=True, dry_run=False),
        publishing=replace(config.publishing, publish_max_retries=1, retry_backoff_seconds=0),
    )
    post = _sample_post()

    first = publish_instagram_post(
        config,
        post,
        access_token="test-access-token",
        ig_user_id="test-ig-user-id",
        client=None,
        simulate=True,
        dry_run=False,
        test_mode=False,
        post_id="33333333-3333-3333-3333-333333333333",
        report_path=tmp_path / "report.json",
    )
    second_post = replace(
        post,
        container_id=first["container_id"],
        published_media_id=first["published_media_id"],
        permalink=first["permalink"],
    )
    second = publish_instagram_post(
        config,
        second_post,
        access_token="test-access-token",
        ig_user_id="test-ig-user-id",
        client=None,
        simulate=True,
        dry_run=False,
        test_mode=False,
        post_id="33333333-3333-3333-3333-333333333333",
        report_path=tmp_path / "report-second.json",
    )

    assert first["published_media_id"] == second["published_media_id"]
    assert second["status"] in {"published", "published_with_permalink_pending"}


class _PublishFlowSupabaseClient:
    def __init__(self) -> None:
        self.run_rows: dict[str, dict[str, object]] = {}
        self.candidate_rows: dict[str, dict[str, object]] = {}
        self.post_rows: list[dict[str, object]] = []
        self.instagram_post_rows: dict[str, dict[str, object]] = {}
        self.insert_order: list[str] = []

    def fetch_rows(self, table_name: str, *, filters=None, select: str = "*") -> list[dict[str, object]]:
        filters = filters or {}
        if table_name == "jalapeno_runs":
            run_id = str(filters.get("run_id", "")).removeprefix("eq.")
            row = self.run_rows.get(run_id)
            return [row] if row is not None else []
        if table_name == "jalapeno_post_candidates":
            candidate_id = str(filters.get("id", "")).removeprefix("eq.")
            row = self.candidate_rows.get(candidate_id)
            return [row] if row is not None else []
        if table_name == "jalapeno_posts":
            run_filter = str(filters.get("run_id", "")).removeprefix("eq.")
            candidate_filter = str(filters.get("candidate_id", "")).removeprefix("eq.")
            matches = [
                row for row in self.post_rows
                if str(row.get("run_id")) == run_filter and str(row.get("candidate_id")) == candidate_filter
            ]
            return matches[:1]
        return []

    def insert_row(self, table_name: str, payload):
        row = dict(payload) if isinstance(payload, dict) else dict(payload[0])
        self.insert_order.append(table_name)
        if table_name == "jalapeno_runs":
            self.run_rows[str(row["run_id"])] = row
        elif table_name == "jalapeno_post_candidates":
            self.candidate_rows[str(row["id"])] = row
        elif table_name == "jalapeno_posts":
            row.setdefault("id", "33333333-3333-3333-3333-333333333333")
            self.post_rows.append(row)
        return [row]

    def update_rows(self, table_name: str, filters, payload):
        if table_name == "jalapeno_post_candidates":
            candidate_id = str(filters.get("id", "")).removeprefix("eq.")
            current = dict(self.candidate_rows.get(candidate_id, {"id": candidate_id}))
            current.update(payload)
            self.candidate_rows[candidate_id] = current
            return [current]
        if table_name == "jalapeno_runs":
            run_id = str(filters.get("run_id", "")).removeprefix("eq.")
            current = dict(self.run_rows.get(run_id, {"run_id": run_id}))
            current.update(payload)
            self.run_rows[run_id] = current
            return [current]
        if table_name == "jalapeno_posts":
            post_id = str(filters.get("id", "")).removeprefix("eq.")
            for index, row in enumerate(self.post_rows):
                if str(row.get("id")) == post_id:
                    updated = dict(row)
                    updated.update(payload)
                    self.post_rows[index] = updated
                    return [updated]
            row = {"id": post_id, **payload}
            self.post_rows.append(row)
            return [row]
        return [dict(payload)]

    def upsert_rows(self, table_name: str, payload, on_conflict: str):
        row = dict(payload)
        if table_name == "jalapeno_instagram_posts":
            self.instagram_post_rows[str(row["run_id"])] = row
            return [row]
        return [row]


def test_live_publish_persists_missing_candidate_before_final_post_insert(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("META_LONG_LIVED_ACCESS_TOKEN", "test-access-token")
    monkeypatch.setenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "test-ig-user-id")
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    config = replace(config, instagram=replace(config.instagram, enabled=True, dry_run=False))
    client = _PublishFlowSupabaseClient()
    content_decision = {
        "run_id": "11111111-1111-1111-1111-111111111111",
        "scheduled_post_type": "buffago_post",
        "winner": {
            "candidate_id": "22222222-2222-2222-2222-222222222222",
            "content_type": "restaurant_spotlight",
            "caption": "Buffago test caption",
            "hashtags": ["buffago", "wingnight"],
            "image_prompt": "A hero plate of wings",
            "working_title": "Wing night pick",
        },
        "decision_summary": {
            "winner_reasoning": ["Best candidate for tonight"],
        },
    }
    image_pipeline = {
        "result": {
            "public_url": "https://example.com/public-image.jpg",
        }
    }

    def _fake_publish(*args, **kwargs):
        return {
            "status": "published",
            "container_id": "sim-container",
            "published_media_id": "sim-media",
            "permalink": "https://instagram.com/p/sim-media/",
        }

    monkeypatch.setattr(publishing_module, "publish_instagram_post", _fake_publish)
    result = publishing_module.run_instagram_publishing_live_environment(
        config,
        content_decision,
        image_pipeline,
        logger=None,
        client=client,
        report_path=tmp_path / "report.json",
    )

    assert result.result["status"] == "published"
    assert client.insert_order[:2] == ["jalapeno_runs", "jalapeno_post_candidates"]
    assert client.insert_order[2] == "jalapeno_posts"
    assert "22222222-2222-2222-2222-222222222222" in client.candidate_rows


def test_live_publish_auto_approves_when_content_decision_is_not_manually_approved(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("META_LONG_LIVED_ACCESS_TOKEN", "test-access-token")
    monkeypatch.setenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "test-ig-user-id")
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    config = replace(config, instagram=replace(config.instagram, enabled=True, dry_run=False))
    stream = StringIO()
    logger = initialize_logging(replace(config, log_directory=tmp_path / "logs"), stream=stream)

    content_decision = {
        "run_id": "11111111-1111-1111-1111-111111111111",
        "scheduled_post_type": "meme_post",
        "winner": {
            "candidate_id": "22222222-2222-2222-2222-222222222222",
            "content_type": "meme",
            "caption": "Buffago meme caption",
            "hashtags": ["buffago", "meme"],
            "image_prompt": "A buffalo wing meme",
            "approved": False,
        },
        "decision_summary": {
            "approved": False,
        },
    }
    image_pipeline = {
        "result": {
            "public_url": "https://example.com/meme-image.jpg",
        }
    }
    seen: dict[str, object] = {}

    def _fake_publish(config_arg, post, **kwargs):
        seen["approved"] = post.approved
        seen["metadata"] = dict(post.metadata)
        return {
            "status": "published",
            "container_id": "sim-container",
            "published_media_id": "sim-media",
            "permalink": "https://instagram.com/p/sim-media/",
        }

    monkeypatch.setattr(publishing_module, "publish_instagram_post", _fake_publish)
    result = publishing_module.run_instagram_publishing_live_environment(
        config,
        content_decision,
        image_pipeline,
        logger=logger,
        client=None,
        report_path=tmp_path / "report.json",
    )

    assert result.result["status"] == "published"
    assert seen["approved"] is True
    assert seen["metadata"] == {
        "approval_bypass_enabled": True,
        "approval_required": False,
        "approval_status": "auto_approved",
    }
    log_output = stream.getvalue()
    assert "publish_continuing_without_manual_approval" in log_output
    assert "approval_bypass_enabled=true" in log_output
    assert "approval_status=auto_approved" in log_output


def test_successful_publish_marks_approval_status_published(tmp_path: Path) -> None:
    config = load_configuration(env_path=PROJECT_DIR / ".missing-test-env", config_path=PROJECT_DIR / "config.yaml")
    config = replace(
        config,
        instagram=replace(config.instagram, enabled=True, dry_run=False),
        publishing=replace(config.publishing, publish_max_retries=1, retry_backoff_seconds=0),
    )
    client = _PublishFlowSupabaseClient()
    client.post_rows.append(
        {
            "id": "33333333-3333-3333-3333-333333333333",
            "run_id": "11111111-1111-1111-1111-111111111111",
            "candidate_id": "22222222-2222-2222-2222-222222222222",
            "metadata": {},
        }
    )
    post = replace(
        _sample_post(),
        metadata={
            "approval_bypass_enabled": True,
            "approval_required": False,
            "approval_status": "auto_approved",
        },
    )

    result = publish_instagram_post(
        config,
        post,
        access_token="test-access-token",
        ig_user_id="test-ig-user-id",
        client=client,
        simulate=True,
        dry_run=False,
        test_mode=False,
        post_id="33333333-3333-3333-3333-333333333333",
        report_path=tmp_path / "report.json",
    )

    assert result["status"] in {"published", "published_with_permalink_pending"}
    assert client.post_rows[0]["metadata"]["approval_status"] == "published"
    assert client.post_rows[0]["metadata"]["approval_required"] is False
    assert client.instagram_post_rows["11111111-1111-1111-1111-111111111111"]["metadata"]["approval_status"] == "published"
