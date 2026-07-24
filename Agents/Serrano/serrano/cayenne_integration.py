from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any


def cayenne_root(repo_root: Path) -> Path:
    return repo_root / "Agents" / "Cayenne"


def run_runtime_validation(repo_root: Path, request: dict[str, Any], *, dry_run: bool = False) -> dict[str, Any]:
    root = cayenne_root(repo_root)
    request_path = root / ".runtime-request.json"
    request_path.write_text(json.dumps(request, indent=2) + "\n", encoding="utf-8")
    try:
        command = [sys.executable, "-m", "cayenne.cli", "run", "--repo-root", str(repo_root), "--request", str(request_path)]
        if dry_run:
            command.append("--dry-run")
        completed = subprocess.run(command, cwd=root, capture_output=True, text=True, check=False)
        if not completed.stdout.strip():
            raise RuntimeError(completed.stderr.strip() or "Cayenne returned no result")
        return json.loads(completed.stdout)
    finally:
        request_path.unlink(missing_ok=True)


def ingest_cayenne_result(repo_root: Path, result: dict[str, Any], required_journeys: list[str] | None = None) -> dict[str, Any]:
    sys.path.insert(0, str(cayenne_root(repo_root)))
    from cayenne.serrano import ingest_result
    return ingest_result(result, required_journeys)

