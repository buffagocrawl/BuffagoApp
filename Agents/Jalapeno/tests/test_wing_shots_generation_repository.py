from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import UUID

from wing_shots.generation import GeneratedAssets
from wing_shots.generation_repository import SupabaseGenerationRepository


SUBMISSION_ID = "11111111-1111-4111-8111-111111111111"
GENERATION_ID = "22222222-2222-4222-8222-222222222222"
CLAIM_TOKEN = "33333333-3333-4333-8333-333333333333"
CORRELATION_ID = "44444444-4444-4444-8444-444444444444"
INSTAGRAM_ID = "55555555-5555-4555-8555-555555555555"
FACEBOOK_ID = "66666666-6666-4666-8666-666666666666"


class RecordingClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def request(self, method, path, *, json_payload):
        assert method == "POST"
        self.calls.append((path, json_payload))
        if path.endswith("claim_wing_generation_job"):
            return {
                "job_id": GENERATION_ID,
                "submission_id": SUBMISSION_ID,
                "claim_token": CLAIM_TOKEN,
                "instagram_media_path": (
                    f"publication/{SUBMISSION_ID}/instagram/{INSTAGRAM_ID}"
                ),
                "facebook_media_path": (
                    f"publication/{SUBMISSION_ID}/facebook/{FACEBOOK_ID}"
                ),
            }
        if path.endswith("begin_wing_generation_job"):
            return {
                "job_id": GENERATION_ID,
                "submission_id": SUBMISSION_ID,
                "claim_token": CLAIM_TOKEN,
                "correlation_id": CORRELATION_ID,
                "bucket": "wing-submissions",
                "media_type": "photo",
                "processed_path": f"processed/{SUBMISSION_ID}/primary",
                "instagram_media_path": (
                    f"publication/{SUBMISSION_ID}/instagram/{INSTAGRAM_ID}"
                ),
                "facebook_media_path": (
                    f"publication/{SUBMISSION_ID}/facebook/{FACEBOOK_ID}"
                ),
                "restaurant_name": "Anchor Bar",
                "city": "Buffalo",
                "state_code": "NY",
                "overall": 9,
                "crispiness": 8,
                "sauce": 9,
                "meat": 7,
                "spice_level": 6,
                "would_order_again": True,
                "attribution": "@wingfan",
                "anonymous_attribution": False,
            }
        if path.endswith("complete_wing_generation"):
            return {"submission_status": "ready_to_post"}
        if path.endswith("fail_wing_generation_job"):
            return {"job_status": "retry"}
        raise AssertionError(path)


def test_repository_uses_actual_claim_begin_and_complete_contracts() -> None:
    client = RecordingClient()
    repository = SupabaseGenerationRepository(client)
    claim = repository.claim_generation(
        worker_id="jalapeno-wing-generation",
        lease_seconds=600,
    )
    assert claim is not None
    context = repository.begin_generation(claim)
    assets = GeneratedAssets(
        instagram_path=Path("instagram.jpg"),
        facebook_path=Path("facebook.jpg"),
        instagram_post_type="photo",
        facebook_post_type="photo",
        instagram_caption="Instagram caption",
        facebook_caption="Facebook caption",
        metadata={
            "source": "community_submission",
            "source_processed_path": context.processed_path,
            "generator_version": "test",
            "instagram_alt_text": "Community wings.",
            "facebook_alt_text": "Community wings.",
        },
    )
    receipt = repository.complete_generation(claim, assets)
    assert receipt["submission_status"] == "ready_to_post"
    assert [path for path, _ in client.calls] == [
        "rpc/claim_wing_generation_job",
        "rpc/begin_wing_generation_job",
        "rpc/complete_wing_generation",
    ]
    assert client.calls[-1][1]["p_metadata"]["source"] == (
        "community_submission"
    )


def test_repository_failure_settlement_is_bounded_and_claim_bound() -> None:
    client = RecordingClient()
    repository = SupabaseGenerationRepository(client)
    claim = repository.claim_generation(
        worker_id="jalapeno-wing-generation",
        lease_seconds=600,
    )
    assert claim is not None
    receipt = repository.fail_generation(
        claim,
        retryable=True,
        error_code="TEMPORARY_TOOL_FAILURE",
        error_reason="Temporary dependency failed.",
    )
    assert receipt["job_status"] == "retry"
    path, payload = client.calls[-1]
    assert path == "rpc/fail_wing_generation_job"
    assert payload["p_claim_token"] == str(UUID(CLAIM_TOKEN))
    assert payload["p_retryable"] is True
