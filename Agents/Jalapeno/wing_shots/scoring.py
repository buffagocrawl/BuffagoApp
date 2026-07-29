from __future__ import annotations

from datetime import datetime, timezone
from math import isfinite

from .models import Candidate, CandidateScore


DUPLICATE_REJECTION_THRESHOLD = 0.92


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    numeric = float(value)
    if not isfinite(numeric):
        return low
    return max(low, min(high, numeric))


def safety_exclusions(candidate: Candidate) -> tuple[str, ...]:
    reasons: list[str] = []
    if candidate.status != "approved":
        reasons.append("not_approved")
    if not candidate.human_approved:
        reasons.append("human_approval_required")
    if candidate.moderation_status not in {"likely_acceptable", "overridden"}:
        reasons.append("moderation_not_acceptable")
    if candidate.wing_verification_status not in {"likely_wings", "overridden"}:
        reasons.append("wing_verification_not_acceptable")
    if candidate.unsafe_flags:
        reasons.append("unsafe_content")
    if not candidate.processed_storage_path:
        reasons.append("processed_media_required")
    if candidate.source_media_kind != "community_submission":
        reasons.append("community_source_required")
    if candidate.media_type not in {"photo", "video"}:
        reasons.append("unsupported_media_type")
    if candidate.duplicate_group or (
        candidate.duplicate_probability >= DUPLICATE_REJECTION_THRESHOLD
    ):
        reasons.append("duplicate_content")
    if candidate.previously_selected:
        reasons.append("previously_selected")
    if candidate.previously_posted:
        reasons.append("previously_posted")
    if candidate.withdrawn:
        reasons.append("withdrawn")
    return tuple(reasons)


def score_candidate(
    candidate: Candidate,
    *,
    now: datetime | None = None,
) -> CandidateScore:
    active_now = now or datetime.now(timezone.utc)
    if active_now.tzinfo is None:
        active_now = active_now.replace(tzinfo=timezone.utc)
    created_at = candidate.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    age_days = max(0.0, (active_now - created_at).total_seconds() / 86_400)
    exclusions = safety_exclusions(candidate)

    quality = _clamp(candidate.quality_score / 100.0)
    wing = _clamp(candidate.wing_confidence)
    moderation = _clamp(candidate.moderation_confidence)
    completeness = _clamp(candidate.rating_completeness)
    caption = _clamp(candidate.caption_quality)
    freshness = _clamp(1.0 - age_days / 14.0)
    queue_age = _clamp(age_days / 30.0)
    creator_diversity = 1.0 / (1.0 + max(0, candidate.recent_user_features))
    restaurant_diversity = 1.0 / (
        1.0 + max(0, candidate.recent_destination_features)
    )
    town_diversity = 1.0 / (1.0 + max(0, candidate.recent_town_features))
    style_diversity = 1.0 / (1.0 + max(0, candidate.recent_style_features))
    diversity = (
        creator_diversity * 0.35
        + restaurant_diversity * 0.30
        + town_diversity * 0.20
        + style_diversity * 0.15
    )
    media_mix = 1.0 / (1.0 + max(0, candidate.recent_media_type_features))
    manual_priority = _clamp(candidate.manual_priority / 100.0)
    duplicate_penalty = _clamp(candidate.duplicate_probability) * 25.0

    components = {
        "media_quality": round(quality * 22.0, 3),
        "wing_confidence": round(wing * 16.0, 3),
        "moderation_confidence": round(moderation * 12.0, 3),
        "rating_completeness": round(completeness * 10.0, 3),
        "caption_quality": round(caption * 6.0, 3),
        "freshness": round(freshness * 6.0, 3),
        "queue_age": round(queue_age * 10.0, 3),
        "diversity": round(diversity * 12.0, 3),
        "media_mix": round(media_mix * 3.0, 3),
        "manual_priority": round(manual_priority * 3.0, 3),
        "duplicate_penalty": round(-duplicate_penalty, 3),
    }
    total = round(max(0.0, min(100.0, sum(components.values()))), 3)
    return CandidateScore(
        submission_id=candidate.submission_id,
        total=total,
        eligible=not exclusions,
        components=components,
        exclusions=exclusions,
    )


def rank_candidates(
    candidates: list[Candidate],
    *,
    now: datetime | None = None,
) -> list[tuple[Candidate, CandidateScore]]:
    scored = [
        (candidate, score_candidate(candidate, now=now))
        for candidate in candidates
    ]
    eligible = [item for item in scored if item[1].eligible]
    return sorted(
        eligible,
        key=lambda item: (
            -item[1].total,
            item[0].created_at,
            item[0].submission_id,
        ),
    )
