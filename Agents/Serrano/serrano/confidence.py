"""Independent, evidence-aware confidence reporting for Serrano.

This module deliberately keeps release approval separate from product-experience
and retention hypotheses.  A numeric result is never an approval mechanism.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Iterable


class EvidenceMaturity(StrEnum):
    CONTRACT_ONLY = "Contract only"
    SIMULATED_RUNTIME = "Simulated runtime"
    EMULATOR_VALIDATED = "Emulator validated"
    PHYSICAL_DEVICE_VALIDATED = "Physical-device validated"
    LIVE_NON_PRODUCTION_VALIDATED = "Live non-production validated"
    PRODUCTION_OBSERVED = "Production observed"


class ReleaseGate(StrEnum):
    PASS = "PASS"
    CONDITIONAL = "CONDITIONAL"
    BLOCKED = "BLOCKED"
    NOT_SCORABLE = "NOT SCORABLE"


RELEASE_CATEGORIES = (
    "Authentication reliability", "Authorization and RLS", "Data integrity",
    "Reward idempotency", "Streak concurrency", "Account deletion",
    "Notification delivery", "Notification deep links", "Build and export health",
    "Automated regression health", "Device and platform validation",
    "Security and secret handling", "Database migration readiness",
    "Monitoring and observability", "Rollback readiness", "Failure recovery",
)
APP_EXPERIENCE_CATEGORIES = (
    "Value-proposition clarity", "Onboarding comprehension", "Time to first meaningful action",
    "Navigation clarity", "Primary-action visibility", "Rating-flow simplicity", "Home-screen hierarchy",
    "Wing discovery", "Crawl comprehension", "Streak comprehension", "Mission comprehension",
    "Passport comprehension", "Buffaverse comprehension", "Referral comprehension", "Social comprehension",
    "Loading states", "Empty states", "Error recovery", "Interruption recovery", "Accessibility",
    "Perceived performance", "Visual consistency", "Mascot usefulness", "Cross-feature coherence",
    "Low-attention usability",
)
RETENTION_CATEGORIES = (
    "Activation strength", "First-rating payoff", "Clarity of next action", "Daily reason to return",
    "Streak motivation", "Mission motivation", "Notification usefulness", "Reward satisfaction",
    "Passport collection appeal", "Buffaverse progression appeal", "Crawl repeatability", "Social motivation",
    "Referral motivation", "Progress persistence", "Re-engagement quality", "Habit formation",
    "Seven-day return intent", "D1 retention", "D7 retention", "D30 retention",
)

RELEASE_JUDGES = frozenset({"CEO", "QA", "Security", "Mobile", "Data/Supabase", "Reliability", "CTO", "CAIO"})
APP_JUDGES = frozenset({"CEO", "CMO", "VP Growth", "UX Designer", "Game Psychologist", "College User", "Casual Golfer"})
RETENTION_JUDGES = frozenset({"CEO", "CMO", "VP Growth", "Game Psychologist", "College User", "Casual Golfer", "Product Manager"})

RELEASE_BLOCKERS = frozenset({
    "Confirmed P0", "Confirmed unresolved P1", "Active exposed credential",
    "Uncontained historical credential with unknown active status", "Authentication failure on the intended release platform",
    "Unauthorized cross-user data access", "Duplicate trusted reward", "Broken account deletion",
    "Required migration not validated", "Primary onboarding journey cannot complete",
    "Required notification behavior creates a privacy or routing risk", "Required platform build cannot be produced",
})


@dataclass(frozen=True, slots=True)
class CategoryScore:
    category: str
    score: float | None
    evidence: tuple[str, ...] = ()
    maturity: EvidenceMaturity = EvidenceMaturity.CONTRACT_ONLY
    judge: str | None = None
    weight: float = 1.0

    def __post_init__(self) -> None:
        if self.score is not None and not 0 <= self.score <= 100:
            raise ValueError("category scores must be between 0 and 100")
        if self.weight <= 0:
            raise ValueError("category weights must be positive")


@dataclass(frozen=True, slots=True)
class ConfidenceReport:
    model: str
    score: float | None
    evidence_coverage: float
    maturity: EvidenceMaturity | None
    status: str
    hard_blockers: tuple[str, ...] = ()
    not_scorable: tuple[str, ...] = ()
    score_movement: float | None = None
    evidence_ceiling: int | None = None
    ceiling_reason: str | None = None


def calculate_confidence(model: str, categories: Iterable[CategoryScore], *, total_categories: int, previous_score: float | None = None,
                         hard_blockers: Iterable[str] = (), retention_evidence: str | None = None) -> ConfidenceReport:
    """Calculate a score without converting absent evidence into a zero."""
    values = tuple(categories)
    if total_categories <= 0:
        raise ValueError("total_categories must be positive")
    scorable = [item for item in values if item.score is not None]
    not_scorable = tuple(item.category for item in values if item.score is None)
    coverage = round((len(scorable) / total_categories) * 100, 1)
    raw_score = None if not scorable else round(sum(item.score * item.weight for item in scorable) / sum(item.weight for item in scorable), 1)
    blockers = tuple(dict.fromkeys(hard_blockers))
    ceiling, reason = retention_ceiling(retention_evidence) if model == "User Retention Confidence" else (None, None)
    score = min(raw_score, ceiling) if raw_score is not None and ceiling is not None else raw_score
    maturity = min((item.maturity for item in scorable), default=None, key=lambda value: list(EvidenceMaturity).index(value))
    if model == "Release Confidence":
        status = ReleaseGate.BLOCKED if blockers else (ReleaseGate.NOT_SCORABLE if raw_score is None else ReleaseGate.PASS)
    else:
        status = "NOT SCORABLE" if raw_score is None else ("HYPOTHESIS ONLY" if ceiling and ceiling <= 70 else "EVIDENCE-BACKED")
    return ConfidenceReport(model, score, coverage, maturity, str(status), blockers, not_scorable,
                            None if previous_score is None or score is None else round(score - previous_score, 1), ceiling, reason)


def retention_ceiling(evidence: str | None) -> tuple[int, str]:
    levels = {
        None: (65, "No real users or behavioral data"),
        "none": (65, "No real users or behavioral data"),
        "internal": (70, "Internal testers only"),
        "external_under_10": (75, "Fewer than 10 external beta users"),
        "d1_10_plus": (80, "At least 10 external users with D1 evidence"),
        "d7": (90, "D7 cohort evidence available"),
        "d30": (100, "Reliable D30 cohort evidence available"),
    }
    if evidence not in levels:
        raise ValueError(f"Unknown retention evidence level: {evidence}")
    return levels[evidence]


def can_approve_release(report: ConfidenceReport) -> bool:
    """Only the release gate may approve a release; blended or other scores cannot."""
    return report.model == "Release Confidence" and report.status == ReleaseGate.PASS and not report.hard_blockers


def render_confidence_card(report: ConfidenceReport, *, reviewed_at: str, largest_blocker: str, largest_opportunity: str) -> str:
    """Render the common dashboard card used by generated Serrano artifacts."""
    score = "Not Scorable" if report.score is None else f"{report.score:.1f}/100"
    maturity = report.maturity.value if report.maturity else "Not Scorable"
    lines = [
        f"# {report.model}", "", f"Score: **{score}**", f"Evidence coverage: **{report.evidence_coverage:.1f}%**",
        f"{'Gate status' if report.model == 'Release Confidence' else 'Status'}: **{report.status}**", f"Evidence maturity: **{maturity}**",
        f"Trend: **{'New baseline' if report.score_movement is None else f'{report.score_movement:+.1f}'}**",
        f"Largest blocker: {largest_blocker}", f"Largest opportunity: {largest_opportunity}", f"Review timestamp: {reviewed_at}",
    ]
    if report.evidence_ceiling is not None:
        lines.append(f"Evidence ceiling: **{report.evidence_ceiling}** — {report.ceiling_reason}")
    if report.hard_blockers:
        lines.extend(["", "## Hard blockers", *[f"- {item}" for item in report.hard_blockers]])
    if report.not_scorable:
        lines.extend(["", "## Not Scorable", *[f"- {item}" for item in report.not_scorable]])
    return "\n".join(lines) + "\n"
