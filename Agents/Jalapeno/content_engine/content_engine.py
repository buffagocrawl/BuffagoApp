from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID
from uuid import uuid4

from jalapeno_db import JalapenoRunContext, ensure_run
from logging_utils import log_event
from supabase_client import SupabaseClient

from content_engine.alt_text_generator import generate_alt_text
from content_engine.candidate_generator import CandidateGenerator, ContentCandidate
from content_engine.candidate_scorer import CandidateScorer, ScoredCandidate
from content_engine.caption_generator import CaptionPackage, generate_caption_package
from content_engine.duplicate_checker import DuplicateChecker
from content_engine.hashtag_generator import generate_hashtags
from content_engine.image_prompt_generator import generate_image_prompt
from content_engine.feedback_summary import build_feedback_summary
from content_engine.settings import ContentEngineSettings, load_content_engine_settings
from content_engine.winner_selector import WinnerSelectionResult, WinnerSelector
from content_memory import analyze_content_memory, infer_memory_entry_from_post, load_content_memory, load_recent_published_posts, persist_memory_entry
from performance_context import build_performance_context


DEFAULT_DECISION_OUTPUT_PATH = Path(__file__).resolve().parents[1] / "data" / "latest_content_decision.json"
DEFAULT_CONTENT_ENGINE_LOG_PATH = Path(__file__).resolve().parents[1] / "data" / "content_engine_latest.json"


@dataclass(frozen=True, slots=True)
class ContentDecisionResult:
    run_id: str
    generated_at: str
    winner: dict[str, Any]
    runner_up: dict[str, Any] | None
    all_candidates: list[dict[str, Any]]
    decision_summary: dict[str, Any]
    output_path: str
    persisted_rows: dict[str, Any] = field(default_factory=dict)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True, default=str)
        handle.write("\n")


def _caption_body_from_text(value: str | None) -> str | None:
    if not value:
        return None
    body = re.sub(r"(?:\s*#\w+)+\s*$", "", value).strip()
    return body or None


def _serialize_candidate(candidate: ContentCandidate, score: ScoredCandidate | None = None, duplicate: dict[str, Any] | None = None, caption: CaptionPackage | None = None) -> dict[str, Any]:
    payload = candidate.to_dict()
    if score is not None:
        payload.update(
            {
                "category_scores": score.score.category_scores,
                "weighted_total": score.score.weighted_total,
                "adjustments": score.score.adjustments,
                "notes": score.score.notes,
                "duplicate_score": score.duplicate_score,
                "rejected_duplicate": score.rejected_duplicate,
                "duplicate_reason": score.duplicate_reason,
                "final_score": score.final_score,
            }
        )
    if duplicate is not None:
        payload["duplicate_check"] = duplicate
    if caption is not None:
        payload["caption_package"] = asdict(caption)
    return payload


