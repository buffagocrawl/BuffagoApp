from __future__ import annotations

import re
import sys
from pathlib import Path

SUPPORTED_COMMANDS = ("status", "resume", "discover", "approve", "build", "security", "release", "full")
RUN_ID_PATTERN = re.compile(r"\b\d{4}-\d{2}-\d{2}T\d{6}(?:-[0-9a-f]{8})?\b", re.IGNORECASE)


def find_repo_root(start: Path | None = None) -> Path:
    current = (start or Path.cwd()).resolve()
    for candidate in (current, *current.parents):
        if (candidate / ".git").exists() and (candidate / "Agents").exists():
            return candidate
    raise RuntimeError("Could not find Buffago repository root.")


def find_latest_run_id(repo_root: Path) -> str:
    runs_dir = repo_root / "Agents" / "Serrano" / "runs"
    runs = sorted(path for path in runs_dir.iterdir() if path.is_dir())
    if not runs:
        raise RuntimeError("No Serrano runs exist yet.")
    return runs[-1].name


def extract_run_id(text: str) -> str | None:
    match = RUN_ID_PATTERN.search(text)
    if not match:
        return None
    return match.group(0)


def contains_any(text: str, phrases: tuple[str, ...]) -> bool:
    return any(phrase in text for phrase in phrases)


def resolve_target_run_id(run_id: str | None, repo_root: Path, needs_latest: bool) -> str:
    if run_id:
        return run_id
    if needs_latest:
        return find_latest_run_id(repo_root)
    return find_latest_run_id(repo_root)


def canonicalize_args(argv: list[str], repo_root: Path) -> list[str]:
    args = [arg.strip() for arg in argv if arg and arg.strip()]
    if not args:
        return ["discover"]
    first = args[0].lower()
    if first in SUPPORTED_COMMANDS:
        if len(args) >= 2 and args[1].lower() in {"latest", "current"}:
            return [first, find_latest_run_id(repo_root)]
        return args
    if first in {"help", "--help", "-h", "commands"}:
        return ["--help"]

    text = " ".join(args)
    lowered = text.lower()
    run_id = extract_run_id(text)
    needs_latest = contains_any(lowered, (" latest", " current", " most recent"))

    if contains_any(lowered, ("status", "state", "progress")):
        if run_id:
            return ["status", run_id]
        return ["status"]
    if contains_any(lowered, ("resume", "continue", "pick back up")):
        return ["resume", resolve_target_run_id(run_id, repo_root, needs_latest)]
    if contains_any(lowered, ("approve", "approval", "sign off")):
        return ["approve", resolve_target_run_id(run_id, repo_root, needs_latest)]
    if contains_any(lowered, ("build", "implement", "implementation")):
        return ["build", resolve_target_run_id(run_id, repo_root, needs_latest)]
    if contains_any(lowered, ("security", "secure", "review security")):
        return ["security", resolve_target_run_id(run_id, repo_root, needs_latest)]
    if contains_any(lowered, ("release", "release notes", "ship")):
        return ["release", resolve_target_run_id(run_id, repo_root, needs_latest)]
    if contains_any(lowered, ("full", "end to end", "complete workflow")):
        if run_id:
            return ["full", run_id]
        return ["full"]
    return ["discover"]


def main(argv: list[str] | None = None) -> int:
    repo_root = Path(__file__).resolve().parents[4]
    repo_root = find_repo_root(repo_root)
    serrano_dir = repo_root / "Agents" / "Serrano"
    if str(serrano_dir) not in sys.path:
        sys.path.insert(0, str(serrano_dir))
    from serrano.cli import main as serrano_main

    resolved_argv = canonicalize_args(argv or [], repo_root)
    return serrano_main(resolved_argv)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
