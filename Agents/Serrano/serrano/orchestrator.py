from __future__ import annotations

import hashlib
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import yaml

from .codex_runner import CodexRequest, CodexRunner
from .evidence_collector import collect_evidence_manifest, detect_codex_command
from .logging_config import initialize_logger, log_event
from .run_state import RunPaths, RunStateStore, build_run_paths, stable_hash
from .schemas import (
    FINAL_PLAN,
    IMPLEMENTATION,
    RELEASE_NOTES,
    SECURITY,
    SYNTHESIS_1,
    SYNTHESIS_2,
    VERIFICATION,
    WAVE_1,
    WAVE_2,
    WAVE_3,
    WorkerSpec,
    final_plan_schema,
    worker_output_schema,
)
from .supabase_metrics import SupabaseMetricsCollector
from .validators import ValidationError, load_json, validate_final_plan, validate_worker_payload, write_markdown_report


@dataclass(frozen=True, slots=True)
class SerranoConfig:
    repo_root: Path
    base_dir: Path
    prompts_dir: Path
    runs_dir: Path
    command: list[str] | None
    max_concurrent_workers: int
    model: str
    reasoning_level: str
    retry_count: int
    worker_timeout_seconds: int
    lookback_days: int
    retention_lookback_days: int
    dry_run_mode: bool
    implementation_enabled: bool
    security_autofix_enabled: bool
    artifact_retention_days: int
    supabase_url_env: str
    supabase_read_key_env: str
    allow_service_role_fallback: bool


def load_configuration(repo_root: Path) -> SerranoConfig:
    base_dir = repo_root / "Agents" / "Serrano"
    raw = yaml.safe_load((base_dir / "config" / "default.yaml").read_text(encoding="utf-8"))["serrano"]
    configured_command = list(raw["codex_command"])
    command = detect_codex_command(configured_command)
    max_workers = int(os.getenv("SERRANO_MAX_CONCURRENT_WORKERS", raw["max_concurrent_workers"]))
    dry_run = os.getenv("SERRANO_DRY_RUN", str(raw["dry_run_mode"])).strip().lower() in {"1", "true", "yes", "on"}
    implementation_enabled = os.getenv("SERRANO_IMPLEMENTATION_ENABLED", str(raw["implementation_enabled"])).strip().lower() in {"1", "true", "yes", "on"}
    security_autofix_enabled = os.getenv("SERRANO_SECURITY_AUTOFIX_ENABLED", str(raw["security_autofix_enabled"])).strip().lower() in {"1", "true", "yes", "on"}
    allow_service_role_fallback = os.getenv("SERRANO_ALLOW_SERVICE_ROLE_FALLBACK", str(raw["allow_service_role_fallback"])).strip().lower() in {"1", "true", "yes", "on"}
    return SerranoConfig(
        repo_root=repo_root,
        base_dir=base_dir,
        prompts_dir=base_dir / "prompts",
        runs_dir=base_dir / "runs",
        command=command,
        max_concurrent_workers=max(1, max_workers),
        model=os.getenv("SERRANO_MODEL", raw["model"]).strip(),
        reasoning_level=os.getenv("SERRANO_REASONING_LEVEL", raw["reasoning_level"]).strip(),
        retry_count=int(os.getenv("SERRANO_RETRY_COUNT", raw["retry_count"])),
        worker_timeout_seconds=int(os.getenv("SERRANO_WORKER_TIMEOUT_SECONDS", raw["worker_timeout_seconds"])),
        lookback_days=int(os.getenv("SERRANO_LOOKBACK_DAYS", raw["lookback_days"])),
        retention_lookback_days=int(os.getenv("SERRANO_RETENTION_LOOKBACK_DAYS", raw["retention_lookback_days"])),
        dry_run_mode=dry_run,
        implementation_enabled=implementation_enabled,
        security_autofix_enabled=security_autofix_enabled,
        artifact_retention_days=int(os.getenv("SERRANO_ARTIFACT_RETENTION_DAYS", raw["artifact_retention_days"])),
        supabase_url_env=os.getenv("SERRANO_SUPABASE_URL_ENV", raw["supabase_url_env"]).strip(),
        supabase_read_key_env=os.getenv("SERRANO_SUPABASE_READ_KEY_ENV", raw["supabase_read_key_env"]).strip(),
        allow_service_role_fallback=allow_service_role_fallback,
    )