def _persist_candidate_row(client: SupabaseClient, run_id: str, candidate_payload: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "run_id": run_id,
        "candidate_id": candidate_payload.get("candidate_id"),
        "content_type": candidate_payload.get("content_type"),
        "reason_chosen": candidate_payload.get("reason_chosen"),
        "working_title": candidate_payload.get("working_title"),
        "short_summary": candidate_payload.get("short_summary"),
        "target_emotion": candidate_payload.get("target_emotion"),
        "suggested_cta": candidate_payload.get("suggested_cta"),
        "suggested_image_concept": candidate_payload.get("suggested_image_concept"),
        "suggested_caption_angle": candidate_payload.get("suggested_caption_angle"),
        "primary_theme": candidate_payload.get("primary_theme"),
        "secondary_theme": candidate_payload.get("secondary_theme"),
        "mood": candidate_payload.get("mood"),
        "hook_style": candidate_payload.get("hook_style"),
        "cta_category": candidate_payload.get("cta_category"),
        "restaurants_mentioned": candidate_payload.get("restaurants_mentioned"),
        "cities_mentioned": candidate_payload.get("cities_mentioned"),
        "states_mentioned": candidate_payload.get("states_mentioned"),
        "food_categories": candidate_payload.get("food_categories"),
        "holiday_references": candidate_payload.get("holiday_references"),
        "sports_references": candidate_payload.get("sports_references"),
        "current_event_references": candidate_payload.get("current_event_references"),
        "source_signals": candidate_payload.get("source_signals"),
        "visual_style": candidate_payload.get("visual_style"),
        "image_composition": candidate_payload.get("image_composition"),
        "duplicate_score": candidate_payload.get("duplicate_score"),
        "overall_score": candidate_payload.get("final_score"),
        "rejected": candidate_payload.get("rejected_duplicate", False),
        "rejection_reason": candidate_payload.get("duplicate_reason"),
        "caption_options": candidate_payload.get("caption_package", {}).get("caption_options", []),
        "overlay_options": candidate_payload.get("caption_package", {}).get("overlay_options", []),
        "selected_caption": candidate_payload.get("caption_package", {}).get("caption"),
        "selected_overlay": candidate_payload.get("caption_package", {}).get("overlay_text"),
        "caption_text": candidate_payload.get("caption_package", {}).get("caption"),
        "copy_source": candidate_payload.get("caption_package", {}).get("copy_source"),
        "generated_at": candidate_payload.get("caption_package", {}).get("generated_at"),
        "reuse_blocked_reason": candidate_payload.get("caption_package", {}).get("reuse_blocked_reason"),
        "ranking_reason": candidate_payload.get("caption_package", {}).get("ranking_reason"),
        "ranking_score": candidate_payload.get("caption_package", {}).get("ranking_score"),
        "ranking_breakdown": candidate_payload.get("caption_package", {}).get("ranking_breakdown", {}),
        "openai_used": candidate_payload.get("caption_package", {}).get("openai_used", False),
        "openai_model": candidate_payload.get("caption_package", {}).get("openai_model"),
        "fallback_reason": candidate_payload.get("caption_package", {}).get("fallback_reason"),
        "feedback_summary_version": candidate_payload.get("caption_package", {}).get("feedback_summary_version"),
        "feedback_summary": candidate_payload.get("caption_package", {}).get("feedback_summary", {}),
        "score_breakdown": {
            "category_scores": candidate_payload.get("category_scores", {}),
            "adjustments": candidate_payload.get("adjustments", {}),
            "notes": candidate_payload.get("notes", []),
        },
        "metadata": candidate_payload.get("metadata", {}),
    }
    rows = client.insert_row("jalapeno_content_candidates", payload)
    return rows[0] if rows else payload


def _persist_decision_row(client: SupabaseClient, run_id: str, result: ContentDecisionResult) -> dict[str, Any]:
    payload = {
        "run_id": run_id,
        "winner_candidate_id": result.winner.get("candidate_id"),
        "runner_up_candidate_id": result.runner_up.get("candidate_id") if result.runner_up else None,
        "decision_summary": result.decision_summary,
        "winner_reasoning": result.decision_summary.get("winner_reasoning", []),
        "model_name": result.decision_summary.get("model_name"),
        "token_usage": result.decision_summary.get("token_usage", {}),
        "cost_estimate": result.decision_summary.get("cost_estimate"),
        "platform": result.decision_summary.get("platform", "instagram"),
        "feedback_summary_version": result.decision_summary.get("feedback_summary_version"),
        "feedback_summary": result.decision_summary.get("feedback_summary", {}),
        "openai_used": result.decision_summary.get("openai_used", False),
        "fallback_reason": result.decision_summary.get("fallback_reason"),
        "ranking_reason": result.winner.get("ranking_reason"),
        "selected_caption": _caption_body_from_text(result.winner.get("caption")),
        "selected_overlay": result.winner.get("overlay_text"),
        "caption_text": result.winner.get("caption"),
        "copy_source": result.decision_summary.get("copy_source"),
        "generated_at": result.decision_summary.get("generated_at"),
        "reuse_blocked_reason": result.decision_summary.get("reuse_blocked_reason"),
        "caption_options": result.winner.get("caption_options", []),
        "overlay_options": result.winner.get("overlay_options", []),
    }
    rows = client.insert_row("jalapeno_content_decisions", payload)
    return rows[0] if rows else payload


