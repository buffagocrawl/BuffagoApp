from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import sys

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from growth_loop import (  # noqa: E402
    BASELINE_CONTENT_MIX,
    apply_strategy_recommendation,
    compute_post_score,
    generate_growth_report,
    load_active_strategy,
    recommend_strategy_from_rows,
)
from main import build_parser  # noqa: E402


class _FakeClient:
    def __init__(self) -> None:
        self.posts: list[dict] = []
        self.metrics: list[dict] = []
        self.patterns: dict[str, dict] = {}
        self.scores: dict[str, dict] = {}
        self.reports: list[dict] = []
        self.strategies: list[dict] = []

    def fetch_rows(self, table_name: str, *, filters: dict | None = None, select: str = "*") -> list[dict]:
        filters = filters or {}
        if table_name == "jalapeno_post_metrics":
            return list(self.metrics)
        if table_name == "jalapeno_posts":
            return list(self.posts)
        if table_name == "jalapeno_post_patterns":
            return list(self.patterns.values())
        if table_name == "jalapeno_post_scores":
            return list(self.scores.values())
        if table_name == "jalapeno_content_strategy":
            rows = list(self.strategies)
            if filters.get("is_active") == "eq.true":
                rows = [row for row in rows if row.get("is_active") is True]
            return rows
        return []

    def upsert_rows(self, table_name: str, payload: dict, *, on_conflict: str) -> list[dict]:
        if table_name == "jalapeno_post_patterns":
            self.patterns[str(payload["post_id"])] = dict(payload)
            return [self.patterns[str(payload["post_id"])]]
        if table_name == "jalapeno_post_scores":
            self.scores[str(payload["post_id"])] = dict(payload)
            return [self.scores[str(payload["post_id"])]]
        raise AssertionError(f"unexpected upsert table: {table_name}")

    def insert_row(self, table_name: str, payload: dict) -> list[dict]:
        row = dict(payload)
        if table_name == "jalapeno_growth_reports":
            row.setdefault("id", f"report-{len(self.reports) + 1}")
            self.reports.append(row)
            return [row]
        if table_name == "jalapeno_content_strategy":
            row.setdefault("id", f"strategy-{len(self.strategies) + 1}")
            self.strategies.append(row)
            return [row]
        raise AssertionError(f"unexpected insert table: {table_name}")

    def update_rows(self, table_name: str, filters: dict, payload: dict) -> list[dict]:
        if table_name != "jalapeno_content_strategy":
            raise AssertionError(f"unexpected update table: {table_name}")
        target_id = str(filters["id"]).removeprefix("eq.")
        for row in self.strategies:
            if row.get("id") == target_id:
                row.update(payload)
                return [row]
        return []


def _post(post_id: str, *, content_type: str, creative_style: str, caption_style: str, hook_text: str, published_at: str, hour: str = "18:00") -> dict:
    return {
        "id": post_id,
        "run_id": f"run-{post_id}",
        "candidate_id": f"candidate-{post_id}",
        "post_type": content_type,
        "published_at": published_at,
        "hashtags": ["buffago", creative_style],
        "metadata": {
            "content_type": content_type,
            "creative_style": creative_style,
            "hook_text": hook_text,
            "overlay_text": hook_text,
            "caption_style": caption_style,
            "prompt_template_name": "buffago_post",
            "generated_prompt": "test prompt",
            "asset_path": f"storage/{post_id}.jpg",
        },
        "scheduled_for": f"2026-07-0{post_id[-1]}T{hour}:00+00:00",
    }


def _metric(post_id: str, *, published_at: str, collected_at: str, reach: int, profile_visits: int, follows: int, shares: int, saves: int, comments: int, likes: int) -> dict:
    engagement = round((likes + comments + shares + saves) / reach, 4)
    return {
        "post_id": post_id,
        "published_at": published_at,
        "collected_at": collected_at,
        "reach": reach,
        "impressions": reach + 25,
        "profile_visits": profile_visits,
        "follows": follows,
        "shares": shares,
        "saves": saves,
        "comments": comments,
        "likes": likes,
        "engagement_rate": engagement,
        "raw_metrics": {"views": reach + 40},
        "metadata": {"collection_window": "7d"},
    }


def test_growth_score_does_not_overvalue_likes() -> None:
    likes_only = compute_post_score(
        {"likes": 120, "comments": 2, "shares": 1, "saves": 1, "reach": 1000, "profile_visits": 3, "follows": 0, "engagement_rate": 0.124}
    )
    growth_signals = compute_post_score(
        {"likes": 45, "comments": 12, "shares": 16, "saves": 18, "reach": 900, "profile_visits": 55, "follows": 9, "engagement_rate": 0.101}
    )

    assert growth_signals["score"] > likes_only["score"]


