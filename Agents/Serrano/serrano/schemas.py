from __future__ import annotations

from dataclasses import dataclass
from typing import Any


READ_ONLY = "read-only"
WRITE_ALLOWED = "workspace-write"


@dataclass(frozen=True, slots=True)
class WorkerSpec:
    name: str
    prompt_file: str
    phase: str
    mode: str
    summary: str
    report_kind: str = "analysis"


@dataclass(frozen=True, slots=True)
class WorkerResult:
    status: str
    payload: dict[str, Any]
    stdout: str
    stderr: str
    prompt_hash: str
    input_hash: str


def strict_object_schema(*, properties: dict[str, Any], required: list[str] | tuple[str, ...]) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": list(required),
        "properties": properties,
    }


def worker_output_schema(role_name: str) -> dict[str, Any]:
    recommendation_properties = {
        "id": {"type": "string"},
        "title": {"type": "string"},
        "problem": {"type": "string"},
        "recommendation": {"type": "string"},
        "expected_impact": {"type": "string"},
        "effort": {"type": "string"},
        "risk": {"type": "string"},
        "confidence": {"type": "string"},
        "metric": {"type": "string"},
        "source_references": {"type": "array", "items": {"type": "string"}},
    }
    return strict_object_schema(
        required=[
            "role",
            "summary",
            "observed_facts",
            "inferences",
            "evidence_gaps",
            "recommendations",
            "risks",
            "confidence",
            "source_references",
            "panel_review",
        ],
        properties={
            "role": {"type": "string", "const": role_name},
            "summary": {"type": "string"},
            "observed_facts": {"type": "array", "items": {"type": "string"}},
            "inferences": {"type": "array", "items": {"type": "string"}},
            "evidence_gaps": {"type": "array", "items": {"type": "string"}},
            "recommendations": {
                "type": "array",
                "items": strict_object_schema(
                    required=[
                        "id",
                        "title",
                        "problem",
                        "recommendation",
                        "expected_impact",
                        "effort",
                        "risk",
                        "confidence",
                        "metric",
                        "source_references",
                    ],
                    properties=recommendation_properties,
                ),
            },
            "risks": {"type": "array", "items": {"type": "string"}},
            "confidence": {"type": "string"},
            "source_references": {"type": "array", "items": {"type": "string"}},
            "panel_review": strict_object_schema(
                required=["overall_score", "evidence_coverage_percentage", "confidence_level", "release_recommendation"],
                properties={
                    "overall_score": {"type": "number", "minimum": 0, "maximum": 100},
                    "evidence_coverage_percentage": {"type": "number", "minimum": 0, "maximum": 100},
                    "confidence_level": {"type": "string"},
                    "release_recommendation": {"type": "string"},
                },
            ),
        },
    )


def caio_output_schema() -> dict[str, Any]:
    dimension = strict_object_schema(
        required=["dimension", "score", "evidence_references"],
        properties={"dimension": {"type": "string"}, "score": {"type": "number", "minimum": 0, "maximum": 100}, "evidence_references": {"type": "array", "items": {"type": "string"}}},
    )
    finding = strict_object_schema(
        required=["title", "evidence_status", "evidence_reference", "why", "severity", "recommended_remediation", "release_blocking"],
        properties={
            "title": {"type": "string"}, "evidence_status": {"type": "string", "enum": ["CONFIRMED", "INFERRED", "SUSPECTED", "BLOCKED", "NOT_APPLICABLE"]},
            "evidence_reference": {"type": "string"}, "why": {"type": "string"}, "severity": {"type": "string"},
            "recommended_remediation": {"type": "string"}, "release_blocking": {"type": "boolean"},
        },
    )
    return strict_object_schema(
        required=["role", "summary", "dimension_scores", "overall_score", "evidence_coverage_percentage", "confidence_level", "release_recommendation", "top_strengths", "top_concerns", "confirmed_defects", "suspected_risks", "blocked_validations", "required_remediation", "findings", "source_references"],
        properties={
            "role": {"type": "string", "const": "chief_ai_officer"}, "summary": {"type": "string"}, "dimension_scores": {"type": "array", "items": dimension},
            "overall_score": {"type": "number", "minimum": 0, "maximum": 100}, "evidence_coverage_percentage": {"type": "number", "minimum": 0, "maximum": 100},
            "confidence_level": {"type": "string"}, "release_recommendation": {"type": "string"},
            "top_strengths": {"type": "array", "items": {"type": "string"}}, "top_concerns": {"type": "array", "items": {"type": "string"}},
            "confirmed_defects": {"type": "array", "items": {"type": "string"}}, "suspected_risks": {"type": "array", "items": {"type": "string"}},
            "blocked_validations": {"type": "array", "items": {"type": "string"}}, "required_remediation": {"type": "array", "items": {"type": "string"}},
            "findings": {"type": "array", "items": finding}, "source_references": {"type": "array", "items": {"type": "string"}},
        },
    )