def _candidate_run_payload(candidate: dict[str, Any]) -> dict[str, Any]:
    return {
        "post_id": candidate.get("candidate_id"),
        "run_id": candidate.get("run_id"),
        "timestamp": candidate.get("generated_at"),
        "platform": candidate.get("platform", "instagram"),
        "post_type": candidate.get("content_type"),
        "primary_theme": candidate.get("primary_theme"),
        "secondary_theme": candidate.get("secondary_theme"),
        "mood": candidate.get("mood"),
        "target_emotion": candidate.get("target_emotion"),
        "restaurants_mentioned": candidate.get("restaurants_mentioned"),
        "cities_mentioned": candidate.get("cities_mentioned"),
        "states_mentioned": candidate.get("states_mentioned"),
        "food_categories": candidate.get("food_categories"),
        "holiday_references": candidate.get("holiday_references"),
        "sports_references": candidate.get("sports_references"),
        "current_event_references": candidate.get("current_event_references"),
        "hook_style": candidate.get("hook_style"),
        "cta_category": candidate.get("cta_category"),
        "specific_cta": candidate.get("suggested_cta"),
        "hashtags": candidate.get("caption_package", {}).get("hashtags", []),
        "dominant_image_colors": candidate.get("dominant_image_colors", []),
        "image_style": candidate.get("visual_style"),
        "image_composition": candidate.get("image_composition"),
        "caption_length": len(candidate.get("caption_package", {}).get("caption", "")),
        "emoji_count": len([char for char in candidate.get("caption_package", {}).get("caption", "") if ord(char) > 0x1F000]),
        "question_included": "?" in candidate.get("caption_package", {}).get("caption", ""),
        "carousel": False,
        "publishing_time": None,
        "metadata": {
            "final_score": candidate.get("final_score"),
            "duplicate_score": candidate.get("duplicate_score"),
            "score_breakdown": candidate.get("score_breakdown"),
        },
    }


def _filter_candidates_for_scheduled_post_type(
    candidates: list[ContentCandidate],
    *,
    scheduled_post_type: str | None,
) -> list[ContentCandidate]:
    if scheduled_post_type is None:
        return candidates
    if scheduled_post_type == "meme_post":
        filtered = [candidate for candidate in candidates if candidate.content_type == "meme"]
    elif scheduled_post_type == "buffago_post":
        filtered = [candidate for candidate in candidates if candidate.content_type not in {"meme", "funny_observation"}]
    else:
        raise ValueError(f"Unsupported scheduled_post_type: {scheduled_post_type}")
    if not filtered:
        raise ValueError(f"No candidates available for scheduled_post_type: {scheduled_post_type}")
    return filtered


