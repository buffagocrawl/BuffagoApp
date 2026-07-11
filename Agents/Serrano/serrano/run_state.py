from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stable_hash(payload: Any) -> str:
    rendered = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(rendered).hexdigest()


@dataclass(frozen=True, slots=True)
class RunPaths:
    run_dir: Path
    state_dir: Path
    worker_dir: Path
    evidence_dir: Path
    artifact_dir: Path
    schema_dir: Path
    log_path: Path
    state_path: Path


def build_run_paths(run_dir: Path) -> RunPaths:
    return RunPaths(
        run_dir=run_dir,
        state_dir=run_dir / "state",
        worker_dir=run_dir / "workers",
        evidence_dir=run_dir / "evidence",
        artifact_dir=run_dir / "artifacts",
        schema_dir=run_dir / "schemas",
        log_path=run_dir / "logs" / "serrano.log",
        state_path=run_dir / "state" / "run_state.json",
    )


class RunStateStore:
    def __init__(self, paths: RunPaths) -> None:
        self.paths = paths

    def initialize(self, run_id: str) -> dict[str, Any]:
        for directory in (
            self.paths.run_dir,
            self.paths.state_dir,
            self.paths.worker_dir,
            self.paths.evidence_dir,
            self.paths.artifact_dir,
            self.paths.schema_dir,
            self.paths.log_path.parent,
        ):
            directory.mkdir(parents=True, exist_ok=True)
        state = {
            "run_id": run_id,
            "status": "running_discovery",
            "current_phase": "preflight",
            "completed_workers": [],
            "failed_workers": [],
            "approved_plan_hash": None,
            "approval": None,
            "artifacts": {},
            "workers": {},
            "commands_executed": [],
            "started_at": utc_now(),
            "updated_at": utc_now(),
        }
        self.save(state)
        return state

    def load(self) -> dict[str, Any]:
        with self.paths.state_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def save(self, state: dict[str, Any]) -> None:
        state["updated_at"] = utc_now()
        self.paths.state_path.parent.mkdir(parents=True, exist_ok=True)
        with self.paths.state_path.open("w", encoding="utf-8") as handle:
            json.dump(state, handle, indent=2, sort_keys=True)
            handle.write("\n")

    def update(self, state: dict[str, Any], **changes: Any) -> dict[str, Any]:
        state.update(changes)
        self.save(state)
        return state

