from __future__ import annotations

import re
from typing import Any

from .contracts import ENVIRONMENTS, ContractError

QA_IDENTITY = re.compile(r"^cayenne-[a-z0-9][a-z0-9._-]*@qa\.buffago\.test$")
ALLOWED_FIXTURES = {
    "qa_reset_user", "qa_seed_new_user", "qa_seed_returning_user", "qa_seed_nearby_restaurants",
    "qa_seed_active_crawl", "qa_seed_completed_crawl", "qa_seed_fresh_streak", "qa_seed_continued_streak",
    "qa_seed_broken_streak", "qa_seed_pending_referral", "qa_seed_accepted_referral", "qa_seed_invalid_referral",
    "qa_seed_self_referral_case", "qa_seed_buffaverse_locked", "qa_seed_buffaverse_eligible", "qa_seed_buffaverse_progress",
    "qa_seed_notification_state", "qa_seed_rating_eligible", "qa_seed_rating_cooldown",
}


def validate_fixture_request(environment: str, fixture: str, user_email: str) -> dict[str, Any]:
    if environment not in ENVIRONMENTS:
        raise ContractError("fixture operations are blocked outside non-production environments")
    if fixture not in ALLOWED_FIXTURES:
        raise ContractError(f"fixture is not allowlisted: {fixture}")
    if not QA_IDENTITY.fullmatch(user_email.lower()):
        raise ContractError("fixture users must use cayenne-*@qa.buffago.test identities")
    return {"environment": environment, "fixture": fixture, "user_email": user_email.lower(), "arbitrary_sql": False, "auditable": True}

