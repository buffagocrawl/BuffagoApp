from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .orchestrator import SerranoOrchestrator, load_configuration


def find_repo_root(start: Path | None = None) -> Path:
    current = (start or Path.cwd()).resolve()
    for candidate in (current, *current.parents):
        if (candidate / ".git").exists() and (candidate / "Agents").exists():
            return candidate
    raise RuntimeError("Could not find Buffago repository root.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Serrano product-management orchestrator")
    parser.add_argument("command", nargs="?", default="discover", choices=("status", "resume", "discover", "approve", "build", "security", "release", "full"))
    parser.add_argument("run_id", nargs="?")
    return parser


def main(argv: list[str] | None = None) -> int:
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

    print(json.dumps({"run_id": state["run_id"], "status": state["status"], "current_phase": state["current_phase"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