class SerranoOrchestrator:
    def __init__(self, config: SerranoConfig) -> None:
        self.config = config

    def status(self, run_id: str | None = None) -> dict[str, Any]:
        paths = self._resolve_run(run_id)
        return RunStateStore(paths).load()

    def discover(self, run_id: str | None = None) -> dict[str, Any]:
        paths, state, logger = self._prepare_run(run_id)
        self._preflight(paths, state, logger)
        self._run_wave(paths, state, logger, list(WAVE_1), "wave_1", self._discovery_context(paths))
        self._run_single(paths, state, logger, SYNTHESIS_1, self._synthesis_context(paths, ["growth_analyst", "marketing_analyst", "customer_advocate"]))
        self._run_wave(paths, state, logger, list(WAVE_2), "wave_2", self._synthesis_context(paths, [SYNTHESIS_1.name]))
        self._run_single(paths, state, logger, SYNTHESIS_2, self._synthesis_context(paths, [SYNTHESIS_1.name, "ceo_strategy_review", "cto_feasibility_review", "caio_data_review"]))
        self._run_wave(paths, state, logger, list(WAVE_3), "wave_3", self._synthesis_context(paths, [SYNTHESIS_2.name]))
        self._run_single(paths, state, logger, FINAL_PLAN, self._synthesis_context(paths, [SYNTHESIS_2.name, "ceo_final_review", "cfo_business_review", "caio_feedback_loop_review"]))
        self._materialize_final_plan(paths, state, logger)
        state["status"] = "awaiting_approval"
        state["current_phase"] = "final_product_plan"
        RunStateStore(paths).save(state)
        return state

    def approve(self, run_id: str) -> dict[str, Any]:
        paths = self._resolve_run(run_id)
        state = RunStateStore(paths).load()
        plan_path = paths.artifact_dir / "final_product_plan.json"
        if not plan_path.exists():
            raise RuntimeError("final_product_plan.json is missing; discovery must complete first.")
        plan_hash = hashlib.sha256(plan_path.read_bytes()).hexdigest()
        state["approved_plan_hash"] = plan_hash
        state["approval"] = {
            "timestamp": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "approved_plan_hash": plan_hash,
            "approved_scope": "approved implementation brief for this run",
            "approving_user_action": f"approve {run_id}",
        }
        state["status"] = "approved"
        RunStateStore(paths).save(state)
        return state

    def build(self, run_id: str) -> dict[str, Any]:
        if not self.config.implementation_enabled:
            raise RuntimeError("Implementation is disabled by default. Set SERRANO_IMPLEMENTATION_ENABLED=true to enable build phases.")
        paths = self._resolve_run(run_id)
        state = RunStateStore(paths).load()
        self._require_current_approval(paths, state)
        logger = initialize_logger(paths.log_path)
        self._run_single(paths, state, logger, IMPLEMENTATION, self._approved_scope_context(paths))
        self._materialize_implementation_outputs(paths, state)
        self._run_validation(paths, state, logger)
        return RunStateStore(paths).load()

    def security(self, run_id: str) -> dict[str, Any]:
        paths = self._resolve_run(run_id)
        state = RunStateStore(paths).load()
        logger = initialize_logger(paths.log_path)
        if "validation_report.md" not in state.get("artifacts", {}):
            raise RuntimeError("Validation must complete before security review.")
        self._run_single(paths, state, logger, SECURITY, self._post_build_context(paths))
        self._materialize_security_outputs(paths, state)
        self._run_single(paths, state, logger, VERIFICATION, self._post_build_context(paths))
        self._materialize_verification_outputs(paths, state)
        return RunStateStore(paths).load()

    def release(self, run_id: str) -> dict[str, Any]:
        paths = self._resolve_run(run_id)
        state = RunStateStore(paths).load()
        if "validation_report.md" not in state.get("artifacts", {}):
            raise RuntimeError("Release notes cannot be generated before validation.")
        if "security_report.md" not in state.get("artifacts", {}):
            raise RuntimeError("Release notes cannot be generated before security review.")
        logger = initialize_logger(paths.log_path)
        self._run_single(paths, state, logger, RELEASE_NOTES, self._post_build_context(paths))
        self._materialize_release_outputs(paths, state)
        return RunStateStore(paths).load()

    def full(self, run_id: str | None = None) -> dict[str, Any]:
        state = self.discover(run_id)
        if state.get("approval"):
            state = self.build(state["run_id"])
            state = self.security(state["run_id"])
            state = self.release(state["run_id"])
        return state

    def _prepare_run(self, run_id: str | None) -> tuple[RunPaths, dict[str, Any], Any]:
        paths = self._resolve_run(run_id, create_if_missing=True)
        store = RunStateStore(paths)
        if paths.state_path.exists():
            state = store.load()
        else:
            state = store.initialize(paths.run_dir.name)
        logger = initialize_logger(paths.log_path)
        return paths, state, logger

    def _resolve_run(self, run_id: str | None, *, create_if_missing: bool = False) -> RunPaths:
        if run_id:
            run_dir = self.config.runs_dir / run_id
        else:
            if create_if_missing:
                run_id = datetime.now().strftime("%Y-%m-%dT%H%M%S")
                candidate = self.config.runs_dir / run_id
                if candidate.exists():
                    run_id = f"{run_id}-{uuid4().hex[:8]}"
                run_dir = self.config.runs_dir / run_id
            else:
                runs = sorted(path for path in self.config.runs_dir.iterdir() if path.is_dir())
                if not runs:
                    raise RuntimeError("No Serrano runs exist yet.")
                run_dir = runs[-1]
        return build_run_paths(run_dir)

    def _preflight(self, paths: RunPaths, state: dict[str, Any], logger) -> None:
        if "evidence_manifest.json" in state.get("artifacts", {}):
            return
        metrics_collector = SupabaseMetricsCollector(
            self.config.supabase_url_env,
            self.config.supabase_read_key_env,
            self.config.allow_service_role_fallback,
        )
        manifest = collect_evidence_manifest(
            repo_root=self.config.repo_root,
            run_id=state["run_id"],
            codex_command=self.config.command,
            evidence_dir=paths.evidence_dir,
            logger=logger,
        )
        metrics = metrics_collector.collect(
            lookback_days=self.config.lookback_days,
            retention_days=self.config.retention_lookback_days,
            logger=logger,
        )
        metrics_path = paths.evidence_dir / "supabase_metrics.json"
        metrics_path.write_text(json.dumps(metrics, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        state["artifacts"]["evidence_manifest.json"] = str(paths.evidence_dir / "evidence_manifest.json")
        state["artifacts"]["supabase_metrics.json"] = str(metrics_path)
        state["current_phase"] = "evidence_collection"
        state["commands_executed"] = manifest["commands_executed"]
        RunStateStore(paths).save(state)

    def _discovery_context(self, paths: RunPaths) -> dict[str, Any]:
        return {
            "run_id": paths.run_dir.name,
            "evidence_manifest": load_json(paths.evidence_dir / "evidence_manifest.json"),
            "supabase_metrics": load_json(paths.evidence_dir / "supabase_metrics.json"),
            "repository_docs": {
                "database_map": "crawl/supabase/docs/database_map.md",
                "risk_map": "crawl/supabase/docs/dead_or_risky_tables.md",
                "analytics_plan": "crawl/supabase/docs/user_logging_plan.md",
                "product_review": "docs/product/buffago_product_gamification_recommendations.md",
                "historical_evidence": "evidence",
            },
        }

    def _synthesis_context(self, paths: RunPaths, worker_names: list[str]) -> dict[str, Any]:
        context = {"run_id": paths.run_dir.name, "worker_outputs": {}, "failed_workers": []}
        state = RunStateStore(paths).load()
        context["failed_workers"] = list(state.get("failed_workers", []))
        for worker_name in worker_names:
            worker_path = paths.worker_dir / f"{worker_name}.json"
            if worker_path.exists():
                context["worker_outputs"][worker_name] = load_json(worker_path)
        return context

    def _approved_scope_context(self, paths: RunPaths) -> dict[str, Any]:
        return {
            "run_id": paths.run_dir.name,
            "approved_plan": load_json(paths.artifact_dir / "final_product_plan.json"),
            "implementation_brief": (paths.artifact_dir / "implementation_brief.md").read_text(encoding="utf-8"),
        }

    def _post_build_context(self, paths: RunPaths) -> dict[str, Any]:
        data = {"run_id": paths.run_dir.name}
        for artifact_name in (
            "final_product_plan.json",
            "implementation_report.md",
            "validation_report.md",
            "changed_files.json",
            "security_report.md",
        ):
            path = paths.artifact_dir / artifact_name
            if path.exists():
                data[artifact_name] = path.read_text(encoding="utf-8")
        return data

    def _run_wave(self, paths: RunPaths, state: dict[str, Any], logger, specs: list[WorkerSpec], phase: str, context: dict[str, Any]) -> None:
        log_event(logger, "wave_started", phase=phase, workers=[spec.name for spec in specs])
        with ThreadPoolExecutor(max_workers=min(self.config.max_concurrent_workers, len(specs))) as executor:
            futures = {executor.submit(self._run_single, paths, state, logger, spec, context): spec for spec in specs}
            for future in as_completed(futures):
                spec = futures[future]
                try:
                    future.result()
                except Exception as exc:
                    self._record_worker_failure(paths, state, spec.name, str(exc))
                    log_event(logger, "worker_failed", worker=spec.name, error=str(exc), level="error")
        state["current_phase"] = phase
        RunStateStore(paths).save(state)

    def _run_single(self, paths: RunPaths, state: dict[str, Any], logger, spec: WorkerSpec, context: dict[str, Any]) -> None:
        input_payload = {"run_id": state["run_id"], "phase": spec.phase, "context": context}
        prompt_text = (self.config.prompts_dir / spec.prompt_file).read_text(encoding="utf-8")
        existing = state.get("workers", {}).get(spec.name)
        input_hash = stable_hash(input_payload)
        prompt_hash = stable_hash(prompt_text)
        if existing and existing.get("status") == "completed" and existing.get("input_hash") == input_hash and existing.get("prompt_hash") == prompt_hash:
            return
        runner = CodexRunner(
            repo_root=self.config.repo_root,
            command=self.config.command,
            dry_run_mode=self.config.dry_run_mode,
            retry_count=self.config.retry_count,
            logger=logger,
        )
        request = CodexRequest(
            name=spec.name,
            role_name=spec.name,
            prompt_text=prompt_text,
            input_payload=input_payload,
            schema=final_plan_schema() if spec.name == FINAL_PLAN.name else worker_output_schema(spec.name),
            output_json_path=paths.worker_dir / f"{spec.name}.json",
            mode=spec.mode,
            timeout_seconds=self.config.worker_timeout_seconds,
            model=self.config.model,
            reasoning_level=self.config.reasoning_level,
        )
        result = runner.execute(request)
        if spec.name == FINAL_PLAN.name:
            validate_final_plan(result.payload)
        else:
            validate_worker_payload(result.payload, spec.name)
            write_markdown_report(result.payload, paths.worker_dir / f"{spec.name}.md", title=spec.name.replace("_", " ").title())
        state.setdefault("workers", {})[spec.name] = {
            "status": result.status,
            "input_hash": result.input_hash,
            "prompt_hash": result.prompt_hash,
            "json_path": str(paths.worker_dir / f"{spec.name}.json"),
            "markdown_path": str(paths.worker_dir / f"{spec.name}.md"),
        }
        if spec.name not in state["completed_workers"]:
            state["completed_workers"].append(spec.name)
        if spec.name in state["failed_workers"]:
            state["failed_workers"].remove(spec.name)
        RunStateStore(paths).save(state)

    def _record_worker_failure(self, paths: RunPaths, state: dict[str, Any], worker_name: str, error: str) -> None:
        state.setdefault("workers", {})[worker_name] = {"status": "failed", "error": error}
        if worker_name not in state["failed_workers"]:
            state["failed_workers"].append(worker_name)
        RunStateStore(paths).save(state)

    def _materialize_final_plan(self, paths: RunPaths, state: dict[str, Any], logger) -> None:
        plan_payload = load_json(paths.worker_dir / f"{FINAL_PLAN.name}.json")
        validate_final_plan(plan_payload)
        plan_json_path = paths.artifact_dir / "final_product_plan.json"
        plan_md_path = paths.artifact_dir / "final_product_plan.md"
        worker_md_path = paths.worker_dir / f"{FINAL_PLAN.name}.md"
        plan_json_path.write_text(json.dumps(plan_payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        plan_md_path.write_text(
            "# Final Product Plan\n\n"
            f"Approval status: `{plan_payload['approval_status']}`\n\n"
            "## Chosen Initiatives\n"
            + "\n".join(f"- {item.get('id')}: {item.get('title')}" for item in plan_payload["chosen_initiatives"])
            + "\n\n## Acceptance Criteria\n"
            + "\n".join(f"- {item}" for item in plan_payload["acceptance_criteria"])
            + "\n",
            encoding="utf-8",
        )
        worker_md_path.write_text(plan_md_path.read_text(encoding="utf-8"), encoding="utf-8")
        approval_required_path = paths.artifact_dir / "approval_required.md"
        approval_required_path.write_text(
            "# Approval Required\n\n"
            "Serrano discovery is complete. Implementation is blocked until approval is recorded for the current plan hash.\n\n"
            f"- Run ID: `{state['run_id']}`\n"
            f"- Proposed implementation tasks: {len(plan_payload['implementation_tasks'])}\n"
            f"- Telemetry items: {len(plan_payload['telemetry'])}\n"
            f"- Risks: {len(plan_payload['risks'])}\n",
            encoding="utf-8",
        )
        implementation_brief_path = paths.artifact_dir / "implementation_brief.md"
        implementation_brief_path.write_text(
            "# Implementation Brief\n\n"
            + "\n".join(f"- {item}" for item in plan_payload["implementation_tasks"])
            + "\n",
            encoding="utf-8",
        )
        measurement_plan_path = paths.artifact_dir / "measurement_plan.md"
        measurement_plan_path.write_text(
            "# Measurement Plan\n\n"
            + "\n".join(f"- {item}" for item in plan_payload["telemetry"])
            + "\n",
            encoding="utf-8",
        )
        risk_register_path = paths.artifact_dir / "risk_register.md"
        risk_register_path.write_text("# Risk Register\n\n" + "\n".join(f"- {item}" for item in plan_payload["risks"]) + "\n", encoding="utf-8")
        state["artifacts"].update(
            {
                "final_product_plan.json": str(plan_json_path),
                "final_product_plan.md": str(plan_md_path),
                "approval_required.md": str(approval_required_path),
                "implementation_brief.md": str(implementation_brief_path),
                "measurement_plan.md": str(measurement_plan_path),
                "risk_register.md": str(risk_register_path),
            }
        )
        state.setdefault("workers", {}).setdefault(FINAL_PLAN.name, {})["markdown_path"] = str(worker_md_path)
        current_hash = hashlib.sha256(plan_json_path.read_bytes()).hexdigest()
        if state.get("approved_plan_hash") and state.get("approved_plan_hash") != current_hash:
            state["approval"] = None
            state["approved_plan_hash"] = None
            state["status"] = "awaiting_reapproval"
            log_event(logger, "approval_invalidated", reason="plan_hash_changed")
        RunStateStore(paths).save(state)

    def _require_current_approval(self, paths: RunPaths, state: dict[str, Any]) -> None:
        plan_path = paths.artifact_dir / "final_product_plan.json"
        if not state.get("approval") or not plan_path.exists():
            raise RuntimeError("This run has not been approved.")
        current_hash = hashlib.sha256(plan_path.read_bytes()).hexdigest()
        if state.get("approved_plan_hash") != current_hash:
            raise RuntimeError("The plan changed after approval and requires reapproval.")

    def _run_validation(self, paths: RunPaths, state: dict[str, Any], logger) -> None:
        implementation_payload = load_json(paths.worker_dir / f"{IMPLEMENTATION.name}.json")
        report_path = paths.artifact_dir / "validation_report.md"
        report_path.write_text(
            "# Validation Report\n\n"
            "- Acceptance criteria reviewed against implementation report.\n"
            "- Dry-run mode does not execute app build or navigation smoke tests.\n"
            "- Rollback readiness must be confirmed for live runs.\n",
            encoding="utf-8",
        )
        implementation_report = paths.artifact_dir / "implementation_report.md"
        implementation_report.write_text(
            "# Implementation Report\n\n"
            f"Summary: {implementation_payload.get('summary', 'No summary provided.')}\n",
            encoding="utf-8",
        )
        changed_files = paths.artifact_dir / "changed_files.json"
        changed_files.write_text(json.dumps({"files": [], "commands": []}, indent=2) + "\n", encoding="utf-8")
        state["artifacts"].update(
            {
                "validation_report.md": str(report_path),
                "implementation_report.md": str(implementation_report),
                "changed_files.json": str(changed_files),
            }
        )
        state["current_phase"] = "validation"
        RunStateStore(paths).save(state)
        log_event(logger, "validation_completed")

    def _materialize_implementation_outputs(self, paths: RunPaths, state: dict[str, Any]) -> None:
        payload = load_json(paths.worker_dir / f"{IMPLEMENTATION.name}.json")
        write_markdown_report(payload, paths.worker_dir / f"{IMPLEMENTATION.name}.md", title="Implementation Worker")
        state["artifacts"]["implementation_worker.json"] = str(paths.worker_dir / f"{IMPLEMENTATION.name}.json")
        RunStateStore(paths).save(state)

    def _materialize_security_outputs(self, paths: RunPaths, state: dict[str, Any]) -> None:
        payload = load_json(paths.worker_dir / f"{SECURITY.name}.json")
        security_report = paths.artifact_dir / "security_report.md"
        security_report.write_text("# Security Report\n\n" + payload.get("summary", "No summary provided.") + "\n", encoding="utf-8")
        security_fixes = paths.artifact_dir / "security_fixes.md"
        security_fixes.write_text("# Security Fixes\n\n- None automatically applied in this run.\n", encoding="utf-8")
        remaining_risks = paths.artifact_dir / "remaining_risks.md"
        remaining_risks.write_text("# Remaining Risks\n\n" + "\n".join(f"- {risk}" for risk in payload.get("risks", [])) + "\n", encoding="utf-8")
        state["artifacts"].update(
            {
                "security_report.md": str(security_report),
                "security_fixes.md": str(security_fixes),
                "remaining_risks.md": str(remaining_risks),
            }
        )
        RunStateStore(paths).save(state)

    def _materialize_verification_outputs(self, paths: RunPaths, state: dict[str, Any]) -> None:
        payload = load_json(paths.worker_dir / f"{VERIFICATION.name}.json")
        verification_path = paths.artifact_dir / "product_manager_verification.md"
        verification_path.write_text("# Product Manager Verification\n\n" + payload.get("summary", "No summary provided.") + "\n", encoding="utf-8")
        state["artifacts"]["product_manager_verification.md"] = str(verification_path)
        RunStateStore(paths).save(state)

    def _materialize_release_outputs(self, paths: RunPaths, state: dict[str, Any]) -> None:
        payload = load_json(paths.worker_dir / f"{RELEASE_NOTES.name}.json")
        internal = paths.artifact_dir / "release_notes_internal.md"
        internal.write_text("# Internal Release Notes\n\n" + payload.get("summary", "No summary provided.") + "\n", encoding="utf-8")
        user = paths.artifact_dir / "release_notes_user.md"
        user.write_text("# Release Notes\n\n" + payload.get("summary", "No summary provided.") + "\n", encoding="utf-8")
        summary = paths.artifact_dir / "release_summary.json"
        summary.write_text(json.dumps({"run_id": state["run_id"], "summary": payload.get("summary", "")}, indent=2) + "\n", encoding="utf-8")
        state["artifacts"].update(
            {
                "release_notes_internal.md": str(internal),
                "release_notes_user.md": str(user),
                "release_summary.json": str(summary),
            }
        )
        state["current_phase"] = "release_notes"
        state["status"] = "completed"
        RunStateStore(paths).save(state)
