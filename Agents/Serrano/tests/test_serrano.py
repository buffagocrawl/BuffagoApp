from __future__ import annotations

import json
import os
import sys
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[3]
SERRANO_DIR = PROJECT_ROOT / "Agents" / "Serrano"
if str(SERRANO_DIR) not in sys.path:
    sys.path.insert(0, str(SERRANO_DIR))

from serrano.cli import find_repo_root, format_state_summary, main  # noqa: E402
from serrano.orchestrator import SerranoOrchestrator, load_configuration  # noqa: E402
from serrano.schemas import final_plan_schema, worker_output_schema  # noqa: E402

SKILL_RUNNER_PATH = PROJECT_ROOT / ".agents" / "skills" / "serrano" / "scripts" / "run_serrano.py"
skill_runner_spec = spec_from_file_location("run_serrano_skill", SKILL_RUNNER_PATH)
assert skill_runner_spec and skill_runner_spec.loader
skill_runner = module_from_spec(skill_runner_spec)
skill_runner_spec.loader.exec_module(skill_runner)


@pytest.fixture(autouse=True)
def serrano_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SERRANO_DRY_RUN", "true")
    monkeypatch.delenv("SERRANO_SUPABASE_READ_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)


def test_find_repo_root() -> None:
    assert find_repo_root(PROJECT_ROOT) == PROJECT_ROOT


def test_discovery_creates_resumable_run() -> None:
    orchestrator = SerranoOrchestrator(load_configuration(PROJECT_ROOT))
    state = orchestrator.discover()

    run_dir = PROJECT_ROOT / "Agents" / "Serrano" / "runs" / state["run_id"]
    assert run_dir.exists()
    assert (run_dir / "state" / "run_state.json").exists()
    assert (run_dir / "evidence" / "evidence_manifest.json").exists()
    assert (run_dir / "artifacts" / "final_product_plan.json").exists()
    assert state["status"] == "awaiting_approval"


def test_generated_schemas_use_strict_nested_objects() -> None:
    worker_schema = worker_output_schema("growth_analyst")
    recommendation_schema = worker_schema["properties"]["recommendations"]["items"]
    plan_schema = final_plan_schema()

    assert recommendation_schema["additionalProperties"] is False
    assert plan_schema["additionalProperties"] is False
    assert plan_schema["properties"]["chosen_initiatives"]["items"]["additionalProperties"] is False
    assert plan_schema["properties"]["rejected_initiatives"]["items"]["additionalProperties"] is False
    assert plan_schema["properties"]["prioritization_scores"]["items"]["additionalProperties"] is False


def test_resume_skips_completed_workers() -> None:
    orchestrator = SerranoOrchestrator(load_configuration(PROJECT_ROOT))
    state = orchestrator.discover()
    resumed = orchestrator.discover(state["run_id"])

    assert resumed["run_id"] == state["run_id"]
    assert len(resumed["completed_workers"]) >= len(state["completed_workers"])


def test_approval_is_required_for_build() -> None:
    orchestrator = SerranoOrchestrator(load_configuration(PROJECT_ROOT))
    state = orchestrator.discover()

    with pytest.raises(RuntimeError, match="disabled by default"):
        orchestrator.build(state["run_id"])


def test_approve_records_plan_hash() -> None:
    orchestrator = SerranoOrchestrator(load_configuration(PROJECT_ROOT))
    state = orchestrator.discover()
    approved = orchestrator.approve(state["run_id"])

    assert approved["approved_plan_hash"]
    assert approved["approval"]["approved_plan_hash"] == approved["approved_plan_hash"]


def test_release_notes_block_before_validation() -> None:
    orchestrator = SerranoOrchestrator(load_configuration(PROJECT_ROOT))
    state = orchestrator.discover()

    with pytest.raises(RuntimeError, match="before validation"):
        orchestrator.release(state["run_id"])


def test_status_returns_latest_run() -> None:
    orchestrator = SerranoOrchestrator(load_configuration(PROJECT_ROOT))
    discovered = orchestrator.discover()
    status = orchestrator.status()

    assert status["run_id"] == discovered["run_id"]


def test_cli_default_discover() -> None:
    assert main([]) == 0


def test_skill_runner_routes_natural_language_status() -> None:
    assert skill_runner.canonicalize_args(["show", "latest", "status"], PROJECT_ROOT) == ["status"]


def test_skill_runner_routes_latest_run_commands() -> None:
    orchestrator = SerranoOrchestrator(load_configuration(PROJECT_ROOT))
    state = orchestrator.discover()

    assert skill_runner.canonicalize_args(["resume", "latest"], PROJECT_ROOT) == ["resume", state["run_id"]]
    assert skill_runner.canonicalize_args(["approve", "current"], PROJECT_ROOT) == ["approve", state["run_id"]]


def test_cli_summary_mentions_approval_gate() -> None:
    state = SerranoOrchestrator(load_configuration(PROJECT_ROOT)).discover()
    summary = format_state_summary(state, PROJECT_ROOT)

    assert "Approval gate:" in summary
    assert state["run_id"] in summary


def test_worker_artifacts_include_json_and_markdown() -> None:
    orchestrator = SerranoOrchestrator(load_configuration(PROJECT_ROOT))
    state = orchestrator.discover()
    worker_dir = PROJECT_ROOT / "Agents" / "Serrano" / "runs" / state["run_id"] / "workers"

    assert (worker_dir / "growth_analyst.json").exists()
    assert (worker_dir / "growth_analyst.md").exists()
    assert (worker_dir / "product_manager_final.md").exists()


def test_evidence_manifest_redacts_secret_values_but_keeps_presence(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "super-secret-value")
    orchestrator = SerranoOrchestrator(load_configuration(PROJECT_ROOT))
    state = orchestrator.discover()
    evidence_path = PROJECT_ROOT / "Agents" / "Serrano" / "runs" / state["run_id"] / "evidence" / "evidence_manifest.json"
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))

    assert evidence["supabase_environment"]["SUPABASE_SERVICE_ROLE_KEY"] == {"present": True}


def test_plan_change_requires_reapproval() -> None:
    os.environ["SERRANO_IMPLEMENTATION_ENABLED"] = "true"
    orchestrator = SerranoOrchestrator(load_configuration(PROJECT_ROOT))
    state = orchestrator.discover()
    approved = orchestrator.approve(state["run_id"])
    plan_path = PROJECT_ROOT / "Agents" / "Serrano" / "runs" / state["run_id"] / "artifacts" / "final_product_plan.json"
    payload = json.loads(plan_path.read_text(encoding="utf-8"))
    payload["implementation_tasks"].append("new scope")
    plan_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    with pytest.raises(RuntimeError, match="requires reapproval"):
        orchestrator.build(approved["run_id"])
    os.environ["SERRANO_IMPLEMENTATION_ENABLED"] = "false"
