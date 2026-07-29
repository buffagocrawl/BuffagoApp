from __future__ import annotations

from wing_shots.models import Platform, SocialJob
from wing_shots.publishers import (
    FacebookPublisher,
    HttpResponse,
    InstagramPublisher,
    MetaConfig,
)


def job(
    platform: Platform,
    *,
    dry_run: bool = False,
    media_type: str = "photo",
    external_post_id: str | None = None,
    container_id: str | None = None,
) -> SocialJob:
    job_id = f"job-{platform.value}"
    return SocialJob(
        job_id=job_id,
        submission_id="submission-1",
        platform=platform,
        media_type=media_type,
        generated_media_path=(
            f"publication/submission-1/{platform.value}/{job_id}"
        ),
        generated_caption="Real community wings rated on BuffaGo.",
        generated_alt_text="A community-submitted plate of wings.",
        idempotency_key=f"idempotency-{platform.value}",
        dry_run=dry_run,
        ingestion_url="https://signed.invalid/private-object",
        external_post_id=external_post_id,
        container_id=container_id,
    )


class QueueTransport:
    def __init__(self, responses: list[HttpResponse]) -> None:
        self.responses = list(responses)
        self.calls = []

    def request(self, method, url, *, data, timeout):
        self.calls.append((method, url, dict(data), timeout))
        return self.responses.pop(0)


class BombTransport:
    def request(self, *args, **kwargs):
        raise AssertionError("network must not be called")


def config(**overrides) -> MetaConfig:
    values = {
        "account_id": "account-1",
        "access_token": "super-secret-token",
        "api_version": "v23.0",
        "enabled": True,
        "dry_run": False,
        "max_attempts": 2,
        "retry_base_seconds": 0,
        "container_poll_seconds": 0,
    }
    values.update(overrides)
    return MetaConfig(**values)


def test_publishers_default_to_dry_run_without_network() -> None:
    instagram = InstagramPublisher(MetaConfig(), transport=BombTransport())
    facebook = FacebookPublisher(MetaConfig(), transport=BombTransport())
    assert instagram.publish(job(Platform.INSTAGRAM, dry_run=True)).status == (
        "dry_run_succeeded"
    )
    assert facebook.publish(job(Platform.FACEBOOK, dry_run=True)).status == (
        "dry_run_succeeded"
    )


def test_existing_external_id_reconciles_without_republishing() -> None:
    publisher = FacebookPublisher(config(), transport=BombTransport())
    result = publisher.publish(
        job(Platform.FACEBOOK, external_post_id="existing-post")
    )
    assert result.status == "posted"
    assert result.external_post_id == "existing-post"
    assert result.reconciled is True


def test_instagram_container_publish_flow_is_separate_and_idempotent() -> None:
    transport = QueueTransport(
        [
            HttpResponse(200, {"id": "container-1"}, {}),
            HttpResponse(200, {"status_code": "FINISHED"}, {}),
            HttpResponse(200, {"id": "instagram-media-1"}, {}),
        ]
    )
    result = InstagramPublisher(
        config(), transport=transport, sleep=lambda _: None
    ).publish(job(Platform.INSTAGRAM))
    assert result.status == "posted"
    assert result.container_id == "container-1"
    assert result.external_post_id == "instagram-media-1"
    assert [call[1].split("/")[-1] for call in transport.calls] == [
        "media",
        "container-1",
        "media_publish",
    ]
    assert transport.calls[0][2]["client_mutation_id"] == (
        "idempotency-instagram"
    )


def test_instagram_retry_reuses_recorded_container_without_reuploading() -> None:
    transport = QueueTransport(
        [
            HttpResponse(200, {"status_code": "FINISHED"}, {}),
            HttpResponse(200, {"id": "instagram-media-1"}, {}),
        ]
    )
    result = InstagramPublisher(
        config(), transport=transport, sleep=lambda _: None
    ).publish(job(Platform.INSTAGRAM, container_id="existing-container"))
    assert result.status == "posted"
    assert [call[1].split("/")[-1] for call in transport.calls] == [
        "existing-container",
        "media_publish",
    ]


def test_facebook_rate_limit_retries_without_affecting_instagram_contract() -> None:
    transport = QueueTransport(
        [
            HttpResponse(
                429,
                {"error": {"code": 4, "message": "Rate limited"}},
                {"retry-after": "0"},
            ),
            HttpResponse(200, {"post_id": "facebook-post-1"}, {}),
        ]
    )
    sleeps: list[float] = []
    result = FacebookPublisher(
        config(), transport=transport, sleep=sleeps.append
    ).publish(job(Platform.FACEBOOK))
    assert result.status == "posted"
    assert result.external_post_id == "facebook-post-1"
    assert len(result.attempts) == 2
    assert result.attempts[0].outcome == "rate_limited"
    assert sleeps == [0.0]
    assert transport.calls[0][1].endswith("/account-1/photos")


def test_token_and_permission_failures_are_non_retryable_and_receipts_are_safe() -> None:
    transport = QueueTransport(
        [
            HttpResponse(
                400,
                {
                    "error": {
                        "code": 190,
                        "message": (
                            "Invalid access_token=super-secret-token "
                            "https://signed.invalid/private-object"
                        ),
                    }
                },
                {"x-fb-request-id": "request-1"},
            )
        ]
    )
    result = FacebookPublisher(
        config(), transport=transport, sleep=lambda _: None
    ).publish(job(Platform.FACEBOOK))
    receipt = result.safe_receipt()
    assert result.status == "failed"
    assert result.failure_code == "token_expired_or_invalid"
    assert len(result.attempts) == 1
    serialized = str(receipt)
    assert "super-secret-token" not in serialized
    assert "signed.invalid" not in serialized
    assert "access_token=[redacted]" in result.failure_reason


def test_live_configuration_validation_never_exposes_secret_values() -> None:
    publisher = InstagramPublisher(
        config(account_id="", access_token=""),
        transport=BombTransport(),
    )
    result = publisher.publish(job(Platform.INSTAGRAM))
    assert result.status == "failed"
    assert result.failure_code == "configuration_error"
    assert "account_id" in result.failure_reason
    assert "access_token" in result.failure_reason


def test_live_configuration_requires_explicit_versioned_meta_api() -> None:
    publisher = FacebookPublisher(
        config(api_version=""),
        transport=BombTransport(),
    )
    result = publisher.publish(job(Platform.FACEBOOK))
    assert result.status == "failed"
    assert result.failure_code == "configuration_error"
    assert "api_version" in result.failure_reason
