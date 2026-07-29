from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from uuid import uuid4

import pytest
from PIL import Image

JALAPENO_ROOT = Path(__file__).resolve().parents[1]
if str(JALAPENO_ROOT) not in sys.path:
    sys.path.insert(0, str(JALAPENO_ROOT))

from wing_media_processing import (  # noqa: E402
    PermanentMediaError,
    VideoArtifacts,
    WingMediaProcessor,
)
from wing_processing_worker.errors import (  # noqa: E402
    ProviderConfigurationError,
    ProviderContractError,
    ProviderTemporaryError,
)
from wing_processing_worker.models import (  # noqa: E402
    CleanupClaim,
    FingerprintCandidate,
    JobKind,
    ProcessingClaim,
    ProcessingContext,
)
from wing_processing_worker.moderation import (  # noqa: E402
    HttpModerationProvider,
    ManualReviewProvider,
    ManualReviewTestProvider,
    ModerationResult,
)
from wing_processing_worker.cli import build_provider  # noqa: E402
from wing_processing_worker.worker import WingProcessingWorker  # noqa: E402


def _moderation_payload(**overrides):
    payload = {
        "contains_food": True,
        "contains_chicken_wings": True,
        "wing_confidence": 0.97,
        "nudity_or_sexual_content": False,
        "graphic_content": False,
        "weapons": False,
        "hate_symbols": False,
        "illegal_activity": False,
        "intoxication_concern": False,
        "minors_visible": False,
        "personal_information_visible": False,
        "faces_visible": False,
        "alcohol_dominant": False,
        "offensive_text": False,
        "spam_probability": 0.02,
        "duplicate_probability": 0.03,
        "quality_score": 88.0,
        "moderation_recommendation": "likely_acceptable",
        "explanation": "Food image likely contains chicken wings.",
        "model": "fixture-model",
        "version": "2026-07-29",
        "evaluated_at": "2026-07-29T12:00:00+00:00",
    }
    payload.update(overrides)
    return payload


class FixtureProvider:
    def __init__(self, result=None, error=None):
        self.result = result or ModerationResult.from_mapping(_moderation_payload())
        self.error = error

    def evaluate(self, media_path: Path, *, media_type: str) -> ModerationResult:
        assert media_path.exists()
        assert media_type in {"photo", "video"}
        if self.error:
            raise self.error
        return self.result


