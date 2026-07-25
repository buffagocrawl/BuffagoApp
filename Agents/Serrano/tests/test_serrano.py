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
from serrano.schemas import caio_output_schema, final_plan_schema, worker_output_schema  # noqa: E402
from serrano.review_panel import CAIO_DIMENSIONS, PANEL_REVIEWERS, build_panel_report, panel_reviewer_count, validate_caio_payload  # noqa: E402
from serrano.confidence import (  # noqa: E402
    APP_EXPERIENCE_CATEGORIES,
    RELEASE_CATEGORIES,
    RETENTION_CATEGORIES,
    APP_JUDGES,
    RELEASE_JUDGES,
    RETENTION_JUDGES,
    CategoryScore,
    EvidenceMaturity,
    calculate_confidence,
    can_approve_release,
    render_confidence_card,
)

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


def _caio_payload(*, blocked: bool = False) -> dict[str, object]:
    return {"role": "chief_ai_officer", "summary": "review", "dimension_scores": [{"dimension": item, "score": 80, "evidence_references": ["test"]} for item in CAIO_DIMENSIONS], "overall_score": 80, "evidence_coverage_percentage": 90, "confidence_level": "high", "release_recommendation": "DO NOT RELEASE" if blocked else "RELEASE WITH REMEDIATION", "top_strengths": [], "top_concerns": [], "confirmed_defects": [], "suspected_risks": [], "blocked_validations": [], "required_remediation": [], "findings": [{"title": "confirmed defect", "evidence_status": "CONFIRMED", "evidence_reference": "test", "why": "test", "severity": "critical", "recommended_remediation": "fix", "release_blocking": blocked}] if blocked else [{"title": "noncritical slop", "evidence_status": "SUSPECTED", "evidence_reference": "test", "why": "specific duplication", "severity": "low", "recommended_remediation": "deduplicate", "release_blocking": False}], "source_references": ["test"]}


def test_caio_is_unique_canonical_panel_member_and_schema_validates() -> None:
    identifiers = [reviewer.identifier for reviewer in PANEL_REVIEWERS]
    assert "chief_ai_officer" in identifiers
    assert len(identifiers) == len(set(identifiers)) == panel_reviewer_count()
    assert caio_output_schema()["additionalProperties"] is False
    validate_caio_payload(_caio_payload())


def test_documentation_and_runtime_panel_membership_agree() -> None:
    readme = (SERRANO_DIR / "README.md").read_text(encoding="utf-8")
    assert all(reviewer.name in readme for reviewer in PANEL_REVIEWERS)


def test_caio_prompt_requires_evidence_and_anti_slop_review() -> None:
    prompt = (SERRANO_DIR / "prompts" / "chief_ai_officer.md").read_text(encoding="utf-8")
    for required in ("AI-slop", "CONFIRMED", "BLOCKED", "prompt injection", "DO NOT RELEASE", "exact reference"):
        assert required in prompt


def test_panel_aggregation_includes_caio_and_current_missing_caio_is_incomplete() -> None:
    generic = {"panel_review": {"overall_score": 60, "evidence_coverage_percentage": 50}}
    results = {reviewer.identifier: (generic if reviewer.identifier != "chief_ai_officer" else _caio_payload()) for reviewer in PANEL_REVIEWERS}
    report = build_panel_report(results)
    assert report["complete"] and report["completed_reviewer_count"] == panel_reviewer_count()
    assert report["overall_score"] == 62.5
    results.pop("chief_ai_officer")
    assert not build_panel_report(results)["complete"]


def test_historical_panel_without_caio_remains_readable_and_blocking_overrides_score() -> None:
    historical = build_panel_report({"growth_analyst": {"panel_review": {"overall_score": 90, "evidence_coverage_percentage": 80}}}, historical=True)
    assert historical["complete"] and historical["expected_reviewer_count"] == 1
    assert build_panel_report({"chief_ai_officer": _caio_payload(blocked=True)})["disposition"] == "DO NOT RELEASE"


