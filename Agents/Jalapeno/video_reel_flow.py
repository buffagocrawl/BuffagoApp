from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from config import JalapenoConfig
from logging_utils import log_event
from video_assets import VideoAsset, VideoAssetRepository


HASHTAGS = ["#Buffago", "#BuffaloWings", "#WingNight", "#ChickenWings"]


@dataclass(frozen=True, slots=True)
class VideoReelContent:
    candidate_id: str
    video_asset: VideoAsset
    caption: str
    hashtags: list[str]
    caption_type: str
    content_type: str = "daily_wing_reel"
    scheduled_post_type: str = "daily_wing_reel"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _caption_type(asset: VideoAsset) -> str:
    if asset.caption_type:
        return asset.caption_type
    choices = ["funny", "hype", "poll", "app_cta"]
    return choices[hash(asset.storage_path) % len(choices)]


def generate_reel_caption(asset: VideoAsset, *, now: datetime | None = None) -> tuple[str, list[str], str]:
    now = now or _utcnow()
    caption_type = _caption_type(asset)
    templates = {
        "funny": [
            "Send this to the friend who thinks they can out-eat this plate.",
            "Tag the friend who would try to finish this basket.",
            "Like this if wing night is non-negotiable.",
        ],
        "hype": [
            "Send this to the group chat and make wing night happen.",
            "Comment your sauce pick before someone else chooses for you.",
            "Like if this counts as dinner.",
        ],
        "poll": [
            "Vote now: flats or drums?",
            "Comment your go-to wing order.",
            "Pick a side and send this to the friend who disagrees.",
        ],
        "local": [
            "Share this with someone who owes you a wing stop.",
            "Tag your wing-night person and make the plan.",
            "Send this if your city takes wing night seriously.",
        ],
        "app_cta": [
            "Download Buffago and start your next wing crawl.",
            "Share this with the friend who always wants the next spot.",
            "Tag someone and build your next wing plan in Buffago.",
        ],
    }
    options = templates.get(caption_type, templates["funny"])
    caption = options[int(now.timestamp()) % len(options)]
    if caption_type != "app_cta" and random.Random(asset.storage_path).random() < 0.25:
        caption += " Buffago can help find the next stop."
    tags = HASHTAGS[:3] if caption_type == "poll" else HASHTAGS
    return f"{caption}\n\n{' '.join(tags)}", tags, caption_type


def build_reel_content(
    repository: VideoAssetRepository,
    *,
    excluded_ids: set[str] | None = None,
    dry_run: bool,
    logger=None,
) -> VideoReelContent:
    asset = repository.select_asset(excluded_ids=excluded_ids)
    caption, hashtags, caption_type = generate_reel_caption(asset)
    candidate_id = str(uuid4())
    log_event(
        logger,
        "video_reel_content_generated",
        candidate_id=candidate_id,
        video_asset_id=asset.id,
        storage_path=asset.storage_path,
        caption_type=caption_type,
        caption_preview=caption[:140],
        dry_run=dry_run,
    )
    return VideoReelContent(
        candidate_id=candidate_id,
        video_asset=asset,
        caption=caption,
        hashtags=hashtags,
        caption_type=caption_type,
    )


def content_decision_from_reel(run_id: str, content: VideoReelContent) -> dict[str, Any]:
    asset = content.video_asset
    return {
        "run_id": run_id,
        "generated_at": _utcnow().isoformat(),
        "scheduled_post_type": content.scheduled_post_type,
        "winner": {
            "candidate_id": content.candidate_id,
            "content_type": content.content_type,
            "scheduled_post_type": content.scheduled_post_type,
            "caption": content.caption,
            "hashtags": content.hashtags,
            "image_prompt": "Preloaded Supabase Storage wing video asset; no AI image or video generated.",
            "approved": True,
            "video_url": asset.public_url,
            "public_video_url": asset.public_url,
            "video_asset_id": asset.id,
            "storage_bucket": asset.storage_bucket,
            "storage_path": asset.storage_path,
            "media_source": "supabase_video_asset",
            "caption_type": content.caption_type,
            "style": asset.style,
            "working_title": "Daily wing Reel",
            "short_summary": "Preloaded wing video Reel from Supabase Storage.",
        },
        "runner_up": None,
        "all_candidates": [],
        "decision_summary": {
            "platform": "instagram",
            "media_source": "supabase_video_asset",
            "video_asset_id": asset.id,
            "storage_path": asset.storage_path,
            "caption_type": content.caption_type,
            "style": asset.style,
            "winner_reasoning": ["Selected the oldest eligible active Supabase video asset."],
        },
    }