def final_plan_schema() -> dict[str, Any]:
    initiative_schema = strict_object_schema(
        required=["id", "title"],
        properties={
            "id": {"type": "string"},
            "title": {"type": "string"},
        },
    )
    prioritization_schema = strict_object_schema(
        required=["id", "priority_score"],
        properties={
            "id": {"type": "string"},
            "priority_score": {"type": "number"},
        },
    )
    return strict_object_schema(
        required=[
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
        ],
        properties={
            "run_id": {"type": "string"},
            "evidence_period": {"type": "string"},
            "chosen_initiatives": {"type": "array", "items": initiative_schema},
            "rejected_initiatives": {"type": "array", "items": initiative_schema},
            "prioritization_scores": {"type": "array", "items": prioritization_schema},
            "acceptance_criteria": {"type": "array", "items": {"type": "string"}},
            "implementation_tasks": {"type": "array", "items": {"type": "string"}},
            "tests": {"type": "array", "items": {"type": "string"}},
            "telemetry": {"type": "array", "items": {"type": "string"}},
            "risks": {"type": "array", "items": {"type": "string"}},
            "rollout": {"type": "array", "items": {"type": "string"}},
            "rollback": {"type": "array", "items": {"type": "string"}},
            "approval_status": {"type": "string"},
        },
    )


WAVE_1 = (
    WorkerSpec("growth_analyst", "growth_analyst.md", "wave_1", READ_ONLY, "Analyze Buffago engagement and product usage."),
    WorkerSpec("marketing_analyst", "marketing_analyst.md", "wave_1", READ_ONLY, "Analyze Jalapeno and Buffago marketing activity."),
    WorkerSpec("customer_advocate", "customer_advocate.md", "wave_1", READ_ONLY, "Review Buffago from a skeptical customer perspective."),
)

WAVE_2 = (
    WorkerSpec("ceo_strategy_review", "ceo_strategy_review.md", "wave_2", READ_ONLY, "Evaluate strategic focus and differentiation."),
    WorkerSpec("cto_feasibility_review", "cto_feasibility_review.md", "wave_2", READ_ONLY, "Evaluate engineering feasibility and architecture fit."),
    WorkerSpec("caio_data_review", "caio_data_review.md", "wave_2", READ_ONLY, "Evaluate AI, data, privacy, and measurement needs."),
)

WAVE_3 = (
    WorkerSpec("ceo_final_review", "ceo_final_review.md", "wave_3", READ_ONLY, "Review refined roadmap for executive focus."),
    WorkerSpec("cfo_business_review", "cfo_business_review.md", "wave_3", READ_ONLY, "Review cost, ROI, and downside."),
    WorkerSpec("caio_feedback_loop_review", "caio_feedback_loop_review.md", "wave_3", READ_ONLY, "Review feedback loop and measurement design."),
    WorkerSpec("chief_ai_officer", "chief_ai_officer.md", "wave_3", READ_ONLY, "Independently review AI architecture, evidence, safety, and AI-slop risk."),
)

SYNTHESIS_1 = WorkerSpec("product_manager_discovery", "product_manager_discovery.md", "synthesis_1", READ_ONLY, "Synthesize discovery wave outputs.")
SYNTHESIS_2 = WorkerSpec("product_manager_refinement", "product_manager_refinement.md", "synthesis_2", READ_ONLY, "Refine roadmap after strategic review.")
FINAL_PLAN = WorkerSpec("product_manager_final", "product_manager_final.md", "final_product_plan", READ_ONLY, "Produce the final scoped plan.")
IMPLEMENTATION = WorkerSpec("implementation_agent", "implementation_agent.md", "implementation", WRITE_ALLOWED, "Implement the approved scope.", report_kind="implementation")
SECURITY = WorkerSpec("security_red_team", "security_red_team.md", "security_review", WRITE_ALLOWED, "Review the implementation for security issues.", report_kind="security")
VERIFICATION = WorkerSpec("product_manager_verification", "product_manager_verification.md", "verification", READ_ONLY, "Verify delivery against the approved plan.", report_kind="verification")
RELEASE_NOTES = WorkerSpec("release_notes", "release_notes.md", "release_notes", READ_ONLY, "Write internal and user-facing release notes.", report_kind="release")
