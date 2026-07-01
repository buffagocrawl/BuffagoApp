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
    style = (asset.style or "").replace("_", " ").strip()
    style_hint = f" {style}" if style else ""
    templates = {
        "funny": [
            f"This wing{style_hint} understood the assignment better than most group chats.",
            f"If this wing had a voicemail, it would just say: bring napkins.",
            f"Some wings enter the room. This one made eye contact.",
        ],
        "hype": [
            f"8pm wing check: crispy, saucy, emotionally persuasive.",
            f"Daily wing reel because the scroll deserved sauce.",
            f"Tonight's forecast: high chance of ordering wings.",
        ],
        "poll": [
            f"Be honest: flats, drums, or whichever one is closest?",
            f"Would you share the last one, or is that between you and your conscience?",
            f"Rate the sauce shine from 1 to emergency napkin run.",
        ],
        "local": [
            f"Buffago energy: never casual about wings.",
            f"Western New York raised the bar and the napkin count.",
            f"Wing opinions are welcome. Weak takes may be sauced.",
        ],
        "app_cta": [
            f"Find your next wing stop in Buffago, then argue about it like family.",
            f"Save this energy for your next Buffago wing crawl.",
            f"Buffago exists for moments like this: wings first, plans second.",
        ],
    }
    options = templates.get(caption_type, templates["funny"])
    caption = options[int(now.timestamp()) % len(options)]
    if caption_type != "app_cta" and random.Random(asset.storage_path).random() < 0.25:
        caption += " Buffago can help find the next stop."
    tags = HASHTAGS[:3] if caption_type == "poll" else HASHTAGS
    return f"{caption}\n\n{' '.join(tags)}", tags, caption_type


def build_reel_content(repository: VideoAssetRepository, *, excluded_ids: set[str] | None = None, logger=None) -> VideoReelContent:
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
