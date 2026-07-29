from __future__ import annotations

import shutil
from dataclasses import replace
from pathlib import Path
from uuid import UUID

import pytest
from PIL import Image

from wing_shots.generation import (
    FACEBOOK_PHOTO_SIZE,
    INSTAGRAM_PHOTO_SIZE,
    VERTICAL_VIDEO_SIZE,
    BrandedContentGenerator,
    FfmpegCommandRunner,
    GeneratedAssets,
    GenerationClaim,
    GenerationContext,
    GenerationContractError,
    WingShotsGenerationWorker,
)


SUBMISSION_ID = UUID("11111111-1111-4111-8111-111111111111")
GENERATION_ID = UUID("22222222-2222-4222-8222-222222222222")
CLAIM_TOKEN = UUID("33333333-3333-4333-8333-333333333333")
CORRELATION_ID = UUID("44444444-4444-4444-8444-444444444444")
INSTAGRAM_JOB_ID = UUID("55555555-5555-4555-8555-555555555555")
FACEBOOK_JOB_ID = UUID("66666666-6666-4666-8666-666666666666")
ROOT = Path(__file__).resolve().parents[3]
LOGO = ROOT / "crawl/assets/images/buffago-logo.png"


def context(media_type: str = "photo") -> GenerationContext:
    return GenerationContext(
        job_id=GENERATION_ID,
        submission_id=SUBMISSION_ID,
        claim_token=CLAIM_TOKEN,
        correlation_id=CORRELATION_ID,
        bucket="wing-submissions",
        media_type=media_type,
        processed_path=f"processed/{SUBMISSION_ID}/primary",
        instagram_media_path=(
            f"publication/{SUBMISSION_ID}/instagram/{INSTAGRAM_JOB_ID}"
        ),
        facebook_media_path=(
            f"publication/{SUBMISSION_ID}/facebook/{FACEBOOK_JOB_ID}"
        ),
        restaurant_name="Anchor Bar",
        city="Buffalo",
        state_code="NY",
        overall=9,
        crispiness=8,
        sauce=9,
        meat=7,
        spice_level=6,
        would_order_again=True,
        attribution="@wingfan",
        anonymous_attribution=False,
    )


def claim() -> GenerationClaim:
    ctx = context()
    return GenerationClaim(
        job_id=ctx.job_id,
        submission_id=ctx.submission_id,
        claim_token=ctx.claim_token,
        instagram_media_path=ctx.instagram_media_path,
        facebook_media_path=ctx.facebook_media_path,
    )


def test_generation_context_rejects_original_or_public_paths() -> None:
    invalid = replace(
        context(),
        processed_path=f"originals/{SUBMISSION_ID}/source",
    )
    with pytest.raises(ValueError, match="processed asset"):
        invalid.validate()


def test_real_pillow_photo_generation_contains_brand_copy_and_no_exif(
    tmp_path: Path,
) -> None:
    source = tmp_path / "community.jpg"
    Image.new("RGB", (1600, 900), (185, 71, 25)).save(
        source, "JPEG", quality=95
    )
    assets = BrandedContentGenerator(logo_path=LOGO).generate(
        context(), source, tmp_path / "output"
    )
    with Image.open(assets.instagram_path) as instagram:
        assert instagram.size == INSTAGRAM_PHOTO_SIZE
        assert not instagram.getexif()
        # The generated branded asset differs from a flat source image.
        assert instagram.getpixel((60, 60)) != (185, 71, 25)
    with Image.open(assets.facebook_path) as facebook:
        assert facebook.size == FACEBOOK_PHOTO_SIZE
        assert not facebook.getexif()
    assert assets.metadata["source"] == "community_submission"
    assert assets.metadata["synthetic_wing_media_used"] is False
    assert "Anchor Bar" in assets.instagram_caption
    assert "Community-submitted photo" in (
        assets.metadata["instagram_alt_text"]
    )


class FakeRepository:
    def __init__(self, source: Path, ctx: GenerationContext) -> None:
        self.source = source
        self.ctx = ctx
        self.uploads: list[tuple[str, str, bytes]] = []
        self.completed: GeneratedAssets | None = None
        self.failures: list[tuple[bool, str, str]] = []

    def claim_generation(self, *, worker_id, lease_seconds):
        return claim()

    def begin_generation(self, active_claim):
        return self.ctx

    def download_processed(
        self, active_context, destination, *, maximum_bytes
    ):
        assert self.source.stat().st_size <= maximum_bytes
        shutil.copyfile(self.source, destination)

    def upload_generated(
        self,
        active_context,
        *,
        storage_path,
        local_path,
        content_type,
    ):
        self.uploads.append((storage_path, content_type, local_path.read_bytes()))

    def complete_generation(self, active_claim, assets):
        self.completed = assets
        return {"submission_status": "ready_to_post"}

    def fail_generation(
        self,
        active_claim,
        *,
        retryable,
        error_code,
        error_reason,
    ):
        self.failures.append((retryable, error_code, error_reason))
        return {"job_status": "dead" if not retryable else "retry"}


