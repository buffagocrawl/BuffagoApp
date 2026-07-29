from __future__ import annotations

from pathlib import Path
import subprocess
from uuid import uuid4

import pytest
from PIL import Image

from wing_media_processing.errors import PermanentMediaError, RetryableMediaError
from wing_media_processing.command import run_command
from wing_media_processing.fingerprints import photo_phash
from wing_media_processing.models import ProcessingLimits, RetryDecision, RetryPolicy
from wing_media_processing.processor import WingMediaProcessor
from wing_media_processing.retry import run_attempt
from wing_media_processing.sniff import sniff_photo, video_mime_from_probe
from wing_media_processing.video import validate_processed_video, validate_video_probe
import wing_media_processing.video as video_module


def test_photo_content_is_sniffed_without_trusting_extension(tmp_path: Path) -> None:
    source = tmp_path / "untrusted.exe"
    Image.new("RGB", (32, 24), "orange").save(source, format="PNG")

    assert sniff_photo(source) == "image/png"


def test_text_with_image_extension_is_rejected(tmp_path: Path) -> None:
    source = tmp_path / "fake.jpg"
    source.write_text("not an image", encoding="utf-8")

    with pytest.raises(PermanentMediaError):
        sniff_photo(source)


def test_photo_pipeline_reencodes_strips_exif_and_creates_derivatives(tmp_path: Path) -> None:
    source = tmp_path / "hostile-name.php"
    image = Image.new("RGB", (1_600, 900), "orange")
    exif = Image.Exif()
    exif[0x010E] = "private description"
    image.save(source, format="JPEG", exif=exif)

    submission_id = uuid4()
    artifacts = WingMediaProcessor().process(source, tmp_path / "output", submission_id=submission_id)

    assert artifacts.normalized_path.name == f"{submission_id}-normalized.jpg"
    assert artifacts.normalized_path.is_file()
    assert artifacts.thumbnail_path.is_file()
    assert artifacts.square_path.is_file()
    assert artifacts.portrait_path.is_file()
    assert len(artifacts.perceptual_hash) == 16
    with Image.open(artifacts.normalized_path) as normalized:
        assert normalized.width <= 2_048
        assert normalized.height <= 2_048
        assert len(normalized.getexif()) == 0
    with Image.open(artifacts.square_path) as square:
        assert square.size == (1_080, 1_080)
    with Image.open(artifacts.portrait_path) as portrait:
        assert portrait.size == (1_080, 1_350)


def test_photo_size_bound_is_enforced_before_decode(tmp_path: Path) -> None:
    source = tmp_path / "large.bin"
    Image.new("RGB", (512, 512), "orange").save(source, format="PNG")
    assert source.stat().st_size > 100
    processor = WingMediaProcessor(limits=ProcessingLimits(max_photo_bytes=100))

    with pytest.raises(PermanentMediaError, match="maximum upload size"):
        processor.process(source, tmp_path / "output", submission_id=uuid4())


def test_similar_photos_have_same_phash() -> None:
    original = Image.new("RGB", (128, 128), "orange")
    resized = original.resize((256, 256))

    assert photo_phash(original) == photo_phash(resized)


def test_video_probe_rejects_duration_over_ten_seconds() -> None:
    probe = {
        "format": {
            "format_name": "mov,mp4,m4a,3gp,3g2,mj2",
            "duration": "10.2",
            "bit_rate": "1000000",
        },
        "streams": [
            {"codec_type": "video", "codec_name": "h264", "width": 720, "height": 1280}
        ],
    }

    with pytest.raises(PermanentMediaError, match="duration"):
        validate_video_probe(probe, limits=ProcessingLimits())


def test_video_probe_rejects_unsupported_codec() -> None:
    probe = {
        "format": {"format_name": "matroska,webm", "duration": "3"},
        "streams": [
            {"codec_type": "video", "codec_name": "av1", "width": 720, "height": 1280}
        ],
    }

    with pytest.raises(PermanentMediaError, match="codec"):
        validate_video_probe(probe, limits=ProcessingLimits())


