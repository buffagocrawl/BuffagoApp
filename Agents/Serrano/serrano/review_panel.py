"""Canonical, evidence-backed Serrano product-review panel."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping
import json


EVIDENCE_STATUSES = frozenset({"CONFIRMED", "INFERRED", "SUSPECTED", "BLOCKED", "NOT_APPLICABLE"})
CAIO_DIMENSIONS = (
    "AI Architecture and Wiring", "Prompt and Agent Quality", "Reliability and Determinism",
    "AI Safety and Guardrails", "Security and Privacy", "Cost and Operational Efficiency",
    "Maintainability", "Product and User Value", "Evidence Quality", "AI-Slop Resistance",
)


@dataclass(frozen=True, slots=True)
class PanelReviewer:
    identifier: str
    name: str
    worker_name: str
    mission: str


# This is the sole membership source for executable Serrano review reports.  The
# existing specialized workers remain intact; the dedicated CAIO is additive.
PANEL_REVIEWERS = (
    PanelReviewer("growth_analyst", "Growth Analyst", "growth_analyst", "Assess measurable growth and engagement evidence."),
    PanelReviewer("marketing_analyst", "Marketing Analyst", "marketing_analyst", "Assess marketing evidence and claims."),
    PanelReviewer("customer_advocate", "Customer Advocate", "customer_advocate", "Represent skeptical customer value and trust."),
    PanelReviewer("ceo_strategy_review", "CEO", "ceo_strategy_review", "Assess strategic focus and differentiation."),
    PanelReviewer("cto_feasibility_review", "CTO", "cto_feasibility_review", "Assess architecture and engineering feasibility."),
    PanelReviewer("ceo_final_review", "CEO Final Review", "ceo_final_review", "Assess the refined roadmap."),
    PanelReviewer("cfo_business_review", "CFO", "cfo_business_review", "Assess cost, ROI, and downside."),
    PanelReviewer("chief_ai_officer", "Chief AI Officer", "chief_ai_officer", "Ensure AI is intentional, safe, reliable, maintainable, and evidence-backed."),
)

_REVIEWERS_BY_ID = {reviewer.identifier: reviewer for reviewer in PANEL_REVIEWERS}
if len(_REVIEWERS_BY_ID) != len(PANEL_REVIEWERS):
    raise RuntimeError("Serrano panel reviewer identifiers must be unique.")


def panel_reviewer_count() -> int:
    return len(PANEL_REVIEWERS)


def panel_reviewer(identifier: str) -> PanelReviewer:
    return _REVIEWERS_BY_ID[identifier]


def validate_caio_payload(payload: Mapping[str, Any]) -> None:
    required = {
        "role", "summary", "dimension_scores", "overall_score", "evidence_coverage_percentage",
        "confidence_level", "release_recommendation", "top_strengths", "top_concerns", "confirmed_defects",
        "suspected_risks", "blocked_validations", "required_remediation", "findings", "source_references",
    }
    missing = required - payload.keys()
    if missing:
        raise ValueError(f"CAIO payload missing required keys: {', '.join(sorted(missing))}")
    if payload["role"] != "chief_ai_officer":
        raise ValueError("CAIO payload role must be 'chief_ai_officer'")
    dimensions = payload["dimension_scores"]
    if not isinstance(dimensions, list) or {item.get("dimension") for item in dimensions} != set(CAIO_DIMENSIONS):
        raise ValueError("CAIO dimension_scores must include every required dimension exactly once")
    for item in dimensions:
        if not isinstance(item.get("score"), (int, float)) or not 0 <= item["score"] <= 100:
            raise ValueError("CAIO dimension scores must be 0-100")
    for score in (payload["overall_score"], payload["evidence_coverage_percentage"]):
        if not isinstance(score, (int, float)) or not 0 <= score <= 100:
            raise ValueError("CAIO overall score and evidence coverage must be 0-100")
    for finding in payload["findings"]:
        if finding.get("evidence_status") not in EVIDENCE_STATUSES:
            raise ValueError("CAIO findings must use a supported evidence status")
        for key in ("title", "evidence_reference", "why", "severity", "recommended_remediation"):
            if not finding.get(key):
                raise ValueError(f"CAIO finding missing {key}")


def caio_is_release_blocking(payload: Mapping[str, Any]) -> bool:
    if payload.get("release_recommendation") == "DO NOT RELEASE":
        return True
    return any(
        finding.get("evidence_status") == "CONFIRMED" and finding.get("release_blocking") is True
        for finding in payload.get("findings", [])
    )


def build_panel_report(results: Mapping[str, Mapping[str, Any]], *, historical: bool = False) -> dict[str, Any]:
    """Aggregate only present, valid scores; missing current reviewers are incomplete."""
    expected = tuple(reviewer.identifier for reviewer in PANEL_REVIEWERS)
    present = tuple(identifier for identifier in expected if identifier in results)
    missing = () if historical else tuple(identifier for identifier in expected if identifier not in results)
    scores: list[float] = []
    rows: list[dict[str, Any]] = []
    for identifier in present:
        payload = results[identifier]
        score = payload.get("overall_score") if identifier == "chief_ai_officer" else payload.get("panel_review", {}).get("overall_score")
        coverage = payload.get("evidence_coverage_percentage") if identifier == "chief_ai_officer" else payload.get("panel_review", {}).get("evidence_coverage_percentage")
        if isinstance(score, (int, float)):
            scores.append(float(score))
        rows.append({"identifier": identifier, "name": panel_reviewer(identifier).name, "score": score, "evidence_coverage_percentage": coverage, "completed": True})
    for identifier in missing:
        rows.append({"identifier": identifier, "name": panel_reviewer(identifier).name, "score": None, "evidence_coverage_percentage": None, "completed": False})
    average = round(sum(scores) / len(scores), 1) if scores else None
    coverage_values = [row["evidence_coverage_percentage"] for row in rows if isinstance(row["evidence_coverage_percentage"], (int, float))]
    coverage = round(sum(coverage_values) / len(coverage_values), 1) if coverage_values else 0.0
    caio = results.get("chief_ai_officer")
    caio_blocked = bool(caio and caio_is_release_blocking(caio))
    disposition = "DO NOT RELEASE" if caio_blocked else ("INCOMPLETE" if missing else "REVIEW COMPLETE")
    return {
        "schema_version": 1,
        "historical": historical,
        "expected_reviewer_count": panel_reviewer_count() if not historical else len(present),
        "completed_reviewer_count": len(present),
        "missing_reviewers": list(missing),
        "complete": not missing,
        "overall_score": average,
        "evidence_coverage_percentage": coverage,
        "disposition": disposition,
        "reviewers": rows,
    }


def write_panel_artifacts(results: Mapping[str, Mapping[str, Any]], artifact_dir: Path, *, historical: bool = False) -> dict[str, Path]:
    report = build_panel_report(results, historical=historical)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    json_path = artifact_dir / "panel-review.json"
    markdown_path = artifact_dir / "panel-review.md"
    json_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    overall_score = "Not Scorable" if report["overall_score"] is None else f"{report['overall_score']:.1f}/100"
    lines = ["# Serrano Product Review Panel", "", f"Disposition: **{report['disposition']}**", f"Completion: **{report['completed_reviewer_count']}/{report['expected_reviewer_count']}**", f"Overall score: **{overall_score}**", f"Evidence coverage: **{report['evidence_coverage_percentage']:.1f}%**", "", "| Reviewer | Score | Evidence coverage | Status |", "| --- | ---: | ---: | --- |"]
    for row in report["reviewers"]:
        score = "Not Scorable" if row["score"] is None else f"{row['score']:.1f}"
        coverage = "—" if row["evidence_coverage_percentage"] is None else f"{row['evidence_coverage_percentage']:.1f}%"
        lines.append(f"| {row['name']} | {score} | {coverage} | {'completed' if row['completed'] else 'missing'} |")
    if report["missing_reviewers"]:
        lines.extend(["", "## Incomplete reviewers", *[f"- `{identifier}`" for identifier in report["missing_reviewers"]]])
    markdown_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return {"panel-review.json": json_path, "panel-review.md": markdown_path}