class FakeRepository:
    def __init__(self, source: Path, *, media_type: str = "photo"):
        self.submission_id = uuid4()
        self.next_claim = ProcessingClaim(
            job_id=uuid4(),
            submission_id=self.submission_id,
            job_kind=(
                JobKind.PHOTO if media_type == "photo" else JobKind.VIDEO
            ),
            claim_token=uuid4(),
        )
        self.context = ProcessingContext(
            submission_id=self.submission_id,
            media_type=media_type,
            bucket="wing-submissions",
            original_path=f"originals/{uuid4()}/{self.submission_id}/source",
            processed_path=f"processed/{self.submission_id}/primary",
            thumbnail_path=f"thumbnails/{self.submission_id}/preview",
            correlation_id=uuid4(),
        )
        self.source = source
        self.calls = []
        self.uploads = {}
        self.candidates = []
        self.failure = None
        self.moderation_payload = None
        self.fingerprint = None
        self.cleanup_claim = None
        self.cleanup_receipt = None

    def enqueue_backlog(self, *, limit):
        self.calls.append(("enqueue", limit))
        return 0

    def claim(self, *, worker_id, lease_seconds):
        self.calls.append(("claim", worker_id, lease_seconds))
        claim, self.next_claim = self.next_claim, None
        return claim

    def begin(self, claim):
        self.calls.append(("begin", claim.job_id))
        return self.context

    def download_original(self, context, destination, *, maximum_bytes):
        assert self.source.stat().st_size < maximum_bytes
        destination.write_bytes(self.source.read_bytes())
        self.calls.append(("download",))

    def upload_artifact(
        self, context, *, storage_path, local_path, content_type
    ):
        self.uploads[storage_path] = (local_path.read_bytes(), content_type)
        self.calls.append(("upload", storage_path))

    def fingerprint_candidates(self, context, *, algorithm, version):
        self.calls.append(("candidates", algorithm, version))
        return self.candidates

    def record_moderation(self, context, *, payload):
        self.moderation_payload = payload
        self.calls.append(("moderation",))

    def record_fingerprint(self, context, **payload):
        self.fingerprint = payload
        self.calls.append(("fingerprint",))

    def settle_success(self, claim, context, *, perceptual_hash):
        self.calls.append(("success", perceptual_hash))
        return {"job_status": "succeeded", "submission_status": "in_review"}

    def settle_failure(
        self, claim, *, retryable, error_code, error_reason
    ):
        self.failure = (retryable, error_code, error_reason)
        self.calls.append(("failure", error_code))
        return {
            "job_status": "retry" if retryable else "dead",
            "submission_status": "processing" if retryable else "failed",
        }

    def enqueue_cleanup(self, *, limit):
        self.calls.append(("enqueue_cleanup", limit))
        return 0

    def claim_cleanup(self, *, worker_id, lease_seconds):
        self.calls.append(("claim_cleanup", worker_id, lease_seconds))
        claim, self.cleanup_claim = self.cleanup_claim, None
        return claim

    def delete_cleanup_object(self, claim):
        self.calls.append(("delete_cleanup", claim.job_id))
        return "deleted"

    def finish_cleanup(
        self, claim, *, outcome, retryable=False, error_code=None
    ):
        self.cleanup_receipt = (outcome, retryable, error_code)
        self.calls.append(("finish_cleanup", outcome))
        return {"status": "succeeded", "outcome": outcome}


def test_strict_moderation_contract_rejects_missing_extra_and_wrong_types():
    valid = _moderation_payload()
    assert ModerationResult.from_mapping(valid).wing_confidence == 0.97
    for invalid in (
        {key: value for key, value in valid.items() if key != "faces_visible"},
        {**valid, "identity": "someone"},
        {**valid, "minors_visible": "false"},
        {**valid, "quality_score": 101},
        {**valid, "evaluated_at": "2026-07-29"},
    ):
        with pytest.raises(ProviderContractError):
            ModerationResult.from_mapping(invalid)


def test_no_key_adapter_always_routes_to_manual_review(tmp_path):
    result = ManualReviewTestProvider().evaluate(
        tmp_path / "not-read", media_type="photo"
    )
    assert result.moderation_recommendation == "manual_review"
    assert result.wing_confidence == 0.5
    assert result.model == "manual-review-test-adapter"


def test_test_adapter_is_impossible_in_production(monkeypatch):
    monkeypatch.setenv("WING_MODERATION_PROVIDER_MODE", "manual-review-test")
    monkeypatch.setenv("WING_PROCESSING_ALLOW_TEST_PROVIDER", "true")
    monkeypatch.setenv("WING_PROCESSING_ENVIRONMENT", "production")
    with pytest.raises(ProviderConfigurationError):
        build_provider()


def test_production_manual_review_mode_requires_no_provider_credentials(monkeypatch):
    monkeypatch.setenv("WING_MODERATION_PROVIDER_MODE", "manual-review")
    monkeypatch.setenv("WING_PROCESSING_ENVIRONMENT", "production")
    monkeypatch.delenv("WING_MODERATION_PROVIDER_URL", raising=False)
    monkeypatch.delenv("WING_MODERATION_API_KEY", raising=False)
    monkeypatch.delenv("WING_MODERATION_MODEL", raising=False)
    monkeypatch.delenv("WING_MODERATION_MODEL_VERSION", raising=False)

    provider = build_provider()

    assert isinstance(provider, ManualReviewProvider)
    assert provider.evaluate(Path("not-read"), media_type="video").moderation_recommendation == "manual_review"


class ProviderResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload or _moderation_payload()
        self.content = json.dumps(self._payload).encode()

    def json(self):
        return self._payload


