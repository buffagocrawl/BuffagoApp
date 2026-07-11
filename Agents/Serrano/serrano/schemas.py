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


def worker_output_schema(role_name: str) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "role",
            "summary",
            "observed_facts",
            "inferences",
            "evidence_gaps",
            "recommendations",
            "risks",
            "confidence",
            "source_references",
        ],
        "properties": {
            "role": {"type": "string", "const": role_name},
            "summary": {"type": "string"},
            "observed_facts": {"type": "array", "items": {"type": "string"}},
            "inferences": {"type": "array", "items": {"type": "string"}},
            "evidence_gaps": {"type": "array", "items": {"type": "string"}},
            "recommendations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": True,
                    "required": [
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
                    "properties": {
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
                    },
                },
            },
            "risks": {"type": "array", "items": {"type": "string"}},
            "confidence": {"type": "string"},
            "source_references": {"type": "array", "items": {"type": "string"}},
        },
    }


def final_plan_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": True,
        "required": [
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
        "properties": {
            "run_id": {"type": "string"},
            "evidence_period": {"type": "string"},
            "chosen_initiatives": {"type": "array", "items": {"type": "object"}},
            "rejected_initiatives": {"type": "array", "items": {"type": "object"}},
            "prioritization_scores": {"type": "array", "items": {"type": "object"}},
            "acceptance_criteria": {"type": "array", "items": {"type": "string"}},
            "implementation_tasks": {"type": "array", "items": {"type": "string"}},
            "tests": {"type": "array", "items": {"type": "string"}},
            "telemetry": {"type": "array", "items": {"type": "string"}},
            "risks": {"type": "array", "items": {"type": "string"}},
            "rollout": {"type": "array", "items": {"type": "string"}},
            "rollback": {"type": "array", "items": {"type": "string"}},
            "approval_status": {"type": "string"},
        },
    }


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
)

SYNTHESIS_1 = WorkerSpec("product_manager_discovery", "product_manager_discovery.md", "synthesis_1", READ_ONLY, "Synthesize discovery wave outputs.")
SYNTHESIS_2 = WorkerSpec("product_manager_refinement", "product_manager_refinement.md", "synthesis_2", READ_ONLY, "Refine roadmap after strategic review.")
FINAL_PLAN = WorkerSpec("product_manager_final", "product_manager_final.md", "final_product_plan", READ_ONLY, "Produce the final scoped plan.")
IMPLEMENTATION = WorkerSpec("implementation_agent", "implementation_agent.md", "implementation", WRITE_ALLOWED, "Implement the approved scope.", report_kind="implementation")
SECURITY = WorkerSpec("security_red_team", "security_red_team.md", "security_review", WRITE_ALLOWED, "Review the implementation for security issues.", report_kind="security")
VERIFICATION = WorkerSpec("product_manager_verification", "product_manager_verification.md", "verification", READ_ONLY, "Verify delivery against the approved plan.", report_kind="verification")
RELEASE_NOTES = WorkerSpec("release_notes", "release_notes.md", "release_notes", READ_ONLY, "Write internal and user-facing release notes.", report_kind="release")

