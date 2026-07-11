from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class ValidationError(ValueError):
    pass


def require_keys(payload: dict[str, Any], keys: tuple[str, ...]) -> None:
    missing = [key for key in keys if key not in payload]
    if missing:
        raise ValidationError(f"Missing required keys: {', '.join(missing)}")


def validate_worker_payload(payload: dict[str, Any], role: str) -> None:
    require_keys(
        payload,
        (
            "role",
            "summary",
            "observed_facts",
            "inferences",
            "evidence_gaps",
            "recommendations",
            "risks",
            "confidence",
            "source_references",
        ),
    )
    if payload["role"] != role:
        raise ValidationError(f"Expected role '{role}', got '{payload['role']}'")
    if not isinstance(payload["recommendations"], list):
        raise ValidationError("recommendations must be a list")
    for recommendation in payload["recommendations"]:
        require_keys(
            recommendation,
            ("id", "title", "problem", "recommendation", "expected_impact", "effort", "risk", "confidence", "metric", "source_references"),
        )


def validate_final_plan(payload: dict[str, Any]) -> None:
    require_keys(
        payload,
        (
            "run_id",
            "evidence_period",
            "chosen_initiatives",
            "rejected_initiatives",
            "prioritization_scores",
            "acceptance_criteria",
            "implementation_tasks",
            "tests",
            "telemetry",
            "risks",
            "rollout",
            "rollback",
            "approval_status",
        ),
    )


def write_markdown_report(payload: dict[str, Any], output_path: Path, *, title: str) -> None:
    lines = [f"# {title}", "", payload.get("summary", "").strip() or "No summary provided.", ""]
    for section_name, key in (
        ("Observed Facts", "observed_facts"),
        ("Inferences", "inferences"),
        ("Evidence Gaps", "evidence_gaps"),
        ("Risks", "risks"),
        ("Source References", "source_references"),
    ):
        values = payload.get(key) or []
        lines.append(f"## {section_name}")
        if values:
            lines.extend(f"- {value}" for value in values)
        else:
            lines.append("- None recorded.")
        lines.append("")

    lines.append("## Recommendations")
    recommendations = payload.get("recommendations") or []
    if recommendations:
        for item in recommendations:
            lines.append(f"### {item['id']}: {item['title']}")
            lines.append(f"- Problem: {item['problem']}")
            lines.append(f"- Recommendation: {item['recommendation']}")
            lines.append(f"- Expected impact: {item['expected_impact']}")
            lines.append(f"- Effort: {item['effort']}")
            lines.append(f"- Risk: {item['risk']}")
            lines.append(f"- Confidence: {item['confidence']}")
            lines.append(f"- Metric: {item['metric']}")
            references = item.get("source_references") or []
            if references:
                lines.append(f"- Sources: {', '.join(references)}")
            lines.append("")
    else:
        lines.append("- None recorded.")
        lines.append("")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))