def test_growth_report_generation_stores_weekly_summary() -> None:
    client = _FakeClient()
    client.posts = [
        _post("post-1", content_type="restaurant_spotlight", creative_style="realistic_food", caption_style="food-first", hook_text="Best wings?", published_at="2026-07-04T18:00:00+00:00"),
        _post("post-2", content_type="meme", creative_style="funny_meme", caption_style="meme-debate", hook_text="Wing debate", published_at="2026-07-05T18:00:00+00:00"),
    ]
    client.metrics = [
        _metric("post-1", published_at="2026-07-04T18:00:00+00:00", collected_at="2026-07-06T18:00:00+00:00", reach=500, profile_visits=25, follows=4, shares=8, saves=10, comments=6, likes=30),
        _metric("post-2", published_at="2026-07-05T18:00:00+00:00", collected_at="2026-07-06T20:00:00+00:00", reach=620, profile_visits=20, follows=3, shares=12, saves=7, comments=9, likes=40),
    ]

    result = generate_growth_report(client, now=datetime(2026, 7, 7, 12, 0, tzinfo=timezone.utc))

    assert result.stored is True
    assert result.summary["total_posts_published"] == 2
    assert result.summary["top_performing_posts"]
    assert client.reports[0]["report_type"] == "weekly_growth"


def test_recommendation_uses_baseline_when_data_is_insufficient() -> None:
    rows = [
        {"growth_score": 70, "pattern": {"content_type": "restaurant_spotlight", "creative_style": "realistic_food", "hook_text": "Try this", "overlay_text": "Try this", "caption_style": "food-first", "content_mix_bucket": "mouthwatering_food", "published_time": "2026-07-04T18:00:00+00:00"}, "published_at": "2026-07-04T18:00:00+00:00"},
        {"growth_score": 68, "pattern": {"content_type": "meme", "creative_style": "funny_meme", "hook_text": "Wing debate", "overlay_text": "Wing debate", "caption_style": "meme", "content_mix_bucket": "funny_wing_memes", "published_time": "2026-07-05T18:00:00+00:00"}, "published_at": "2026-07-05T18:00:00+00:00"},
    ]

    recommendation = recommend_strategy_from_rows(rows, now=datetime(2026, 7, 7, 12, 0, tzinfo=timezone.utc))

    assert recommendation.insufficient_data is True
    assert recommendation.strategy["content_mix_targets"] == BASELINE_CONTENT_MIX


def test_recommendation_identifies_clear_winners_and_losers() -> None:
    rows = []
    for index in range(3):
        rows.append(
            {
                "growth_score": 84 + index,
                "pattern": {
                    "content_type": "meme",
                    "creative_style": "funny_meme",
                    "hook_text": "Wing debate",
                    "overlay_text": "Wing debate",
                    "caption_style": "meme-debate",
                    "content_mix_bucket": "funny_wing_memes",
                    "published_time": "2026-07-04T18:00:00+00:00",
                },
                "published_at": "2026-07-04T18:00:00+00:00",
            }
        )
    for index in range(3):
        rows.append(
            {
                "growth_score": 42 + index,
                "pattern": {
                    "content_type": "xp_milestone",
                    "creative_style": "app_demo",
                    "hook_text": "XP milestone",
                    "overlay_text": "XP milestone",
                    "caption_style": "app-feature-celebration",
                    "content_mix_bucket": "app_feature",
                    "published_time": "2026-07-05T12:00:00+00:00",
                },
                "published_at": "2026-07-05T12:00:00+00:00",
            }
        )

    recommendation = recommend_strategy_from_rows(rows, now=datetime(2026, 7, 7, 12, 0, tzinfo=timezone.utc))

    assert recommendation.insufficient_data is False
    assert "funny_meme" in recommendation.strategy["use_more_creative_styles"]
    assert "app_demo" in recommendation.strategy["reduce_creative_styles"]


def test_strategy_persistence_and_readback() -> None:
    client = _FakeClient()
    recommendation = recommend_strategy_from_rows(
        [
            {
                "growth_score": 80,
                "pattern": {
                    "content_type": "meme",
                    "creative_style": "funny_meme",
                    "hook_text": "Wing debate",
                    "overlay_text": "Wing debate",
                    "caption_style": "meme-debate",
                    "content_mix_bucket": "funny_wing_memes",
                    "published_time": "2026-07-04T18:00:00+00:00",
                },
                "published_at": "2026-07-04T18:00:00+00:00",
            }
        ]
        * 6,
        now=datetime(2026, 7, 7, 12, 0, tzinfo=timezone.utc),
    )

    preview = apply_strategy_recommendation(client, recommendation, report_id="report-1", write=False)
    assert preview["is_active"] is False

    applied = apply_strategy_recommendation(client, recommendation, report_id="report-1", write=True)
    loaded = load_active_strategy(client)

    assert applied["is_active"] is True
    assert loaded is not None
    assert loaded["strategy"]["content_mix_targets"] == recommendation.strategy["content_mix_targets"]


def test_cli_parser_supports_growth_loop_commands() -> None:
    parser = build_parser()

    assert parser.parse_args(["--growth-report"]).growth_report is True
    assert parser.parse_args(["--recommend-strategy"]).recommend_strategy is True
    assert parser.parse_args(["--apply-strategy"]).apply_strategy is True
