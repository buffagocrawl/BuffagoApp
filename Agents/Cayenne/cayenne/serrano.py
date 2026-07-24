from __future__ import annotations

from typing import Any

from .contracts import DECISIONS, ContractError, validate_result


FEATURE_JOURNEYS = {
    "buffaverse": ["buffaverse-eligible-entry", "buffaverse-locked-entry"],
    "rating": ["rating-submit"],
    "referrals": ["referral-pending-acceptance"],
    "streak": ["daily-streak-claim"],
    "crawl": ["crawl-resume"],
    "notifications": ["notification-entry"],
    "wingdex": ["wingdex-returning-user"],
}


def journeys_for_features(features: list[str]) -> list[str]:
    selected: list[str] = []
    for feature in features:
        for journey in FEATURE_JOURNEYS.get(feature.lower(), []):
            if journey not in selected:
                selected.append(journey)
    return selected or ["launch-smoke"]


def ingest_result(result: dict[str, Any], required_journeys: list[str] | None = None) -> dict[str, Any]:
    result = validate_result(result)
    required = required_journeys or result.get("required_journeys", [])
    present = {item.get("journey_id") for item in result.get("journeys", [])}
    missing = sorted(set(required) - present)
    failed = [item for item in result.get("journeys", []) if item.get("status") == "failed"]
    infra = result.get("infrastructure_incidents", [])
    if missing or result.get("missing_evidence"):
        decision = "INSUFFICIENT_EVIDENCE"
    elif infra and result.get("status") != "passed":
        decision = "TEST_INFRASTRUCTURE_FAILURE"
    elif failed:
        decision = "CHANGES_REQUIRED"
    elif result.get("status") == "passed":
        decision = "APPROVED"
    else:
        decision = "INSUFFICIENT_EVIDENCE"
    return {"run_id": result["run_id"], "tested_commit": result["tested_commit"], "decision": decision, "missing_journeys": missing, "failed_journeys": [item.get("journey_id") for item in failed], "blocking_findings": result.get("failures", []), "accepted_risks": [], "rerun_scope": "journey" if failed else "complete", "ingested_at": result.get("finished_at")}


def validate_decision(decision: str) -> str:
    if decision not in DECISIONS:
        raise ContractError(f"unsupported Serrano decision: {decision}")
    return decision