class ContentDecisionEngine:
    def __init__(self, settings: ContentEngineSettings | None = None) -> None:
        self.settings = settings or load_content_engine_settings()
        self.candidate_generator = CandidateGenerator(self.settings)
        self.scorer = CandidateScorer(self.settings)
        self.duplicate_checker = DuplicateChecker(self.settings)
        self.winner_selector = WinnerSelector(self.settings)

    def run(
        self,
        *,
        snapshot: dict[str, Any],
        external_context: dict[str, Any],
        client: SupabaseClient | None = None,
        logger=None,
        run_id: str | None = None,
        dry_run: bool = True,
        output_path: Path = DEFAULT_DECISION_OUTPUT_PATH,
        scheduled_post_type: str | None = None,
        require_ai_copy: bool = False,
    ) -> ContentDecisionResult:
        active_run_id = run_id or str(uuid4())
        started_at = _utcnow()
        log_event(logger, "candidate_generation_started", run_id=active_run_id, dry_run=dry_run, stage="content_engine", model="local-rules")
        memory_entries, memory_summary, memory_rows = load_content_memory(client, logger=logger, run_id=active_run_id, limit=30)
        performance_context = build_performance_context(client, logger=logger, run_id=active_run_id).to_dict()
        feedback_summary = build_feedback_summary(performance_context, {
            "theme_rotation_needed": memory_summary.theme_rotation_needed,
        })
        if memory_summary.reasoning:
            log_event(logger, "content_memory_analyzed", run_id=active_run_id, reasoning=memory_summary.reasoning, community_activity_score=memory_summary.community_activity_score)
        if memory_summary.theme_rotation_needed:
            log_event(logger, "theme_rotation_detected", run_id=active_run_id, recent_themes=memory_summary.recent_themes[:5])

        candidates = self.candidate_generator.generate_candidates(
            snapshot=snapshot,
            external_context=external_context,
            memory_summary={
                "recent_themes": memory_summary.recent_themes,
                "underused_themes": memory_summary.underused_themes,
                "recent_ctas": memory_summary.recent_ctas,
                "recent_restaurants": memory_summary.recent_restaurants,
                "recent_hooks": memory_summary.recent_hooks,
                "recent_visual_styles": memory_summary.recent_visual_styles,
                "community_activity_score": memory_summary.community_activity_score,
                "theme_rotation_needed": memory_summary.theme_rotation_needed,
                "performance_context": performance_context,
            },
            scheduled_post_type=scheduled_post_type,
        )
        candidates = _filter_candidates_for_scheduled_post_type(
            candidates,
            scheduled_post_type=scheduled_post_type,
        )

        recent_posts = load_recent_published_posts(client, limit=100) if client is not None else []
        scored_candidates: list[ScoredCandidate] = []
        persisted_candidates: list[dict[str, Any]] = []
        for candidate in candidates:
            duplicate = self.duplicate_checker.check(candidate, recent_posts)
            if duplicate.rejected:
                log_event(
                    logger,
                    "duplicate_content_detected",
                    run_id=active_run_id,
                    candidate_id=candidate.candidate_id,
                    stage="content_engine",
                    status="rejected",
                    duplicate_similarity=duplicate.duplicate_score,
                    rejection_reason=duplicate.rejection_reason,
                )
            score = self.scorer.score(
                candidate,
                snapshot=snapshot,
                external_context=external_context,
                memory_summary={
                    "recent_themes": memory_summary.recent_themes,
                    "recent_ctas": memory_summary.recent_ctas,
                    "recent_restaurants": memory_summary.recent_restaurants,
                    "recent_hooks": memory_summary.recent_hooks,
                    "recent_visual_styles": memory_summary.recent_visual_styles,
                    "underused_themes": memory_summary.underused_themes,
                    "community_activity_score": memory_summary.community_activity_score,
                    "performance_context": performance_context,
                },
                duplicate_score=duplicate.duplicate_score,
            )
            scored = ScoredCandidate(
                candidate=candidate,
                score=score,
                duplicate_score=duplicate.duplicate_score,
                rejected_duplicate=duplicate.rejected,
                duplicate_reason=duplicate.rejection_reason,
                duplicate_notes=duplicate.comparison_notes,
            )
            scored_candidates.append(scored)
            payload = _serialize_candidate(candidate, score=scored, duplicate={
                "duplicate_score": duplicate.duplicate_score,
                "rejected": duplicate.rejected,
                "rejection_reason": duplicate.rejection_reason,
                "comparison_notes": duplicate.comparison_notes,
            })
            persisted_candidates.append(payload)
            log_event(
                logger,
                "candidate_scored",
                run_id=active_run_id,
                candidate_id=candidate.candidate_id,
                content_type=candidate.content_type,
                score=scored.final_score,
                duplicate_similarity=duplicate.duplicate_score,
            )

        survivors = [candidate for candidate in scored_candidates if not candidate.rejected_duplicate]
        if not survivors:
            survivors = scored_candidates
        selection = self.winner_selector.select(
            survivors,
            memory_summary={
                "theme_rotation_needed": memory_summary.theme_rotation_needed,
                "underused_themes": memory_summary.underused_themes,
            },
            external_context=external_context,
        )
        log_event(
            logger,
            "winner_selected",
            run_id=active_run_id,
            candidate_id=selection.winner.candidate.candidate_id,
            candidate_type=selection.winner.candidate.content_type,
            score=selection.winner.final_score,
            adjusted_score=selection.adjusted_scores.get(selection.winner.candidate.candidate_id, selection.winner.final_score),
            chosen_reason="; ".join(selection.reasoning),
        )

        winner_caption = generate_caption_package(
            selection.winner.candidate,
            snapshot=snapshot,
            external_context=external_context,
            performance_context=performance_context,
            recent_posts=recent_posts,
            logger=logger,
            require_ai_copy=require_ai_copy,
        )
        banned_phrase_detected = any(
            issue.startswith("banned_phrase:") for issue in winner_caption.quality_review.get("issues", [])
        )
        log_event(
            logger,
            "caption_selected",
            run_id=active_run_id,
            candidate_id=selection.winner.candidate.candidate_id,
            score=winner_caption.quality_review.get("score"),
            approved=winner_caption.quality_review.get("approved"),
            selected_caption_style=winner_caption.selected_caption_style,
            caption_source=winner_caption.caption_source,
            generated_caption=winner_caption.caption,
            caption_length=winner_caption.caption_length,
            validation_passed=winner_caption.validation_passed,
            validation_failure_reason=winner_caption.validation_failure_reason,
            fallback_used=winner_caption.fallback_used,
            caption_overlay_concept=winner_caption.caption_overlay_concept,
            banned_phrase_detected=banned_phrase_detected,
            overlay_text_selected=winner_caption.overlay_text,
        )
        log_event(
            logger,
            "caption_generated",
            run_id=active_run_id,
            candidate_id=selection.winner.candidate.candidate_id,
            selected_caption_style=winner_caption.selected_caption_style,
            caption_source=winner_caption.caption_source,
            generated_caption=winner_caption.caption,
            validation_passed=winner_caption.validation_passed,
            fallback_used=winner_caption.fallback_used,
        )
        log_event(logger, "hashtags_generated", run_id=active_run_id, candidate_id=selection.winner.candidate.candidate_id, hashtag_count=len(winner_caption.hashtags))
        log_event(logger, "alt_text_generated", run_id=active_run_id, candidate_id=selection.winner.candidate.candidate_id)
        log_event(logger, "image_prompt_generated", run_id=active_run_id, candidate_id=selection.winner.candidate.candidate_id)

        winner_payload = _serialize_candidate(
            selection.winner.candidate,
            score=selection.winner,
            caption=winner_caption,
        )
        winner_payload.update(
            {
        "caption_package": asdict(winner_caption),
        "caption": winner_caption.caption,
        "caption_text": winner_caption.caption,
        "selected_caption": _caption_body_from_text(winner_caption.caption) or winner_caption.caption,
        "overlay_text": winner_caption.overlay_text,
        "caption_style": winner_caption.caption_style,
        "caption_type": winner_caption.caption_type,
                "hashtags": winner_caption.hashtags,
                "alt_text": winner_caption.alt_text,
                "image_prompt": winner_caption.image_prompt,
                "scheduled_post_type": scheduled_post_type,
            }
        )
        runner_up_payload = None
        if selection.runner_up is not None:
            try:
                runner_up_caption = generate_caption_package(
                    selection.runner_up.candidate,
                    snapshot=snapshot,
                    external_context=external_context,
                    performance_context=performance_context,
                    recent_posts=recent_posts,
                    logger=logger,
                    require_ai_copy=False,
                )
            except Exception as exc:  # pragma: no cover - additive context should not block the winner
                log_event(
                    logger,
                    "runner_up_caption_generation_skipped",
                    level="warning",
                    run_id=active_run_id,
                    candidate_id=selection.runner_up.candidate.candidate_id,
                    reason=str(exc),
                )
            else:
                runner_up_payload = _serialize_candidate(selection.runner_up.candidate, score=selection.runner_up, caption=runner_up_caption)
                runner_up_payload["overlay_text"] = runner_up_caption.overlay_text
                runner_up_payload["caption_style"] = runner_up_caption.caption_style
                runner_up_payload["caption_type"] = runner_up_caption.caption_type
                runner_up_payload["scheduled_post_type"] = scheduled_post_type

        decision_summary = {
            "run_id": active_run_id,
            "generated_at": _utcnow().isoformat(),
            "model_name": "local-rules",
            "token_usage": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0},
            "cost_estimate": 0.0,
            "duplicate_similarity_threshold": self.settings.duplicate_similarity_threshold,
            "candidate_count": len(candidates),
            "survivor_count": len(survivors),
            "rejected_duplicate_count": sum(1 for candidate in scored_candidates if candidate.rejected_duplicate),
            "winner_reasoning": selection.reasoning,
            "memory_reasoning": memory_summary.reasoning,
            "performance_context": performance_context,
            "feedback_summary_version": feedback_summary.version,
            "feedback_summary": feedback_summary.to_dict(),
            "openai_used": winner_caption.openai_used,
            "openai_model": winner_caption.openai_model,
            "fallback_reason": winner_caption.fallback_reason,
            "copy_source": winner_caption.copy_source,
            "generated_at": winner_caption.generated_at,
            "reuse_blocked_reason": winner_caption.reuse_blocked_reason,
            "selected_caption": _caption_body_from_text(winner_caption.caption) or winner_caption.caption,
            "selected_overlay": winner_caption.overlay_text,
            "caption_text": winner_caption.caption,
            "caption_options": winner_caption.caption_options,
            "overlay_options": winner_caption.overlay_options,
            "content_direction_reason": (
                performance_context.get("strong_patterns", ["No strong historic pattern yet"])[0]
                if isinstance(performance_context.get("strong_patterns"), list) and performance_context.get("strong_patterns")
                else "No strong historic pattern yet; using current Buffago activity and duplicate avoidance."
            ),
            "platform": "instagram",
            "scheduled_post_type": scheduled_post_type,
        }

        result = ContentDecisionResult(
            run_id=active_run_id,
            generated_at=decision_summary["generated_at"],
            winner=winner_payload,
            runner_up=runner_up_payload,
            all_candidates=persisted_candidates,
            decision_summary=decision_summary,
            output_path=str(output_path),
        )

        persisted_rows: dict[str, Any] = {"run": None, "candidates": [], "decision": None, "memory": []}
        persistence_attempted = client is not None
        persistence_succeeded = client is not None
        if client is not None:
            try:
                persisted_rows["run"] = ensure_run(
                    client,
                    context=JalapenoRunContext(run_id=UUID(active_run_id), dry_run=dry_run),
                    metadata={
                        "source": "content_engine",
                        "validation_mode": dry_run,
                    },
                )
            except Exception as exc:  # pragma: no cover - defensive guard
                persistence_succeeded = False
                log_event(
                    logger,
                    "content_run_persist_failed",
                    level="warning",
                    run_id=active_run_id,
                    message=str(exc),
                )

            if persisted_rows["run"] is not None:
                for candidate_payload in persisted_candidates:
                    try:
                        persisted_rows["candidates"].append(_persist_candidate_row(client, active_run_id, candidate_payload))
                    except Exception as exc:  # pragma: no cover - defensive guard
                        persistence_succeeded = False
                        log_event(
                            logger,
                            "content_candidate_persist_failed",
                            level="warning",
                            run_id=active_run_id,
                            candidate_id=candidate_payload.get("candidate_id"),
                            message=str(exc),
                        )
                try:
                    persisted_rows["decision"] = _persist_decision_row(client, active_run_id, result)
                except Exception as exc:  # pragma: no cover - defensive guard
                    persistence_succeeded = False
                    log_event(
                        logger,
                        "content_decision_persist_failed",
                        level="warning",
                        run_id=active_run_id,
                        message=str(exc),
                    )
            else:
                persistence_succeeded = False
            if not dry_run:
                winner_memory_post = {
                    "id": selection.winner.candidate.candidate_id,
                    "run_id": active_run_id,
                    "published_at": _utcnow().isoformat(),
                    "post_type": selection.winner.candidate.content_type,
                    "generated_caption": winner_caption.caption,
                    "hashtags": winner_caption.hashtags,
                    "metadata": {
                        "primary_theme": selection.winner.candidate.primary_theme,
                        "secondary_theme": selection.winner.candidate.secondary_theme,
                        "mood": selection.winner.candidate.mood,
                        "target_emotion": selection.winner.candidate.target_emotion,
                        "restaurants_mentioned": selection.winner.candidate.restaurants_mentioned,
                        "cities_mentioned": selection.winner.candidate.cities_mentioned,
                        "states_mentioned": selection.winner.candidate.states_mentioned,
                        "food_categories": selection.winner.candidate.food_categories,
                        "holiday_references": selection.winner.candidate.holiday_references,
                        "sports_references": selection.winner.candidate.sports_references,
                        "current_event_references": selection.winner.candidate.current_event_references,
                        "hook_style": selection.winner.candidate.hook_style,
                        "cta_category": selection.winner.candidate.cta_category,
                        "specific_cta": selection.winner.candidate.suggested_cta,
                        "image_style": selection.winner.candidate.visual_style,
                        "image_composition": selection.winner.candidate.image_composition,
                        "hashtags": winner_caption.hashtags,
                    },
                }
                try:
                    persisted_rows["memory"] = [persist_memory_entry(client, infer_memory_entry_from_post(winner_memory_post))]
                except Exception as exc:  # pragma: no cover - defensive guard
                    persistence_succeeded = False
                    log_event(
                        logger,
                        "content_memory_persist_failed",
                        level="warning",
                        run_id=active_run_id,
                        message=str(exc),
                    )
        _write_json(
            output_path,
            {
                "run_id": active_run_id,
                "generated_at": result.generated_at,
                "scheduled_post_type": scheduled_post_type,
                "winner": winner_payload,
                "runner_up": runner_up_payload,
                "all_candidates": persisted_candidates,
                "decision_summary": decision_summary,
            },
        )
        log_event(
            logger,
            "content_saved",
            run_id=active_run_id,
            output_path=output_path,
            candidate_count=len(persisted_candidates),
            persisted_to_db=persistence_attempted and persistence_succeeded,
            dry_run=dry_run,
            model=decision_summary["model_name"],
            token_usage=decision_summary["token_usage"],
            cost_estimate=decision_summary["cost_estimate"],
        )
        log_event(
            logger,
            "candidate_generation_completed",
            run_id=active_run_id,
            stage="content_engine",
            generation_time_ms=int((_utcnow() - started_at).total_seconds() * 1000),
            model=decision_summary["model_name"],
            token_usage=decision_summary["token_usage"],
            cost_estimate=decision_summary["cost_estimate"],
        )
        return ContentDecisionResult(
            run_id=result.run_id,
            generated_at=result.generated_at,
            winner=result.winner,
            runner_up=result.runner_up,
            all_candidates=result.all_candidates,
            decision_summary=result.decision_summary,
            output_path=result.output_path,
            persisted_rows=persisted_rows,
        )


def run_content_decision_engine(
    *,
    snapshot: dict[str, Any],
    external_context: dict[str, Any],
    client: SupabaseClient | None = None,
    logger=None,
    run_id: str | None = None,
    dry_run: bool = True,
    output_path: Path = DEFAULT_DECISION_OUTPUT_PATH,
    scheduled_post_type: str | None = None,
    require_ai_copy: bool = False,
) -> ContentDecisionResult:
    engine = ContentDecisionEngine()
    return engine.run(
        snapshot=snapshot,
        external_context=external_context,
        client=client,
        logger=logger,
        run_id=run_id,
        dry_run=dry_run,
        output_path=output_path,
        scheduled_post_type=scheduled_post_type,
        require_ai_copy=require_ai_copy,
    )