class ProviderSession:
    def __init__(self, response):
        self.response = response
        self.request = None

    def post(self, endpoint, **kwargs):
        self.request = (endpoint, kwargs)
        return self.response


def test_http_provider_sends_only_media_and_non_identity_contract(tmp_path):
    media = tmp_path / "processed.jpg"
    media.write_bytes(b"fixture")
    session = ProviderSession(ProviderResponse())
    provider = HttpModerationProvider(
        endpoint="https://moderation.example.test/v1/wing-shots",
        api_key="test-secret",
        model="wing-safety",
        model_version="1",
        session=session,
    )
    result = provider.evaluate(media, media_type="photo")
    assert result.contains_chicken_wings is True
    _, request = session.request
    assert set(request["data"]) == {
        "schema_version",
        "model",
        "model_version",
        "prohibited_capability",
    }
    assert set(request["files"]) == {"media"}
    assert request["data"]["prohibited_capability"] == "facial_identification"
    assert "caption" not in json.dumps(request["data"])
    assert "storage" not in json.dumps(request["data"])


@pytest.mark.parametrize("status", [429, 500, 503])
def test_http_provider_retries_rate_limits_and_server_failures(tmp_path, status):
    media = tmp_path / "processed.jpg"
    media.write_bytes(b"fixture")
    provider = HttpModerationProvider(
        endpoint="https://moderation.example.test/v1/wing-shots",
        api_key="test-secret",
        model="wing-safety",
        model_version="1",
        session=ProviderSession(ProviderResponse(status_code=status)),
    )
    with pytest.raises(ProviderTemporaryError):
        provider.evaluate(media, media_type="photo")


def test_photo_worker_processes_private_derivatives_and_records_duplicate_last(
    tmp_path, caplog
):
    source = tmp_path / "fixture.png"
    image = Image.new("RGB", (900, 600), (187, 56, 31))
    exif = Image.Exif()
    exif[270] = "private-test-metadata"
    image.save(source, format="PNG", exif=exif)
    repository = FakeRepository(source)
    repository.candidates = [
        FingerprintCandidate(uuid4(), "0000000000000000")
    ]
    worker = WingProcessingWorker(
        repository=repository,
        processor=WingMediaProcessor(),
        moderation_provider=FixtureProvider(),
        worker_id="test-photo-worker",
    )
    with caplog.at_level(logging.INFO):
        outcome = worker.run_once()

    assert outcome.status == "IN_REVIEW"
    assert repository.context.processed_path in repository.uploads
    assert repository.context.thumbnail_path in repository.uploads
    assert f"processed/{repository.submission_id}/square" in repository.uploads
    assert f"processed/{repository.submission_id}/portrait" in repository.uploads
    with Image.open(
        __import__("io").BytesIO(
            repository.uploads[repository.context.processed_path][0]
        )
    ) as processed:
        assert not processed.getexif()
        assert max(processed.size) <= 2048
    call_names = [call[0] for call in repository.calls]
    assert call_names.index("moderation") < call_names.index("fingerprint")
    assert repository.fingerprint["algorithm"] == "phash"
    logs = "\n".join(record.message for record in caplog.records)
    assert repository.context.original_path not in logs
    assert "private-test-metadata" not in logs


class FakeVideoProcessor:
    class Limits:
        max_photo_bytes = 20 * 1024 * 1024
        max_video_bytes = 50 * 1024 * 1024

    limits = Limits()

    def process(self, source, output, *, submission_id):
        output.mkdir()
        processed = output / "processed.mp4"
        thumbnail = output / "thumbnail.jpg"
        processed.write_bytes(b"muted-video-fixture")
        thumbnail.write_bytes(b"thumbnail-fixture")
        return VideoArtifacts(
            processed_path=processed,
            thumbnail_path=thumbnail,
            fingerprint="a" * 64,
            source_mime="video/mp4",
            duration_seconds=7.0,
        )


