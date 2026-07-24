from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from cayenne.contracts import ContractError, validate_request, validate_result  # noqa: E402
from cayenne.fixtures import validate_fixture_request  # noqa: E402
from cayenne.runtime import CayenneRuntime  # noqa: E402
from cayenne.serrano import ingest_result, journeys_for_features  # noqa: E402


def request() -> dict:
    return {"schema_version": "1.0", "request_id": "r1", "requested_by": "serrano", "repository": "BuffagoApp", "environment": "qa", "platforms": ["web"], "suite": "smoke", "required_journeys": ["launch-smoke"], "options": {}}


def test_valid_request_and_production_are_rejected():
    assert validate_request(request())["schema_version"] == "1.0"
    with pytest.raises(ContractError, match="environment"):
        validate_request({**request(), "environment": "production"})


def test_unsupported_version_and_false_pass_are_rejected():
    with pytest.raises(ContractError, match="unsupported"):
        validate_request({**request(), "schema_version": "9.0"})
    with pytest.raises(ContractError, match="cannot claim passed"):
        validate_result({"schema_version": "1.0", "run_id": "x", "request_id": "r1", "tested_commit": "x", "environment": "qa", "platforms": ["web"], "status": "passed", "build": {}, "launch": {}, "journeys": [{"journey_id": "launch-smoke", "status": "failed"}], "failures": [], "evidence": [], "cleanup": {}, "missing_evidence": []})


def test_fixture_guard_is_allowlisted_and_qa_only():
    assert validate_fixture_request("qa", "qa_seed_new_user", "cayenne-alice@qa.buffago.test")["auditable"]
    with pytest.raises(ContractError):
        validate_fixture_request("production", "qa_seed_new_user", "cayenne-alice@qa.buffago.test")
    with pytest.raises(ContractError):
        validate_fixture_request("qa", "arbitrary_sql", "cayenne-alice@qa.buffago.test")


def test_feature_mapping_is_deterministic():
    assert journeys_for_features(["buffaverse", "rating"]) == ["buffaverse-eligible-entry", "buffaverse-locked-entry", "rating-submit"]


def test_dry_run_is_inconclusive_and_has_artifacts(tmp_path: Path):
    result = CayenneRuntime(ROOT.parent, tmp_path).run(request(), dry_run=True)
    assert result["status"] == "inconclusive"
    run_dir = tmp_path / result["run_id"]
    assert (run_dir / "request.json").exists()
    assert (run_dir / "result.json").exists()
    assert not (run_dir / ".run.lock").exists()


def test_ingestion_detects_missing_evidence():
    result = {"schema_version": "1.0", "run_id": "x", "request_id": "r1", "tested_commit": "x", "environment": "qa", "platforms": ["web"], "status": "inconclusive", "build": {}, "launch": {}, "required_journeys": ["launch-smoke"], "journeys": [], "failures": [], "evidence": [], "cleanup": {}, "missing_evidence": ["journey:launch-smoke"]}
    assert ingest_result(result)["decision"] == "INSUFFICIENT_EVIDENCE"
