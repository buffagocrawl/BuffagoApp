from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

JALAPENO_ROOT = Path(__file__).resolve().parents[1]
if str(JALAPENO_ROOT) not in sys.path:
    sys.path.insert(0, str(JALAPENO_ROOT))

from wing_processing_worker.models import (  # noqa: E402
    CleanupClaim,
    JobKind,
    ProcessingClaim,
    ProcessingContext,
)
from wing_processing_worker.repository import ProcessingRepository  # noqa: E402


class FakeResponse:
    status_code = 200
    content = b'{"signedURL":"/object/sign/opaque"}'

    def json(self):
        return {"signedURL": "/object/sign/opaque"}

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def iter_content(self, _size):
        yield b"private-bytes"


class FakeSession:
    def __init__(self):
        self.posts = []
        self.gets = []
        self.deletes = []

    def post(self, endpoint, **kwargs):
        self.posts.append((endpoint, kwargs))
        return FakeResponse()

    def get(self, url, **kwargs):
        self.gets.append((url, kwargs))
        return FakeResponse()

    def delete(self, url, **kwargs):
        self.deletes.append((url, kwargs))
        return FakeResponse()


class FakeClient:
    def __init__(self):
        self.calls = []
        self.uploads = []
        self.config = SimpleNamespace(
            url="https://project.supabase.co",
            timeout_seconds=30,
        )
        self._session = FakeSession()

    def request(self, method, path, *, json_payload):
        self.calls.append((method, path, json_payload))
        if path.endswith("claim_wing_processing_job"):
            return {
                "job_id": str(uuid4()),
                "submission_id": str(uuid4()),
                "job_kind": "photo_process",
                "claim_token": str(uuid4()),
            }
        if path.endswith("enqueue_wing_processing_backlog"):
            return 0
        return {}

    def _storage_endpoint(self, path):
        return f"https://project.supabase.co/storage/v1/{path}"

    def upload_storage_object(self, bucket, path, **kwargs):
        self.uploads.append((bucket, path, kwargs))
        return {}


def test_repository_claims_through_real_rpc_name_and_private_signed_url(tmp_path):
    client = FakeClient()
    repository = ProcessingRepository(client)
    claim = repository.claim(worker_id="worker-1", lease_seconds=180)
    assert claim is not None
    assert client.calls[0][1] == "rpc/claim_wing_processing_job"
    assert client.calls[0][2] == {
        "p_worker": "worker-1",
        "p_lease_seconds": 180,
    }
    context = ProcessingContext(
        submission_id=claim.submission_id,
        media_type="photo",
        bucket="wing-submissions",
        original_path=(
            f"originals/{uuid4()}/{claim.submission_id}/source"
        ),
        processed_path=f"processed/{claim.submission_id}/primary",
        thumbnail_path=f"thumbnails/{claim.submission_id}/preview",
        correlation_id=uuid4(),
    )
    destination = tmp_path / "source"
    repository.download_original(context, destination, maximum_bytes=100)
    assert destination.read_bytes() == b"private-bytes"
    endpoint, payload = client._session.posts[0]
    assert "/object/sign/wing-submissions/originals/" in endpoint
    assert payload["json"]["expiresIn"] == 120
    assert client._session.gets[0][1]["stream"] is True


def test_repository_records_actual_moderation_fingerprint_and_settlement_rpcs():
    client = FakeClient()
    repository = ProcessingRepository(client)
    submission_id = uuid4()
    claim = ProcessingClaim(
        job_id=uuid4(),
        submission_id=submission_id,
        job_kind=JobKind.PHOTO,
        claim_token=uuid4(),
    )
    context = ProcessingContext(
        submission_id=submission_id,
        media_type="photo",
        bucket="wing-submissions",
        original_path=f"originals/{uuid4()}/{submission_id}/source",
        processed_path=f"processed/{submission_id}/primary",
        thumbnail_path=f"thumbnails/{submission_id}/preview",
        correlation_id=uuid4(),
    )
    repository.record_moderation(context, payload={"strict": "fixture"})
    repository.record_fingerprint(
        context,
        algorithm="phash",
        version="1",
        fingerprint="0" * 16,
        nearest_submission_id=None,
        similarity=None,
    )
    repository.settle_success(
        claim,
        context,
        perceptual_hash="0" * 16,
    )
    paths = [call[1] for call in client.calls]
    assert paths == [
        "rpc/record_wing_ai_moderation",
        "rpc/record_wing_fingerprint",
        "rpc/settle_wing_processing_job",
    ]


def test_cleanup_delete_uses_only_claimed_exact_private_path():
    client = FakeClient()
    repository = ProcessingRepository(client)
    claim = CleanupClaim.from_payload(
        {
            "job_id": str(uuid4()),
            "cleanup_kind": "abandoned_upload",
            "bucket": "wing-submissions",
            "object_path": f"originals/{uuid4()}/{uuid4()}/source",
            "claim_token": str(uuid4()),
            "correlation_id": str(uuid4()),
        }
    )
    assert repository.delete_cleanup_object(claim) == "deleted"
    endpoint, request = client._session.deletes[0]
    assert endpoint.endswith(claim.object_path)
    assert request == {"timeout": 30}