def test_mock_video_duplicate_is_folded_into_moderation_probability(tmp_path):
    source = tmp_path / "source.mp4"
    source.write_bytes(b"synthetic-video")
    repository = FakeRepository(source, media_type="video")
    duplicate_id = uuid4()
    repository.candidates = [
        FingerprintCandidate(duplicate_id, "a" * 64)
    ]
    worker = WingProcessingWorker(
        repository=repository,
        processor=FakeVideoProcessor(),
        moderation_provider=FixtureProvider(),
        worker_id="test-video-worker",
    )
    assert worker.run_once().status == "IN_REVIEW"
    assert repository.moderation_payload["duplicate_probability"] == 1.0
    assert repository.fingerprint["nearest_submission_id"] == duplicate_id
    assert repository.fingerprint["similarity"] == 1.0


class PermanentFailureProcessor:
    class Limits:
        max_photo_bytes = 20 * 1024 * 1024
        max_video_bytes = 50 * 1024 * 1024

    limits = Limits()

    def process(self, source, output, *, submission_id):
        raise PermanentMediaError("fixture validation failure")


def test_invalid_media_dead_letters_without_retry(tmp_path):
    source = tmp_path / "malformed"
    source.write_bytes(b"this is not media")
    repository = FakeRepository(source)
    outcome = WingProcessingWorker(
        repository=repository,
        processor=PermanentFailureProcessor(),
        moderation_provider=FixtureProvider(),
        worker_id="test-invalid-worker",
    ).run_once()
    assert outcome.status == "DEAD"
    assert repository.failure[:2] == (False, "INVALID_MEDIA")


def test_temporary_provider_failure_requests_bounded_database_retry(tmp_path):
    source = tmp_path / "fixture.jpg"
    Image.new("RGB", (64, 64), "orange").save(source)
    repository = FakeRepository(source)
    outcome = WingProcessingWorker(
        repository=repository,
        processor=WingMediaProcessor(),
        moderation_provider=FixtureProvider(error=ProviderTemporaryError()),
        worker_id="test-retry-worker",
    ).run_once()
    assert outcome.status == "RETRY"
    assert repository.failure[:2] == (
        True,
        "MODERATION_PROVIDER_TEMPORARY_FAILURE",
    )


def test_worker_logs_only_opaque_identifiers(tmp_path, caplog):
    source = tmp_path / "bad"
    source.write_bytes(b"user caption: private / secret-token")
    repository = FakeRepository(source)
    with caplog.at_level(logging.INFO):
        WingProcessingWorker(
            repository=repository,
            processor=WingMediaProcessor(),
            moderation_provider=FixtureProvider(),
            worker_id="test-safe-log-worker",
        ).run_once()
    parsed = [
        json.loads(record.message)
        for record in caplog.records
        if record.message.startswith("{")
    ]
    assert parsed
    assert "secret-token" not in json.dumps(parsed)
    assert repository.context.original_path not in json.dumps(parsed)


def test_cleanup_worker_deletes_only_server_claimed_original_and_audits(tmp_path):
    source = tmp_path / "unused"
    source.write_bytes(b"fixture")
    repository = FakeRepository(source)
    object_path = (
        f"originals/{uuid4()}/{repository.submission_id}/source"
    )
    repository.cleanup_claim = CleanupClaim.from_payload(
        {
            "job_id": str(uuid4()),
            "cleanup_kind": "expired_original",
            "bucket": "wing-submissions",
            "object_path": object_path,
            "claim_token": str(uuid4()),
            "correlation_id": str(uuid4()),
        }
    )
    outcome = WingProcessingWorker(
        repository=repository,
        processor=WingMediaProcessor(),
        moderation_provider=FixtureProvider(),
        worker_id="test-cleanup-worker",
    ).run_cleanup_once()
    assert outcome.status == "SUCCEEDED"
    assert repository.cleanup_receipt == ("deleted", False, None)
    assert [call[0] for call in repository.calls] == [
        "enqueue_cleanup",
        "claim_cleanup",
        "delete_cleanup",
        "finish_cleanup",
    ]
