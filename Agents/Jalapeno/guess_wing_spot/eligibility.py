from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone

from .sources import Snapshot


@dataclass(frozen=True)
class Photo:
    id: str
    destination: dict
    state: dict
    likes: int
    dislikes: int
    neutral: int
    credit: str
    approval: dict


def timestamp(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else None
    except (ValueError, TypeError):
        return None


def verdict(row: dict, counts: dict | None, user: dict | None, unsafe: bool, now: datetime) -> list[str]:
    reasons = []
    if row.get("media_type") != "photo":
        reasons.append("not_photo")
    if not row.get("user_id") or not user or row.get("owner_deleted_at"):
        reasons.append("owner_missing_or_deleted")
    if row.get("withdrawn_at"):
        reasons.append("withdrawn")
    if row.get("status") not in {"approved", "generation_pending", "ready_to_post", "scheduled", "posting", "posted"} or row.get("rejected_at"):
        reasons.append("unsafe_lifecycle_status")
    approved = timestamp(row.get("approved_at"))
    if not approved or approved > now or not row.get("approved_by"):
        reasons.append("verifiable_approval_required")
    consent = timestamp(row.get("consented_at"))
    if not str(row.get("consent_version") or "").strip() or not consent or consent > now:
        reasons.append("valid_recorded_consent_required")
    if row.get("attribution_preference") not in {"anonymous", "username", "display_name"}:
        reasons.append("unsupported_attribution")
    if row.get("moderation_status") not in {"likely_acceptable", "overridden"}:
        reasons.append("moderation_not_acceptable")
    if row.get("wing_verification_status") not in {"likely_wings", "overridden"}:
        reasons.append("wing_verification_not_acceptable")
    if unsafe:
        reasons.append("high_or_critical_abuse_signal")
    if row.get("processed_storage_path") != f"processed/{row['id']}/primary":
        reasons.append("canonical_processed_asset_required")
    values = [counts.get(k) if counts else None for k in ("like_count", "dislike_count", "neutral_count")]
    if any(type(v) is not int or v < 0 for v in values):
        reasons.append("authoritative_votes_missing_or_invalid")
    else:
        likes, dislikes, _ = values
        if likes + dislikes == 0:
            reasons.append("no_positive_or_negative_votes")
        elif likes <= dislikes:
            reasons.append("approval_not_strictly_above_half")
    return reasons


def attribution(row, user) -> str | None:
    if row["attribution_preference"] == "anonymous" or user.get("social_opt_out"):
        return "BuffaGo community"
    key = "display_name" if row["attribution_preference"] == "display_name" else "username"
    value = str(user.get(key) or "").strip().lstrip("@")
    # Never replace a required, missing credit with a made-up identity.
    if not value or len(value) > 70 or re.search(r"[\n\r#@]|https?://", value, re.I):
        return None
    return value


def credit_reveals_answer(credit: str, restaurant: str) -> bool:
    tokens = lambda s: re.findall(r"[a-z0-9]+", s.casefold())
    ignore = {"the", "and", "of", "a", "restaurant", "bar", "grill", "tavern", "pizza", "wings", "company"}
    names = [t for t in tokens(restaurant) if t not in ignore and len(t) >= 3]
    compact = "".join(tokens(credit))
    return any(t in compact for t in names) if names else False


def eligible_photos(snapshot: Snapshot, available, *, now=None):
    now = now or datetime.now(timezone.utc)
    result, excluded = [], Counter()
    for row in sorted(snapshot.photos, key=lambda p: p["id"]):
        user = snapshot.users.get(row.get("user_id"))
        counts = snapshot.votes.get(row["id"])
        reasons = verdict(row, counts, user, row["id"] in snapshot.unsafe, now)
        if reasons:
            excluded.update(reasons)
            continue
        destination = snapshot.destinations.get(row["destination_id"])
        state = snapshot.states.get(str((destination or {}).get("state_id")))
        if not destination or not state:
            excluded["restaurant_or_state_missing"] += 1
            continue
        credit = attribution(row, user)
        if not credit or credit_reveals_answer(credit, destination["name"]):
            excluded["attribution_missing_or_answer_clue"] += 1
            continue
        if not available(row["id"]):
            excluded["processed_asset_unavailable"] += 1
            continue
        result.append(Photo(row["id"], destination, state, counts["like_count"], counts["dislike_count"],
                            counts["neutral_count"], credit,
                            {"status": row["status"], "approved_at": row["approved_at"],
                             "recorded_approver_present": True, "consent_version": row["consent_version"],
                             "consented_at": row["consented_at"], "attribution_preference": row["attribution_preference"],
                             "moderation_status": row["moderation_status"],
                             "wing_verification_status": row["wing_verification_status"]}))
    return result, dict(excluded)
