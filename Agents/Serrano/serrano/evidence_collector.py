from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

from .logging_config import log_event


SECRET_PATTERNS = (
    re.compile(r"(?i)service[_-]?role"),
    re.compile(r"(?i)token"),
    re.compile(r"(?i)password"),
    re.compile(r"(?i)secret"),
    re.compile(r"(?i)api[_-]?key"),
    re.compile(r"(?i)email"),
)


def sanitize_value(value: str) -> str:
    if not value:
        return ""
    return "<redacted>"


def command_output(command: list[str], cwd: Path) -> tuple[int, str, str]:
    completed = subprocess.run(command, cwd=cwd, capture_output=True, text=True, check=False)
    return completed.returncode, completed.stdout.strip(), completed.stderr.strip()


def detect_codex_command(configured: list[str]) -> list[str] | None:
    candidates = [configured, ["codex.cmd", "exec"], ["codex", "exec"]]
    for candidate in candidates:
        try:
            completed = subprocess.run(candidate + ["--help"], capture_output=True, text=True, check=False)
        except OSError:
            continue
        if completed.returncode == 0:
            return candidate
    return None


def collect_repository_inventory(repo_root: Path) -> dict[str, Any]:
    return {
        "app_paths": [
            "crawl/app",
            "crawl/components",
            "crawl/hooks",
            "crawl/lib",
            "crawl/src",
            "crawl/config/features.ts",
            "crawl/lib/analytics.js",
            "crawl/lib/supabase.js",
        ],
        "supabase_paths": [
            "crawl/supabase/migrations",
            "crawl/supabase/functions",
            "crawl/supabase/docs/database_map.md",
            "crawl/supabase/docs/dead_or_risky_tables.md",
            "crawl/supabase/docs/knowing_our_users_roadmap.md",
            "crawl/supabase/docs/user_logging_plan.md",
            "Agents/Jalapeno/supabase/migrations",
        ],
        "marketing_paths": [
            "Agents/Jalapeno",
            "prompt_library",
            "docs/product",
        ],
        "test_paths": [
            "Agents/Jalapeno/tests",
            "crawl/scripts",
        ],
    }


def collect_supabase_env_presence() -> dict[str, Any]:
    keys = [
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SERRANO_SUPABASE_READ_KEY",
        "EXPO_PUBLIC_SUPABASE_URL",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    ]
    return {key: {"present": bool(os.getenv(key, "").strip())} for key in keys}


def redact_dict(payload: dict[str, Any]) -> dict[str, Any]:
    sanitized: dict[str, Any] = {}
    for key, value in payload.items():
        if any(pattern.search(key) for pattern in SECRET_PATTERNS):
            if isinstance(value, dict) and "present" in value:
                sanitized[key] = {"present": bool(value.get("present"))}
            else:
                sanitized[key] = "<redacted>"
            continue
        if isinstance(value, dict):
            sanitized[key] = redact_dict(value)
        elif isinstance(value, list):
            sanitized[key] = [redact_dict(item) if isinstance(item, dict) else item for item in value]
        else:
            sanitized[key] = value
    return sanitized


def collect_evidence_manifest(
    *,
    repo_root: Path,
    run_id: str,
    codex_command: list[str] | None,
    evidence_dir: Path,
    logger=None,
) -> dict[str, Any]:
    git_head_code, git_head, _ = command_output(["git", "rev-parse", "HEAD"], repo_root)
    git_status_code, git_status, _ = command_output(["git", "status", "--short"], repo_root)
    python_code, python_version, python_err = command_output(["python", "--version"], repo_root)
    inventory = collect_repository_inventory(repo_root)
    warnings: list[str] = []
    if codex_command is None:
        warnings.append("Codex CLI was not detected during preflight.")
    manifest = {
        "run_id": run_id,
        "repository_root": str(repo_root),
        "python": {"available": python_code == 0, "version": python_version or python_err},
        "codex": {"available": codex_command is not None, "command": codex_command},
        "git": {
            "head": git_head if git_head_code == 0 else None,
            "working_tree_dirty": bool(git_status.strip()) if git_status_code == 0 else None,
            "working_tree_status": git_status.splitlines() if git_status else [],
        },
        "supabase_environment": collect_supabase_env_presence(),
        "inventory": inventory,
        "schema_and_docs": {
            "database_map": "crawl/supabase/docs/database_map.md",
            "risk_map": "crawl/supabase/docs/dead_or_risky_tables.md",
            "analytics_roadmap": "crawl/supabase/docs/knowing_our_users_roadmap.md",
            "product_review": "docs/product/buffago_product_gamification_recommendations.md",
        },
        "metric_date_ranges": {
            "marketing_review_default_days": 30,
            "retention_default_days": 90,
        },
        "missing_data": [
            "Live production telemetry availability is unknown until safe Supabase access succeeds.",
            "Some schema exports are documented as incomplete or stale.",
        ],
        "warnings": warnings,
        "commands_executed": [
            "git rev-parse HEAD",
            "git status --short",
            "python --version",
        ],
    }
    evidence_dir.mkdir(parents=True, exist_ok=True)
    path = evidence_dir / "evidence_manifest.json"
    path.write_text(json.dumps(redact_dict(manifest), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    log_event(logger, "evidence_manifest_written", path=path)
    return manifest