def test_worker_uploads_only_exact_protected_paths_and_completes(
    tmp_path: Path,
) -> None:
    source = tmp_path / "community.jpg"
    Image.new("RGB", (900, 1200), (90, 45, 20)).save(source, "JPEG")
    repository = FakeRepository(source, context())
    outcome = WingShotsGenerationWorker(
        repository=repository,
        generator=BrandedContentGenerator(logo_path=LOGO),
    ).run_once()
    assert outcome.status == "READY_TO_POST"
    assert [item[0] for item in repository.uploads] == [
        context().instagram_media_path,
        context().facebook_media_path,
    ]
    assert {item[1] for item in repository.uploads} == {"image/jpeg"}
    assert repository.completed is not None
    assert repository.failures == []


class RejectingGenerator:
    max_photo_bytes = 12 * 1024 * 1024
    max_video_bytes = 30 * 1024 * 1024

    def generate(self, active_context, source, output):
        raise GenerationContractError("COMMUNITY_SOURCE_REJECTED")


def test_permanent_generation_failure_is_dead_lettered_without_upload(
    tmp_path: Path,
) -> None:
    source = tmp_path / "community.jpg"
    source.write_bytes(b"invalid")
    repository = FakeRepository(source, context())
    outcome = WingShotsGenerationWorker(
        repository=repository,
        generator=RejectingGenerator(),
    ).run_once()
    assert outcome.status == "DEAD"
    assert outcome.error_code == "COMMUNITY_SOURCE_REJECTED"
    assert repository.uploads == []
    assert repository.failures[0][0] is False


@pytest.mark.skipif(
    shutil.which("docker") is None,
    reason="Docker is required for the real FFmpeg media test",
)
def test_real_ffmpeg_video_generation_is_vertical_and_has_no_audio(
    tmp_path: Path,
) -> None:
    runner = FfmpegCommandRunner(
        docker_image="jrottenberg/ffmpeg:7.1-alpine",
        timeout_seconds=180,
    )
    source = tmp_path / "processed.mp4"
    runner.ffmpeg(
        [
            "-nostdin",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=640x360:rate=30",
            "-t",
            "1.2",
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-f",
            "mp4",
            str(source.resolve()),
        ],
        workdir=tmp_path,
    )
    assets = BrandedContentGenerator(
        logo_path=LOGO,
        command_runner=runner,
    ).generate(context("video"), source, tmp_path / "output")
    for output in (assets.instagram_path, assets.facebook_path):
        probe = runner.ffprobe(
            [
                "-v",
                "error",
                "-show_streams",
                "-of",
                "json",
                str(output.resolve()),
            ],
            workdir=tmp_path,
        )
        streams = probe["streams"]
        assert not [
            stream for stream in streams if stream["codec_type"] == "audio"
        ]
        video = next(
            stream for stream in streams if stream["codec_type"] == "video"
        )
        assert (video["width"], video["height"]) == VERTICAL_VIDEO_SIZE
    assert assets.instagram_post_type == "reel"
    assert assets.facebook_post_type == "video"


@pytest.mark.skipif(
    shutil.which("docker") is None,
    reason="Docker is required for the real FFmpeg media test",
)
def test_video_source_with_audio_is_refused_before_branding(
    tmp_path: Path,
) -> None:
    runner = FfmpegCommandRunner(
        docker_image="jrottenberg/ffmpeg:7.1-alpine",
        timeout_seconds=180,
    )
    source = tmp_path / "processed-with-audio.mp4"
    runner.ffmpeg(
        [
            "-nostdin",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=orange:size=640x360:rate=30",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=1000:sample_rate=44100",
            "-t",
            "1",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            "-pix_fmt",
            "yuv420p",
            "-f",
            "mp4",
            str(source.resolve()),
        ],
        workdir=tmp_path,
    )
    with pytest.raises(
        GenerationContractError,
        match="PROCESSED_VIDEO_CONTAINS_AUDIO",
    ):
        BrandedContentGenerator(
            logo_path=LOGO,
            command_runner=runner,
        ).generate(context("video"), source, tmp_path / "output")
