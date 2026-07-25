from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .logging_config import log_event
from .run_state import stable_hash
from .schemas import WorkerResult


@dataclass(frozen=True, slots=True)
class CodexRequest:
    name: str
    role_name: str
    prompt_text: str
    input_payload: dict[str, Any]
    schema: dict[str, Any]
    output_json_path: Path
    mode: str
    timeout_seconds: int
    model: str
    reasoning_level: str


class CodexRunner:
    def __init__(self, *, repo_root: Path, command: list[str] | None, dry_run_mode: bool, retry_count: int, logger=None) -> None:
        self.repo_root = repo_root
        self.command = command
        self.dry_run_mode = dry_run_mode
        self.retry_count = retry_count
        self.logger = logger

    def execute(self, request: CodexRequest) -> WorkerResult:
        prompt_hash = stable_hash({"prompt": request.prompt_text, "schema": request.schema})
        input_hash = stable_hash(request.input_payload)
        if self.dry_run_mode:
            payload = self._mock_payload(request)
            request.output_json_path.parent.mkdir(parents=True, exist_ok=True)
            request.output_json_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
            return WorkerResult("completed", payload, "", "", prompt_hash, input_hash)
        if not self.command:
            raise RuntimeError("Codex command is not available and dry-run mode is disabled.")
        schema_path = request.output_json_path.parent.parent / "schemas" / f"{request.name}.schema.json"
        schema_path.parent.mkdir(parents=True, exist_ok=True)
        schema_path.write_text(json.dumps(request.schema, indent=2, sort_keys=True) + "\n", encoding="utf-8")

        attempt = 0
        stdout = ""
        stderr = ""
        while attempt <= self.retry_count:
            attempt += 1
            command = list(self.command)
            sandbox = "read-only" if request.mode == "read-only" else "workspace-write"
            command.extend(["-C", str(self.repo_root), "-s", sandbox, "--skip-git-repo-check", "--output-schema", str(schema_path), "-o", str(request.output_json_path)])
            if request.model:
                command.extend(["-m", request.model])
            command.append("-")
            log_event(self.logger, "codex_worker_started", worker=request.name, attempt=attempt, sandbox=sandbox)
            completed = subprocess.run(
                command,
                input=self._compose_prompt(request),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
                timeout=request.timeout_seconds,
                cwd=self.repo_root,
            )
            stdout = completed.stdout
            stderr = completed.stderr
            if completed.returncode == 0 and request.output_json_path.exists():
                payload = json.loads(request.output_json_path.read_text(encoding="utf-8"))
                return WorkerResult("completed", payload, stdout, stderr, prompt_hash, input_hash)
        raise RuntimeError(f"Codex worker '{request.name}' failed after {self.retry_count + 1} attempt(s): {stderr or stdout}")

    def _compose_prompt(self, request: CodexRequest) -> str:
        return (
            f"{request.prompt_text.strip()}\n\n"
            f"Reasoning level: {request.reasoning_level}\n"
            "Return JSON only matching the provided schema.\n"
            "Use only the supplied evidence. If evidence is missing, state that clearly.\n\n"
            "If you create repository-level evidence or auxiliary Markdown, place it under evidence/; do not create new Markdown files at the repository root.\n\n"
            "<input>\n"
            f"{json.dumps(request.input_payload, indent=2, sort_keys=True, default=str)}\n"
            "</input>\n"
        )

    def _mock_payload(self, request: CodexRequest) -> dict[str, Any]:
        summary = f"Dry-run output for {request.role_name.replace('_', ' ')}."
        recommendation = {
            "id": f"{request.name}-01",
            "title": f"{request.role_name.replace('_', ' ').title()} recommendation",
            "problem": "Available evidence indicates a measurable product or process gap.",
            "recommendation": "Run a focused experiment with explicit instrumentation and rollback criteria.",
            "expected_impact": "Improved clarity on product direction with bounded cost.",
            "effort": "medium",
            "risk": "low",
            "confidence": "medium",
            "metric": "activation_rate",
            "source_references": ["evidence/evidence_manifest.json"],
        }
        if request.role_name == "product_manager_final":
            return {
                "run_id": request.input_payload.get("run_id", "dry-run"),
                "evidence_period": "latest available repository evidence",
                "chosen_initiatives": [{"id": "pm-now-01", "title": "Instrument the rating funnel"}],
                "rejected_initiatives": [{"id": "pm-reject-01", "title": "Unbounded AI personalization"}],
                "prioritization_scores": [{"id": "pm-now-01", "priority_score": 6.0}],
                "acceptance_criteria": ["Telemetry is added safely.", "No unapproved feature scope is implemented."],
                "implementation_tasks": ["Add instrumentation", "Validate read-only discovery behavior"],
                "tests": ["pytest Agents/Serrano/tests -q"],
                "telemetry": ["rating_started", "rating_completed", "rating_abandoned"],
                "risks": ["Live telemetry may still be incomplete."],
                "rollout": ["Ship behind documented review flow."],
                "rollback": ["Remove new instrumentation paths if validation fails."],
                "approval_status": "awaiting_approval",
            }
        if request.role_name == "chief_ai_officer":
            dimensions = ("AI Architecture and Wiring", "Prompt and Agent Quality", "Reliability and Determinism", "AI Safety and Guardrails", "Security and Privacy", "Cost and Operational Efficiency", "Maintainability", "Product and User Value", "Evidence Quality", "AI-Slop Resistance")
            return {
                "role": "chief_ai_officer", "summary": "Dry-run CAIO review; no live provider, device, or Supabase validation was attempted.",
                "dimension_scores": [{"dimension": dimension, "score": 60, "evidence_references": ["evidence/evidence_manifest.json"]} for dimension in dimensions],
                "overall_score": 60, "evidence_coverage_percentage": 20, "confidence_level": "low", "release_recommendation": "NEEDS EVIDENCE",
                "top_strengths": ["Structured Serrano worker schemas are available."], "top_concerns": ["Dry-run cannot verify live AI providers or runtime boundaries."],
                "confirmed_defects": [], "suspected_risks": [], "blocked_validations": ["No live provider, device, or Supabase validation was attempted."],
                "required_remediation": ["Run bounded live validation before making AI operational claims."],
                "findings": [{"title": "Live validation unavailable", "evidence_status": "BLOCKED", "evidence_reference": "SERRANO_DRY_RUN=true", "why": "Dry-run uses deterministic mock outputs.", "severity": "medium", "recommended_remediation": "Run an approved bounded integration check.", "release_blocking": False}],
                "source_references": ["evidence/evidence_manifest.json"],
            }
        if request.role_name == "release_notes":
            return {
                "role": request.role_name,
                "summary": summary,
                "observed_facts": ["Validation completed in dry-run mode."],
                "inferences": ["This output is suitable for release-note templating only."],
                "evidence_gaps": [],
                "recommendations": [recommendation],
                "risks": ["Release claims must be validated against implementation artifacts."],
                "confidence": "medium",
                "source_references": ["artifacts/validation_report.md"],
                "panel_review": {"overall_score": 60, "evidence_coverage_percentage": 20, "confidence_level": "low", "release_recommendation": "NEEDS EVIDENCE"},
            }
        return {
            "role": request.role_name,
            "summary": summary,
            "observed_facts": ["Repository evidence was provided.", "Dry-run mode prevented live changes."],
            "inferences": ["Missing telemetry should be treated as an evidence gap."],
            "evidence_gaps": ["No live production confirmation was attempted in dry-run mode."],
            "recommendations": [recommendation],
            "risks": ["Dry-run outputs are placeholders, not leadership decisions."],
            "confidence": "medium",
            "source_references": ["evidence/evidence_manifest.json"],
            "panel_review": {"overall_score": 60, "evidence_coverage_percentage": 20, "confidence_level": "low", "release_recommendation": "NEEDS EVIDENCE"},
        }
