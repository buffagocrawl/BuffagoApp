from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .orchestrator import SerranoOrchestrator, load_configuration

SUPPORTED_COMMANDS = ("status", "resume", "discover", "approve", "build", "security", "release", "full")


def find_repo_root(start: Path | None = None) -> Path:
    current = (start or Path.cwd()).resolve()
    for candidate in (current, *current.parents):
        if (candidate / ".git").exists() and (candidate / "Agents").exists():
            return candidate
    raise RuntimeError("Could not find Buffago repository root.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Serrano product-management orchestrator")
    parser.add_argument("command", nargs="?", default="discover", choices=SUPPORTED_COMMANDS)
    parser.add_argument("run_id", nargs="?")
    return parser


def run_command(argv: list[str] | None = None) -> dict[str, Any]:
    args = build_parser().parse_args(argv)
    repo_root = find_repo_root()
    orchestrator = SerranoOrchestrator(load_configuration(repo_root))

    if args.command == "status":
        state = orchestrator.status(args.run_id)
    elif args.command == "resume":
        if not args.run_id:
            raise RuntimeError("resume requires <run-id>")
        state = orchestrator.discover(args.run_id)
    elif args.command == "discover":
        state = orchestrator.discover(args.run_id)
    elif args.command == "approve":
        if not args.run_id:
            raise RuntimeError("approve requires <run-id>")
        state = orchestrator.approve(args.run_id)
    elif args.command == "build":
        if not args.run_id:
            raise RuntimeError("build requires <run-id>")
        state = orchestrator.build(args.run_id)
    elif args.command == "security":
        if not args.run_id:
            raise RuntimeError("security requires <run-id>")
        state = orchestrator.security(args.run_id)
    elif args.command == "release":
        if not args.run_id:
            raise RuntimeError("release requires <run-id>")
        state = orchestrator.release(args.run_id)
    else:
        state = orchestrator.full(args.run_id)

    return state


def format_state_summary(state: dict[str, Any], repo_root: Path) -> str:
    run_id = state["run_id"]
    run_dir = repo_root / "Agents" / "Serrano" / "runs" / run_id
    artifact_dir = run_dir / "artifacts"
    important_artifacts = [
        "final_product_plan.md",
        "approval_required.md",
        "implementation_report.md",
        "validation_report.md",
        "security_report.md",
        "release_notes_user.md",
    ]
    present_artifacts = [name for name in important_artifacts if (artifact_dir / name).exists()]
    lines = [
        f"Serrano run: {run_id}",
        f"Status: {state['status']}",
        f"Current phase: {state['current_phase']}",
        f"Completed workers: {len(state.get('completed_workers', []))}",
        f"Failed workers: {len(state.get('failed_workers', []))}",
        f"Run directory: {run_dir.relative_to(repo_root)}",
    ]
    if state.get("status") in {"awaiting_approval", "awaiting_reapproval"}:
        lines.append(f"Approval gate: review {artifact_dir.relative_to(repo_root) / 'approval_required.md'} and then run `approve {run_id}`.")
    elif state.get("approval"):
        lines.append(f"Approval recorded: {state['approval']['timestamp']}")
    if present_artifacts:
        lines.append("Artifacts:")
        lines.extend(f"- {artifact_dir.relative_to(repo_root) / name}" for name in present_artifacts)
    lines.append("")
    lines.append(json.dumps({"run_id": state["run_id"], "status": state["status"], "current_phase": state["current_phase"]}, indent=2))
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    repo_root = find_repo_root()
    state = run_command(argv)
    print(format_state_summary(state, repo_root))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