def test_noncritical_caio_slop_finding_does_not_release_block() -> None:
    report = build_panel_report({"chief_ai_officer": _caio_payload()})
    assert report["disposition"] == "INCOMPLETE"


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
    assert (worker_dir / "chief_ai_officer.json").exists()
    assert (worker_dir / "chief_ai_officer.md").exists()
    assert (worker_dir.parent / "artifacts" / "panel-review.json").exists()


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


def test_confidence_models_calculate_independently_and_keep_not_scorable_out_of_score() -> None:
    release = calculate_confidence(
        "Release Confidence",
        [CategoryScore("Authentication reliability", 80, ("auth.md",)), CategoryScore("Authorization and RLS", None)],
        total_categories=2,
    )
    app = calculate_confidence(
        "App Experience Confidence",
        [CategoryScore("Navigation clarity", 60, ("ux.md",)), CategoryScore("Buffaverse comprehension", 90, ("ux.md",))],
        total_categories=2,
    )

    assert release.score == 80
    assert release.evidence_coverage == 50
    assert release.not_scorable == ("Authorization and RLS",)
    assert app.score == 75
    assert len(RELEASE_CATEGORIES) == 16 and len(APP_EXPERIENCE_CATEGORIES) == 25 and len(RETENTION_CATEGORIES) == 20


def test_release_hard_gate_overrides_a_high_numeric_score_and_blended_average_cannot_approve() -> None:
    report = calculate_confidence(
        "Release Confidence", [CategoryScore("Build and export health", 95, ("build.md",))], total_categories=1,
        hard_blockers=["Confirmed unresolved P1"],
    )

    assert report.status == "BLOCKED"
    assert not can_approve_release(report)
    assert not can_approve_release(calculate_confidence("App Experience Confidence", [CategoryScore("Navigation clarity", 99)], total_categories=1))


@pytest.mark.parametrize(("evidence", "expected_score", "expected_ceiling"), [(None, 65, 65), ("internal", 70, 70), ("external_under_10", 75, 75), ("d1_10_plus", 80, 80), ("d7", 90, 90), ("d30", 95, 100)])
def test_retention_evidence_ceiling(evidence: str | None, expected_score: int, expected_ceiling: int) -> None:
    report = calculate_confidence(
        "User Retention Confidence", [CategoryScore("Activation strength", 95, ("interview.md",))], total_categories=1,
        retention_evidence=evidence,
    )
    assert report.score == expected_score
    assert report.evidence_ceiling == expected_ceiling


def test_judge_domain_assignment_excludes_personas_from_release_and_technical_reviewers_from_experience() -> None:
    assert "College User" not in RELEASE_JUDGES
    assert "QA" not in APP_JUDGES
    assert "UX Designer" in APP_JUDGES
    assert "Game Psychologist" in RETENTION_JUDGES


def test_score_movement_uses_prior_same_domain_score_only() -> None:
    report = calculate_confidence(
        "App Experience Confidence", [CategoryScore("Navigation clarity", 72, maturity=EvidenceMaturity.EMULATOR_VALIDATED)],
        total_categories=1, previous_score=68,
    )
    assert report.score_movement == 4
    assert report.status == "EVIDENCE-BACKED"


def test_generated_run_has_separate_cards_and_legacy_scorecard_is_preserved() -> None:
    state = SerranoOrchestrator(load_configuration(PROJECT_ROOT)).discover()
    artifacts = PROJECT_ROOT / "Agents" / "Serrano" / "runs" / state["run_id"] / "artifacts"
    assert (artifacts / "release-confidence.md").exists()
    assert (artifacts / "app-experience-confidence.md").exists()
    assert (artifacts / "user-retention-confidence.md").exists()
    assert "66.7/100" in (PROJECT_ROOT / "docs" / "reviews" / "serrano-cayenne-final-review-20260724" / "panel-consolidated-scorecard.md").read_text(encoding="utf-8")


def test_status_rendering_uses_release_gate_label() -> None:
    report = calculate_confidence("Release Confidence", [], total_categories=1)
    card = render_confidence_card(report, reviewed_at="now", largest_blocker="missing evidence", largest_opportunity="test")
    assert "Gate status: **NOT SCORABLE**" in card
