from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from content_engine.candidate_generator import ContentCandidate
from content_engine.caption_generator import CaptionPackage
from logging_utils import log_event
from video_assets import VideoAsset, VideoAssetRepository


@dataclass(frozen=True, slots=True)
class VideoReelPlan:
    candidate_id: str
    video_asset: VideoAsset
    candidate: ContentCandidate
    content_type: str = "daily_wing_reel"
    scheduled_post_type: str = "daily_wing_reel"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _caption_type(asset: VideoAsset) -> str:
    if asset.caption_type:
        return asset.caption_type
    choices = ["funny", "hype", "poll", "app_cta"]
    return choices[hash(asset.storage_path) % len(choices)]


def build_reel_plan(
    repository: VideoAssetRepository,
    *,
    excluded_ids: set[str] | None = None,
    dry_run: bool,
    logger=None,
) -> VideoReelPlan:
    asset = repository.select_asset(excluded_ids=excluded_ids)
    candidate_id = str(uuid4())
    caption_type = _caption_type(asset)
    candidate = ContentCandidate(
        candidate_id=candidate_id,
        content_type="daily_wing_reel",
        creative_style=asset.style or "realistic_food_video",
        reason_chosen="Selected the oldest eligible active Supabase video asset for today's Reel slot.",
        working_title="Daily wing Reel",
        short_summary="Preloaded wing Reel from Supabase Storage with OpenAI-generated caption and overlay.",
        hook_text="DAILY WING REEL",
        overlay_text="",
        target_emotion="Hungry",
        suggested_cta="Send this to the person you're getting wings with.",
        suggested_image_concept="Use the selected Buffago wing Reel as the media source and write copy that matches the footage.",
        suggested_caption_angle="Keep the caption tied directly to the Reel and make the CTA specific to wing plans or debate.",
        caption_style=caption_type,
        prompt_template_name="daily_wing_reel",
        primary_theme="daily wing reel",
        secondary_theme="video appetite trigger",
        mood="Playful",
        hook_style="reel_social_prompt",
        cta_category="send",
        food_categories=["wings", "wing night"],
        source_signals=["video_asset_library"],
        visual_style=asset.style or "realistic_food_video",
        image_composition="existing vertical Reel footage with safe overlay zone",
        metadata={
            "video_asset_id": asset.id,
            "storage_bucket": asset.storage_bucket,
            "storage_path": asset.storage_path,
            "public_video_url": asset.public_url,
            "caption_type": caption_type,
            "media_source": "supabase_video_asset",
        },
    )
    log_event(
        logger,
        "video_reel_candidate_selected",
        candidate_id=candidate_id,
        video_asset_id=asset.id,
        storage_path=asset.storage_path,
        caption_type=caption_type,
        dry_run=dry_run,
    )
    return VideoReelPlan(
        candidate_id=candidate_id,
        video_asset=asset,
        candidate=candidate,
    )


def content_decision_from_reel(run_id: str, plan: VideoReelPlan, caption_package: CaptionPackage) -> dict[str, Any]:
    asset = plan.video_asset
    return {
        "run_id": run_id,
        "generated_at": _utcnow().isoformat(),
        "scheduled_post_type": plan.scheduled_post_type,
        "winner": {
            "candidate_id": plan.candidate_id,
            "content_type": plan.content_type,
            "scheduled_post_type": plan.scheduled_post_type,
            "caption": caption_package.caption,
            "caption_text": caption_package.caption,
            "selected_caption": caption_package.body,
            "selected_overlay": caption_package.overlay_text,
            "overlay_text": caption_package.overlay_text,
            "hashtags": caption_package.hashtags,
            "image_prompt": "Preloaded Supabase Storage wing video asset; no AI image or video generated.",
            "approved": True,
            "video_url": asset.public_url,
            "public_video_url": asset.public_url,
            "video_asset_id": asset.id,
            "storage_bucket": asset.storage_bucket,
            "storage_path": asset.storage_path,
            "media_source": "supabase_video_asset",
            "caption_type": caption_package.caption_type,
            "caption_style": caption_package.caption_style,
            "selected_caption_style": caption_package.selected_caption_style,
            "caption_source": caption_package.caption_source,
            "overlay_source": caption_package.overlay_source,
            "openai_used": caption_package.openai_used,
            "openai_model": caption_package.openai_model,
            "copy_source": caption_package.copy_source,
            "fallback_reason": caption_package.fallback_reason,
            "generated_at": caption_package.generated_at,
            "reuse_blocked_reason": caption_package.reuse_blocked_reason,
            "caption_options": caption_package.caption_options,
            "overlay_options": caption_package.overlay_options,
            "ranking_reason": caption_package.ranking_reason,
            "ranking_score": caption_package.ranking_score,
            "ranking_breakdown": caption_package.ranking_breakdown,
            "feedback_summary_version": caption_package.feedback_summary_version,
            "feedback_summary": caption_package.feedback_summary,
            "repair_applied": caption_package.repair_applied,
            "style": asset.style,
            "working_title": "Daily wing Reel",
            "short_summary": "Preloaded wing video Reel from Supabase Storage with OpenAI-generated copy.",
        },
        "runner_up": None,
        "all_candidates": [],
        "decision_summary": {
            "platform": "instagram",
            "media_source": "supabase_video_asset",
            "video_asset_id": asset.id,
            "storage_path": asset.storage_path,
            "caption_type": caption_package.caption_type,
            "style": asset.style,
            "openai_used": caption_package.openai_used,
            "openai_model": caption_package.openai_model,
            "copy_source": caption_package.copy_source,
            "fallback_reason": caption_package.fallback_reason,
            "generated_at": caption_package.generated_at,
            "selected_caption": caption_package.body,
            "selected_overlay": caption_package.overlay_text,
            "caption_text": caption_package.caption,
            "token_usage": caption_package.token_usage,
            "cost_estimate": caption_package.estimated_cost_usd or 0.0,
            "openai_request_id": caption_package.openai_request_id,
            "openai_attempt_count": caption_package.openai_attempt_count,
            "openai_retry_count": caption_package.openai_retry_count,
            "openai_latency_ms": caption_package.openai_latency_ms,
            "repair_applied": caption_package.repair_applied,
            "winner_reasoning": ["Selected the oldest eligible active Supabase video asset."],
        },
    }
