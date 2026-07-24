from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "1.0"
ENVIRONMENTS = {"local", "development", "qa", "staging"}
PLATFORMS = {"android", "web", "ios"}
STATUSES = {"passed", "failed", "skipped", "inconclusive"}
FAILURE_CLASSES = {"product_failure", "test_script_failure", "environment_failure", "build_failure", "backend_fixture_failure", "external_dependency_failure", "visual_regression", "accessibility_failure", "performance_failure", "inconclusive"}
DECISIONS = {"APPROVED", "APPROVED_WITH_FOLLOWUPS", "CHANGES_REQUIRED", "BLOCKED_BY_RUNTIME_FAILURE", "INSUFFICIENT_EVIDENCE", "TEST_INFRASTRUCTURE_FAILURE"}
_SECRET = re.compile(r"(?i)(token|secret|password|service[_-]?role|api[_-]?key|authorization)")


class ContractError(ValueError):
    pass


def _required(payload: dict[str, Any], keys: tuple[str, ...]) -> None:
    missing = [key for key in keys if key not in payload]
    if missing:
        raise ContractError(f"missing required fields: {', '.join(missing)}")


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: ("<redacted>" if _SECRET.search(key) else redact(item)) for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


def validate_request(payload: dict[str, Any]) -> dict[str, Any]:
    _required(payload, ("schema_version", "request_id", "requested_by", "repository", "environment", "platforms", "suite", "required_journeys", "options"))
    if payload["schema_version"] != SCHEMA_VERSION:
        raise ContractError(f"unsupported request schema version: {payload['schema_version']}")
    if payload["requested_by"] != "serrano":
        raise ContractError("Cayenne requests must be issued by Serrano")
    if payload["environment"] not in ENVIRONMENTS:
        raise ContractError("Cayenne fixture mutation is only allowed in local, development, QA, or staging environments")
    if not payload["platforms"] or not set(payload["platforms"]).issubset(PLATFORMS):
        raise ContractError("platforms must contain supported values")
    if not isinstance(payload["required_journeys"], list) or not payload["required_journeys"]:
        raise ContractError("required_journeys must be a non-empty list")
    return redact(payload)


def validate_result(payload: dict[str, Any]) -> dict[str, Any]:
    _required(payload, ("schema_version", "run_id", "request_id", "tested_commit", "environment", "platforms", "status", "build", "launch", "journeys", "failures", "evidence", "cleanup", "missing_evidence"))
    if payload["schema_version"] != SCHEMA_VERSION:
        raise ContractError(f"unsupported result schema version: {payload['schema_version']}")
    if payload["environment"] == "production":
        raise ContractError("production is not a Cayenne execution environment")
    if payload["status"] == "passed":
        required = set(payload.get("required_journeys", []))
        failed = {j.get("journey_id") for j in payload["journeys"] if j.get("status") != "passed"}
        if failed or payload["missing_evidence"]:
            raise ContractError("result cannot claim passed with failed journeys or missing evidence")
    return redact(payload)


def validate_failure(payload: dict[str, Any]) -> dict[str, Any]:
    _required(payload, ("failure_id", "classification", "severity", "confidence", "expected", "actual", "evidence"))
    if payload["classification"] not in FAILURE_CLASSES:
        raise ContractError(f"unsupported failure classification: {payload['classification']}")
    if not 0 <= float(payload["confidence"]) <= 1:
        raise ContractError("confidence must be between 0 and 1")
    return redact(payload)


def evidence_id(run_id: str, relative_path: str) -> str:
    return f"ev-{hashlib.sha256(f'{run_id}:{relative_path}'.encode()).hexdigest()[:16]}"


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(redact(payload), indent=2, sort_keys=True) + "\n", encoding="utf-8")

