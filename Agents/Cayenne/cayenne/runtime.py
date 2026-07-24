from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .contracts import ContractError, SCHEMA_VERSION, evidence_id, validate_request, validate_result, write_json


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class CayenneRuntime:
    def __init__(self, repo_root: Path, artifact_root: Path | None = None) -> None:
        self.repo_root = repo_root.resolve()
        self.artifact_root = (artifact_root or self.repo_root / "artifacts" / "cayenne").resolve()

    def check_prerequisites(self) -> dict:
        commands = {name: shutil.which(name) for name in ("node", "npm", "python", "adb", "java", "emulator", "maestro")}
        return {"repository": str(self.repo_root), "commands": commands, "android_home": bool(os.getenv("ANDROID_HOME")), "qa_environment_configured": bool(os.getenv("EXPO_PUBLIC_SUPABASE_URL"))}

    def run(self, request: dict, *, dry_run: bool = False) -> dict:
        request = validate_request(request)
        run_id = f"{datetime.now().strftime('%Y%m%dT%H%M%S')}-{uuid4().hex[:8]}"
        run_dir = self.artifact_root / run_id
        for name in ("build", "runtime", "fixtures", "journeys", "visual", "accessibility", "failures", "serrano"):
            (run_dir / name).mkdir(parents=True, exist_ok=True)
        write_json(run_dir / "request.json", request)
        preflight = self.check_prerequisites()
        write_json(run_dir / "environment.json", preflight)
        write_json(run_dir / "tool-versions.json", {"cayenne": "1.0.0", "dry_run": dry_run})
        lock = run_dir / ".run.lock"
        lock.write_text(run_id, encoding="utf-8")
        started = now()
        journeys = []
        failures = []
        missing = []
        build = {"status": "skipped" if dry_run else "not_run"}
        launch = {"status": "skipped" if dry_run else "not_run"}
        try:
            if not dry_run:
                build["status"] = "blocked"
                build["reason"] = "Android/web execution adapter requires a configured local runtime; no claim of pass was made."
                missing.append("runtime execution adapter")
            for journey_id in request["required_journeys"]:
                result = {"journey_id": journey_id, "feature": (request.get("changed_features") or ["unspecified"])[0], "status": "inconclusive", "steps": [], "screenshots": [], "logs": [], "database_assertions": [], "fixture": None}
                journeys.append(result)
                missing.append(f"journey:{journey_id}")
            status = "inconclusive" if missing else "passed"
            result = {"schema_version": SCHEMA_VERSION, "run_id": run_id, "request_id": request["request_id"], "tested_commit": request.get("commit") or self._git_head(), "base_commit": request.get("base_commit"), "environment": request["environment"], "platforms": request["platforms"], "started_at": started, "finished_at": now(), "status": status, "required_journeys": request["required_journeys"], "build": build, "launch": launch, "journeys": journeys, "visual": [], "database_assertions": [], "accessibility": [], "failures": failures, "infrastructure_incidents": [{"classification": "environment_failure", "message": "Execution adapter not available"}] if missing else [], "evidence": [{"id": evidence_id(run_id, "request.json"), "path": "request.json"}], "cleanup": {"status": "passed", "lock_removed": False}, "missing_evidence": missing, "redaction": {"status": "passed"}, "tool_versions": {"cayenne": "1.0.0"}, "flakiness": {"retry_count": 0}, "serrano_consumption_ready": True}
            validate_result(result)
            result["cleanup"]["lock_removed"] = True
            write_json(run_dir / "result.json", result)
            (run_dir / "summary.md").write_text(f"# Cayenne run {run_id}\n\nStatus: **{status}**\n\nMissing evidence: {len(missing)}\n", encoding="utf-8")
            return result
        finally:
            if lock.exists():
                lock.unlink()

    def _git_head(self) -> str:
        completed = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.repo_root, capture_output=True, text=True, check=False)
        return completed.stdout.strip() if completed.returncode == 0 else "unknown"
