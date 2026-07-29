from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from uuid import uuid4

import pytest

from wing_media_processing.models import VideoArtifacts
from wing_media_processing.processor import WingMediaProcessor

FFMPEG = shutil.which("ffmpeg")
FFPROBE = shutil.which("ffprobe")
pytestmark = pytest.mark.skipif(
    not FFMPEG or not FFPROBE,
    reason="ffmpeg and ffprobe binaries are required for the media integration test",
)


def _probe(path: Path) -> dict:
    result = subprocess.run(
        [
            str(FFPROBE),
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        shell=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=20,
    )
    return json.loads(result.stdout)


def test_real_transcode_removes_known_audio_stream(tmp_path: Path) -> None:
    source = tmp_path / "synthetic-with-audio.payload"
    subprocess.run(
        [
            str(FFMPEG),
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=orange:s=320x240:r=24:d=2",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=1000:duration=2",
            "-shortest",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            "-f",
            "mp4",
            str(source),
        ],
        check=True,
        shell=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
    )
    assert any(stream["codec_type"] == "audio" for stream in _probe(source)["streams"])

    artifacts = WingMediaProcessor(
        ffmpeg_binary=str(FFMPEG),
        ffprobe_binary=str(FFPROBE),
    ).process(source, tmp_path / "output", submission_id=uuid4())

    assert isinstance(artifacts, VideoArtifacts)
    processed_probe = _probe(artifacts.processed_path)
    assert [stream["codec_type"] for stream in processed_probe["streams"]] == ["video"]
    assert processed_probe["streams"][0]["codec_name"] == "h264"
    assert artifacts.thumbnail_path.is_file()
    assert len(artifacts.fingerprint) == 64