def test_video_container_is_inferred_from_probe_not_filename() -> None:
    probe = {"format": {"format_name": "matroska,webm"}}

    assert video_mime_from_probe(probe) == "video/webm"


def test_processed_video_rejects_retained_rotation_metadata() -> None:
    probe = {
        "format": {"duration": "3"},
        "streams": [
            {
                "codec_type": "video",
                "codec_name": "h264",
                "side_data_list": [{"rotation": 90}],
            }
        ],
    }

    with pytest.raises(PermanentMediaError, match="rotation"):
        validate_processed_video(probe, limits=ProcessingLimits())


def test_permanent_failure_is_rejected_without_retry() -> None:
    def fail() -> None:
        raise PermanentMediaError("unsafe input")

    result = run_attempt(fail, prior_attempt_count=0, policy=RetryPolicy(max_attempts=3))

    assert result.decision is RetryDecision.REJECTED
    assert result.attempt_count == 1


def test_transient_failure_retries_then_dead_letters() -> None:
    def fail() -> None:
        raise RetryableMediaError("worker unavailable")

    retry = run_attempt(fail, prior_attempt_count=0, policy=RetryPolicy(max_attempts=2))
    dead_letter = run_attempt(fail, prior_attempt_count=1, policy=RetryPolicy(max_attempts=2))

    assert retry.decision is RetryDecision.RETRY
    assert dead_letter.decision is RetryDecision.DEAD_LETTER


def test_successful_attempt_returns_value() -> None:
    result = run_attempt(lambda: "ok", prior_attempt_count=0, policy=RetryPolicy())

    assert result.decision is RetryDecision.COMPLETED
    assert result.value == "ok"


def test_subprocess_boundary_always_disables_shell(monkeypatch: pytest.MonkeyPatch) -> None:
    observed: dict = {}

    def fake_run(arguments, **kwargs):
        observed["arguments"] = arguments
        observed.update(kwargs)
        return subprocess.CompletedProcess(arguments, 0, stdout=b"ok", stderr=b"")

    monkeypatch.setattr(subprocess, "run", fake_run)

    result = run_command(
        ["ffmpeg", "-i", "literal;not-a-shell-command"],
        timeout_seconds=1,
    )

    assert result.stdout == b"ok"
    assert observed["shell"] is False
    assert observed["arguments"] == ["ffmpeg", "-i", "literal;not-a-shell-command"]


def test_video_transcode_command_explicitly_drops_audio(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = tmp_path / "source.bin"
    source.write_bytes(b"synthetic")
    source_probe = {
        "format": {
            "format_name": "mov,mp4,m4a,3gp,3g2,mj2",
            "duration": "3",
            "bit_rate": "1000000",
        },
        "streams": [
            {"codec_type": "video", "codec_name": "h264", "width": 320, "height": 240},
            {"codec_type": "audio", "codec_name": "aac"},
        ],
    }
    output_probe = {
        "format": {"format_name": "mov,mp4,m4a,3gp,3g2,mj2", "duration": "3"},
        "streams": [
            {"codec_type": "video", "codec_name": "h264", "width": 1080, "height": 1350}
        ],
    }
    probes = iter([source_probe, output_probe])
    commands: list[list[str]] = []

    monkeypatch.setattr(video_module, "ffprobe_json", lambda *_args, **_kwargs: next(probes))
    monkeypatch.setattr(video_module, "video_frame_fingerprint", lambda *_args, **_kwargs: "a" * 64)

    def fake_command(arguments, **_kwargs):
        commands.append(list(arguments))
        Path(arguments[-1]).write_bytes(b"artifact")
        return subprocess.CompletedProcess(arguments, 0, stdout=b"", stderr=b"")

    monkeypatch.setattr(video_module, "run_command", fake_command)

    artifacts = video_module.process_video(
        source,
        tmp_path / "output",
        artifact_name=str(uuid4()),
        limits=ProcessingLimits(),
        ffmpeg_binary="ffmpeg",
        ffprobe_binary="ffprobe",
    )

    assert artifacts.processed_path.is_file()
    assert "-an" in commands[0]
    assert commands[0][commands[0].index("-map") + 1] == "0:v:0"
    assert "-map_metadata" in commands[0]
