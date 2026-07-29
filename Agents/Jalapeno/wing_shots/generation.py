"""Deterministic BuffaGo branding for approved community Wing Shots."""

from __future__ import annotations

import json
import logging
import math
import shutil
import subprocess
import tempfile
import textwrap
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol
from uuid import UUID

from PIL import Image, ImageDraw, ImageFont, ImageOps, UnidentifiedImageError


GENERATOR_VERSION = "wing-community-brand-v1"
INSTAGRAM_PHOTO_SIZE = (1080, 1350)
FACEBOOK_PHOTO_SIZE = (1200, 1500)
VERTICAL_VIDEO_SIZE = (1080, 1920)


class GenerationError(RuntimeError):
    def __init__(self, code: str, public_reason: str, *, retryable: bool) -> None:
        super().__init__(code)
        self.code = code
        self.public_reason = public_reason
        self.retryable = retryable


class GenerationContractError(GenerationError):
    def __init__(
        self,
        code: str = "GENERATION_CONTRACT_ERROR",
        public_reason: str = "The claimed community media did not satisfy its generation contract.",
    ) -> None:
        super().__init__(code, public_reason, retryable=False)


class GenerationDependencyError(GenerationError):
    def __init__(
        self,
        code: str = "GENERATION_DEPENDENCY_FAILURE",
        public_reason: str = "A temporary branded-media dependency was unavailable.",
    ) -> None:
        super().__init__(code, public_reason, retryable=True)


@dataclass(frozen=True, slots=True)
class GenerationClaim:
    job_id: UUID
    submission_id: UUID
    claim_token: UUID
    instagram_media_path: str
    facebook_media_path: str

    @classmethod
    def from_payload(cls, payload: object) -> "GenerationClaim":
        if not isinstance(payload, dict):
            raise ValueError("generation claim must be an object")
        claim = cls(
            job_id=UUID(str(payload["job_id"])),
            submission_id=UUID(str(payload["submission_id"])),
            claim_token=UUID(str(payload["claim_token"])),
            instagram_media_path=str(payload["instagram_media_path"]),
            facebook_media_path=str(payload["facebook_media_path"]),
        )
        claim.validate_paths()
        return claim

    def validate_paths(self) -> None:
        submission = str(self.submission_id)
        for platform, path in (
            ("instagram", self.instagram_media_path),
            ("facebook", self.facebook_media_path),
        ):
            parts = path.split("/")
            if (
                len(parts) != 4
                or parts[:3] != ["publication", submission, platform]
                or ".." in parts
            ):
                raise ValueError("untrusted generation output path")
            UUID(parts[3])


@dataclass(frozen=True, slots=True)
class GenerationContext:
    job_id: UUID
    submission_id: UUID
    claim_token: UUID
    correlation_id: UUID
    bucket: str
    media_type: str
    processed_path: str
    instagram_media_path: str
    facebook_media_path: str
    restaurant_name: str
    city: str | None
    state_code: str | None
    overall: float | None
    crispiness: float | None
    sauce: float | None
    meat: float | None
    spice_level: int | None
    would_order_again: bool | None
    attribution: str
    anonymous_attribution: bool

    @classmethod
    def from_payload(cls, payload: object) -> "GenerationContext":
        if not isinstance(payload, dict):
            raise ValueError("generation context must be an object")

        def optional_float(key: str) -> float | None:
            value = payload.get(key)
            return float(value) if value is not None else None

        context = cls(
            job_id=UUID(str(payload["job_id"])),
            submission_id=UUID(str(payload["submission_id"])),
            claim_token=UUID(str(payload["claim_token"])),
            correlation_id=UUID(str(payload["correlation_id"])),
            bucket=str(payload["bucket"]),
            media_type=str(payload["media_type"]),
            processed_path=str(payload["processed_path"]),
            instagram_media_path=str(payload["instagram_media_path"]),
            facebook_media_path=str(payload["facebook_media_path"]),
            restaurant_name=str(payload["restaurant_name"]),
            city=str(payload["city"]) if payload.get("city") else None,
            state_code=(
                str(payload["state_code"]) if payload.get("state_code") else None
            ),
            overall=optional_float("overall"),
            crispiness=optional_float("crispiness"),
            sauce=optional_float("sauce"),
            meat=optional_float("meat"),
            spice_level=(
                int(payload["spice_level"])
                if payload.get("spice_level") is not None
                else None
            ),
            would_order_again=(
                bool(payload["would_order_again"])
                if payload.get("would_order_again") is not None
                else None
            ),
            attribution=str(payload["attribution"]),
            anonymous_attribution=bool(payload.get("anonymous_attribution")),
        )
        context.validate()
        return context

    def validate(self) -> None:
        claim = GenerationClaim(
            job_id=self.job_id,
            submission_id=self.submission_id,
            claim_token=self.claim_token,
            instagram_media_path=self.instagram_media_path,
            facebook_media_path=self.facebook_media_path,
        )
        claim.validate_paths()
        if self.bucket != "wing-submissions":
            raise ValueError("generation bucket must remain private")
        if self.media_type not in {"photo", "video"}:
            raise ValueError("unsupported generation media type")
        if self.processed_path != f"processed/{self.submission_id}/primary":
            raise ValueError("generation source is not the processed asset")
        if not self.restaurant_name.strip() or len(self.restaurant_name) > 200:
            raise ValueError("restaurant context is invalid")
        if not self.attribution.strip() or len(self.attribution) > 100:
            raise ValueError("attribution context is invalid")
        for score in (self.overall, self.crispiness, self.sauce, self.meat):
            if score is not None and (not math.isfinite(score) or not 0 <= score <= 10):
                raise ValueError("rating score is outside the supported range")


@dataclass(frozen=True, slots=True)
class GeneratedAssets:
    instagram_path: Path
    facebook_path: Path
    instagram_post_type: str
    facebook_post_type: str
    instagram_caption: str
    facebook_caption: str
    metadata: dict[str, Any]


class CommandRunner(Protocol):
    def ffmpeg(self, arguments: list[str], *, workdir: Path) -> None: ...

    def ffprobe(
        self, arguments: list[str], *, workdir: Path
    ) -> dict[str, Any]: ...


class FfmpegCommandRunner:
    """Runs FFmpeg with argument arrays only; no shell or user-built command."""

    def __init__(
        self,
        *,
        ffmpeg_bin: str = "ffmpeg",
        ffprobe_bin: str = "ffprobe",
        docker_image: str | None = None,
        timeout_seconds: int = 120,
    ) -> None:
        self.ffmpeg_bin = ffmpeg_bin
        self.ffprobe_bin = ffprobe_bin
        self.docker_image = docker_image
        self.timeout_seconds = timeout_seconds

    @staticmethod
    def _inside_workdir(argument: str, workdir: Path) -> str:
        candidate = Path(argument)
        if not candidate.is_absolute():
            return argument
        try:
            relative = candidate.resolve().relative_to(workdir.resolve())
        except ValueError as exc:
            raise GenerationContractError(
                "FFMPEG_PATH_OUTSIDE_WORKSPACE",
                "The media tool received a path outside its isolated workspace.",
            ) from exc
        return f"/work/{relative.as_posix()}"

    def _command(
        self,
        executable: str,
        arguments: list[str],
        *,
        workdir: Path,
    ) -> list[str]:
        if self.docker_image:
            mapped = [
                self._inside_workdir(argument, workdir)
                if Path(argument).is_absolute()
                else argument
                for argument in arguments
            ]
            command = [
                "docker",
                "run",
                "--rm",
                "--network",
                "none",
                "--read-only",
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges",
                "--pids-limit",
                "128",
                "--memory",
                "1g",
                "--cpus",
                "2",
                "--tmpfs",
                "/tmp:rw,noexec,nosuid,size=64m",
                "--mount",
                f"type=bind,source={workdir.resolve()},target=/work",
            ]
            if executable == self.ffprobe_bin:
                command.extend(["--entrypoint", "ffprobe"])
            command.append(self.docker_image)
            command.extend(mapped)
            return command
        resolved = shutil.which(executable)
        if not resolved:
            raise GenerationDependencyError(
                "FFMPEG_NOT_CONFIGURED",
                "FFmpeg and FFprobe must be installed on the generation worker.",
            )
        return [resolved, *arguments]

    def _run(
        self,
        executable: str,
        arguments: list[str],
        *,
        workdir: Path,
    ) -> subprocess.CompletedProcess[str]:
        command = self._command(executable, arguments, workdir=workdir)
        try:
            result = subprocess.run(
                command,
                cwd=workdir,
                capture_output=True,
                text=True,
                timeout=self.timeout_seconds,
                check=False,
                shell=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise GenerationDependencyError() from exc
        if result.returncode != 0:
            raise GenerationContractError(
                "FFMPEG_REJECTED_PROCESSED_MEDIA",
                "The protected processed media could not be transformed safely.",
            )
        return result

    def ffmpeg(self, arguments: list[str], *, workdir: Path) -> None:
        self._run(self.ffmpeg_bin, arguments, workdir=workdir)

    def ffprobe(
        self, arguments: list[str], *, workdir: Path
    ) -> dict[str, Any]:
        result = self._run(self.ffprobe_bin, arguments, workdir=workdir)
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            raise GenerationContractError("FFPROBE_INVALID_RESPONSE") from exc
        if not isinstance(payload, dict):
            raise GenerationContractError("FFPROBE_INVALID_RESPONSE")
        return payload


def _clean_text(value: str | None, *, maximum: int) -> str:
    normalized = unicodedata.normalize("NFKC", str(value or ""))
    cleaned = "".join(
        character
        for character in normalized
        if character in {"\n", "\t"} or not unicodedata.category(character).startswith("C")
    )
    return " ".join(cleaned.split())[:maximum]


def _font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.load_default(size=size)


class BrandedContentGenerator:
    def __init__(
        self,
        *,
        logo_path: Path,
        command_runner: CommandRunner | None = None,
        max_photo_bytes: int = 12 * 1024 * 1024,
        max_video_bytes: int = 30 * 1024 * 1024,
        max_duration_seconds: float = 10.0,
    ) -> None:
        self.logo_path = logo_path
        self.command_runner = command_runner or FfmpegCommandRunner()
        self.max_photo_bytes = max_photo_bytes
        self.max_video_bytes = max_video_bytes
        self.max_duration_seconds = max_duration_seconds
        if not logo_path.is_file():
            raise ValueError("BuffaGo logo asset is required")

    @staticmethod
    def _location(context: GenerationContext) -> str:
        return ", ".join(
            value
            for value in (
                _clean_text(context.city, maximum=60),
                _clean_text(context.state_code, maximum=3),
            )
            if value
        )

    @staticmethod
    def _score(context: GenerationContext) -> str:
        return (
            f"{context.overall:g}/10"
            if context.overall is not None
            else "Community rated"
        )

    @staticmethod
    def _attributes(context: GenerationContext) -> list[str]:
        ranked = [
            ("Crisp", context.crispiness),
            ("Sauce", context.sauce),
            ("Chicken", context.meat),
        ]
        return [
            f"{label} {value:g}"
            for label, value in sorted(
                (item for item in ranked if item[1] is not None),
                key=lambda item: float(item[1] or 0),
                reverse=True,
            )[:2]
        ]

    def _copy(self, context: GenerationContext) -> tuple[str, str, str]:
        restaurant = _clean_text(context.restaurant_name, maximum=120)
        location = self._location(context)
        score = self._score(context)
        attribution = _clean_text(context.attribution, maximum=80)
        place = f" in {location}" if location else ""
        media_word = "video" if context.media_type == "video" else "photo"
        alt = (
            f"Community-submitted {media_word} of wings from {restaurant}{place}, "
            f"rated {score} on BuffaGo. "
            + (
                "Shared anonymously."
                if context.anonymous_attribution
                else f"Shared by {attribution}."
            )
        )[:1000]
        instagram = (
            f"{restaurant}{place} — {score} on BuffaGo.\n\n"
            f"Wing Shot by {attribution}. "
            "Rate wings in person, upload your Wing Shot, and check back daily.\n\n"
            "#BuffaGo #WingShots #ChickenWings"
        )[:2200]
        facebook = (
            f"Community Wing Shot: {restaurant}{place}, rated {score} on BuffaGo. "
            f"Shared by {attribution}.\n\n"
            "Find your next wing stop and rate it on BuffaGo."
        )[:2200]
        return instagram, facebook, alt

    def _logo(self, width: int) -> Image.Image:
        with Image.open(self.logo_path) as image:
            logo = image.convert("RGBA")
        bbox = logo.getbbox()
        if bbox:
            logo = logo.crop(bbox)
        height = max(1, round(logo.height * width / logo.width))
        return logo.resize((width, height), Image.Resampling.LANCZOS)

    def _overlay(
        self,
        context: GenerationContext,
        size: tuple[int, int],
        *,
        opaque_background: bool,
    ) -> Image.Image:
        width, height = size
        layer = Image.new(
            "RGBA",
            size,
            (0, 0, 0, 255) if opaque_background else (0, 0, 0, 0),
        )
        draw = ImageDraw.Draw(layer, "RGBA")
        margin = round(width * 0.055)
        logo = self._logo(round(width * 0.24))
        logo_y = margin
        draw.rounded_rectangle(
            (
                margin - 16,
                logo_y - 12,
                margin + logo.width + 16,
                logo_y + logo.height + 12,
            ),
            radius=22,
            fill=(15, 15, 15, 205),
        )
        layer.alpha_composite(logo, (margin, logo_y))

        panel_height = round(height * 0.31)
        panel_top = height - panel_height
        draw.rectangle((0, panel_top, width, height), fill=(10, 10, 10, 225))
        draw.rectangle(
            (0, panel_top, width, panel_top + 12), fill=(244, 93, 31, 255)
        )
        restaurant = _clean_text(context.restaurant_name, maximum=80)
        restaurant_lines = textwrap.wrap(restaurant, width=25)[:2] or ["Wing Shot"]
        y = panel_top + round(panel_height * 0.10)
        for line in restaurant_lines:
            draw.text(
                (margin, y),
                line,
                font=_font(round(width * 0.055)),
                fill=(255, 255, 255, 255),
            )
            y += round(width * 0.066)
        location = self._location(context)
        if location:
            draw.text(
                (margin, y + 4),
                location,
                font=_font(round(width * 0.029)),
                fill=(224, 224, 224, 255),
            )
        score = self._score(context)
        score_font = _font(round(width * 0.07))
        score_box = draw.textbbox((0, 0), score, font=score_font)
        draw.text(
            (width - margin - (score_box[2] - score_box[0]), panel_top + 42),
            score,
            font=score_font,
            fill=(255, 130, 40, 255),
        )
        attributes = "  •  ".join(self._attributes(context))
        if attributes:
            draw.text(
                (margin, height - round(panel_height * 0.25)),
                attributes,
                font=_font(round(width * 0.027)),
                fill=(255, 183, 113, 255),
            )
        attribution = _clean_text(context.attribution, maximum=70)
        draw.text(
            (margin, height - round(panel_height * 0.13)),
            f"{attribution}  •  Rated on BuffaGo  •  Get the app",
            font=_font(round(width * 0.021)),
            fill=(238, 238, 238, 255),
        )
        return layer

    def _photo_asset(
        self,
        context: GenerationContext,
        source: Path,
        destination: Path,
        size: tuple[int, int],
    ) -> None:
        try:
            with Image.open(source) as input_image:
                input_image.verify()
            with Image.open(source) as input_image:
                normalized = ImageOps.exif_transpose(input_image).convert("RGB")
                base = ImageOps.fit(
                    normalized,
                    size,
                    method=Image.Resampling.LANCZOS,
                    centering=(0.5, 0.48),
                ).convert("RGBA")
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            raise GenerationContractError("INVALID_PROCESSED_PHOTO") from exc
        output = Image.alpha_composite(
            base, self._overlay(context, size, opaque_background=False)
        ).convert("RGB")
        output.save(
            destination,
            format="JPEG",
            quality=90,
            optimize=True,
            progressive=True,
            exif=b"",
        )
        self._validate_photo(destination, size)

    def _probe_video(self, path: Path, *, workdir: Path) -> dict[str, Any]:
        return self.command_runner.ffprobe(
            [
                "-v",
                "error",
                "-show_streams",
                "-show_format",
                "-of",
                "json",
                str(path.resolve()),
            ],
            workdir=workdir,
        )

    def _validate_video_source(self, source: Path, *, workdir: Path) -> float:
        payload = self._probe_video(source, workdir=workdir)
        streams = payload.get("streams")
        if not isinstance(streams, list):
            raise GenerationContractError("INVALID_PROCESSED_VIDEO")
        video_streams = [
            item
            for item in streams
            if isinstance(item, dict) and item.get("codec_type") == "video"
        ]
        audio_streams = [
            item
            for item in streams
            if isinstance(item, dict) and item.get("codec_type") == "audio"
        ]
        if len(video_streams) != 1:
            raise GenerationContractError("INVALID_PROCESSED_VIDEO")
        if audio_streams:
            raise GenerationContractError(
                "PROCESSED_VIDEO_CONTAINS_AUDIO",
                "Only the muted processed community video may be branded.",
            )
        try:
            duration = float(payload.get("format", {}).get("duration"))
        except (TypeError, ValueError) as exc:
            raise GenerationContractError("INVALID_PROCESSED_VIDEO_DURATION") from exc
        if not 0 < duration <= self.max_duration_seconds + 0.15:
            raise GenerationContractError("PROCESSED_VIDEO_DURATION_OUT_OF_BOUNDS")
        return duration

    def _video_asset(
        self,
        context: GenerationContext,
        source: Path,
        destination: Path,
        *,
        workdir: Path,
        duration: float,
        overlay_name: str,
    ) -> None:
        overlay_path = workdir / overlay_name
        overlay_path.parent.mkdir(parents=True, exist_ok=True)
        self._overlay(
            context, VERTICAL_VIDEO_SIZE, opaque_background=False
        ).save(overlay_path, format="PNG", optimize=True)
        width, height = VERTICAL_VIDEO_SIZE
        self.command_runner.ffmpeg(
            [
                "-nostdin",
                "-y",
                "-i",
                str(source.resolve()),
                "-loop",
                "1",
                "-i",
                str(overlay_path.resolve()),
                "-filter_complex",
                (
                    f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase,"
                    f"crop={width}:{height},setsar=1[base];"
                    "[base][1:v]overlay=0:0:shortest=1[v]"
                ),
                "-map",
                "[v]",
                "-an",
                "-map_metadata",
                "-1",
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-crf",
                "21",
                "-maxrate",
                "6M",
                "-bufsize",
                "12M",
                "-r",
                "30",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                "-t",
                f"{duration:.3f}",
                "-f",
                "mp4",
                str(destination.resolve()),
            ],
            workdir=workdir,
        )
        self._validate_video_output(destination, workdir=workdir)

    def _validate_photo(self, path: Path, size: tuple[int, int]) -> None:
        if not path.is_file() or path.stat().st_size > self.max_photo_bytes:
            raise GenerationContractError("GENERATED_PHOTO_SIZE_INVALID")
        try:
            with Image.open(path) as image:
                image.verify()
            with Image.open(path) as image:
                if image.format != "JPEG" or image.size != size:
                    raise GenerationContractError("GENERATED_PHOTO_SHAPE_INVALID")
                if image.getexif():
                    raise GenerationContractError("GENERATED_PHOTO_METADATA_PRESENT")
        except (UnidentifiedImageError, OSError) as exc:
            raise GenerationContractError("GENERATED_PHOTO_INVALID") from exc

    def _validate_video_output(self, path: Path, *, workdir: Path) -> None:
        if not path.is_file() or path.stat().st_size > self.max_video_bytes:
            raise GenerationContractError("GENERATED_VIDEO_SIZE_INVALID")
        payload = self._probe_video(path, workdir=workdir)
        streams = payload.get("streams")
        if not isinstance(streams, list):
            raise GenerationContractError("GENERATED_VIDEO_INVALID")
        videos = [
            stream
            for stream in streams
            if isinstance(stream, dict) and stream.get("codec_type") == "video"
        ]
        audios = [
            stream
            for stream in streams
            if isinstance(stream, dict) and stream.get("codec_type") == "audio"
        ]
        if len(videos) != 1 or audios:
            raise GenerationContractError("GENERATED_VIDEO_STREAMS_INVALID")
        video = videos[0]
        if (
            int(video.get("width") or 0),
            int(video.get("height") or 0),
        ) != VERTICAL_VIDEO_SIZE:
            raise GenerationContractError("GENERATED_VIDEO_SHAPE_INVALID")
        if str(video.get("codec_name") or "") != "h264":
            raise GenerationContractError("GENERATED_VIDEO_CODEC_INVALID")

    def generate(
        self,
        context: GenerationContext,
        source: Path,
        output_directory: Path,
    ) -> GeneratedAssets:
        output_directory.mkdir(parents=True, exist_ok=True)
        instagram = output_directory / (
            "instagram.jpg" if context.media_type == "photo" else "instagram.mp4"
        )
        facebook = output_directory / (
            "facebook.jpg" if context.media_type == "photo" else "facebook.mp4"
        )
        if context.media_type == "photo":
            self._photo_asset(
                context, source, instagram, INSTAGRAM_PHOTO_SIZE
            )
            self._photo_asset(context, source, facebook, FACEBOOK_PHOTO_SIZE)
            instagram_type, facebook_type = "photo", "photo"
        else:
            media_workdir = source.parent
            duration = self._validate_video_source(
                source, workdir=media_workdir
            )
            self._video_asset(
                context,
                source,
                instagram,
                workdir=media_workdir,
                duration=duration,
                overlay_name="generated/instagram-overlay.png",
            )
            self._video_asset(
                context,
                source,
                facebook,
                workdir=media_workdir,
                duration=duration,
                overlay_name="generated/facebook-overlay.png",
            )
            instagram_type, facebook_type = "reel", "video"

        instagram_caption, facebook_caption, alt_text = self._copy(context)
        metadata = {
            "source": "community_submission",
            "source_processed_path": context.processed_path,
            "generator_version": GENERATOR_VERSION,
            "input_media_type": context.media_type,
            "instagram_alt_text": alt_text,
            "facebook_alt_text": alt_text,
            "instagram_dimensions": list(
                INSTAGRAM_PHOTO_SIZE
                if context.media_type == "photo"
                else VERTICAL_VIDEO_SIZE
            ),
            "facebook_dimensions": list(
                FACEBOOK_PHOTO_SIZE
                if context.media_type == "photo"
                else VERTICAL_VIDEO_SIZE
            ),
            "original_audio_used": False,
            "synthetic_wing_media_used": False,
        }
        return GeneratedAssets(
            instagram_path=instagram,
            facebook_path=facebook,
            instagram_post_type=instagram_type,
            facebook_post_type=facebook_type,
            instagram_caption=instagram_caption,
            facebook_caption=facebook_caption,
            metadata=metadata,
        )


@dataclass(frozen=True, slots=True)
class GenerationOutcome:
    status: str
    job_id: UUID | None = None
    submission_id: UUID | None = None
    error_code: str | None = None


class GenerationWorkerRepository(Protocol):
    def claim_generation(
        self, *, worker_id: str, lease_seconds: int
    ) -> GenerationClaim | None: ...

    def begin_generation(
        self, claim: GenerationClaim
    ) -> GenerationContext: ...

    def download_processed(
        self,
        context: GenerationContext,
        destination: Path,
        *,
        maximum_bytes: int,
    ) -> None: ...

    def upload_generated(
        self,
        context: GenerationContext,
        *,
        storage_path: str,
        local_path: Path,
        content_type: str,
    ) -> None: ...

    def complete_generation(
        self,
        claim: GenerationClaim,
        assets: GeneratedAssets,
    ) -> dict[str, Any]: ...

    def fail_generation(
        self,
        claim: GenerationClaim,
        *,
        retryable: bool,
        error_code: str,
        error_reason: str,
    ) -> dict[str, Any]: ...


class WingShotsGenerationWorker:
    def __init__(
        self,
        *,
        repository: GenerationWorkerRepository,
        generator: BrandedContentGenerator,
        worker_id: str = "jalapeno-wing-generation",
        lease_seconds: int = 600,
        logger: logging.Logger | None = None,
    ) -> None:
        if len(worker_id) < 3 or len(worker_id) > 120:
            raise ValueError("worker_id must contain 3 to 120 characters")
        if lease_seconds < 60 or lease_seconds > 1200:
            raise ValueError("lease_seconds must be between 60 and 1200")
        self.repository = repository
        self.generator = generator
        self.worker_id = worker_id
        self.lease_seconds = lease_seconds
        self.logger = logger or logging.getLogger(__name__)

    def _event(self, event: str, **fields: Any) -> None:
        allowed = {
            key: value
            for key, value in fields.items()
            if key in {"job_id", "submission_id", "status", "error_code"}
        }
        self.logger.info(json.dumps({"event": event, **allowed}, sort_keys=True))

    def run_once(self) -> GenerationOutcome:
        claim = self.repository.claim_generation(
            worker_id=self.worker_id,
            lease_seconds=self.lease_seconds,
        )
        if claim is None:
            return GenerationOutcome(status="NO_JOB")
        try:
            context = self.repository.begin_generation(claim)
            if (
                context.job_id != claim.job_id
                or context.submission_id != claim.submission_id
                or context.claim_token != claim.claim_token
            ):
                raise GenerationContractError("GENERATION_CONTEXT_MISMATCH")
            maximum = (
                self.generator.max_photo_bytes
                if context.media_type == "photo"
                else self.generator.max_video_bytes
            )
            with tempfile.TemporaryDirectory(
                prefix="wing-generation-"
            ) as temporary:
                work = Path(temporary)
                source = work / (
                    "processed.jpg"
                    if context.media_type == "photo"
                    else "processed.mp4"
                )
                output = work / "generated"
                self.repository.download_processed(
                    context,
                    source,
                    maximum_bytes=maximum,
                )
                assets = self.generator.generate(context, source, output)
                self.repository.upload_generated(
                    context,
                    storage_path=context.instagram_media_path,
                    local_path=assets.instagram_path,
                    content_type=(
                        "image/jpeg"
                        if context.media_type == "photo"
                        else "video/mp4"
                    ),
                )
                self.repository.upload_generated(
                    context,
                    storage_path=context.facebook_media_path,
                    local_path=assets.facebook_path,
                    content_type=(
                        "image/jpeg"
                        if context.media_type == "photo"
                        else "video/mp4"
                    ),
                )
                self.repository.complete_generation(claim, assets)
            outcome = GenerationOutcome(
                status="READY_TO_POST",
                job_id=claim.job_id,
                submission_id=claim.submission_id,
            )
            self._event(
                "wing_generation_completed",
                job_id=str(claim.job_id),
                submission_id=str(claim.submission_id),
                status=outcome.status,
            )
            return outcome
        except Exception as exc:
            if isinstance(exc, GenerationError):
                code = exc.code
                reason = exc.public_reason
                retryable = exc.retryable
            else:
                code = "UNEXPECTED_GENERATION_FAILURE"
                reason = "An unexpected branded-content dependency failed."
                retryable = True
            try:
                receipt = self.repository.fail_generation(
                    claim,
                    retryable=retryable,
                    error_code=code,
                    error_reason=reason,
                )
                status = str(receipt.get("job_status") or "FAILED").upper()
            except Exception:
                status = "CLAIM_SETTLEMENT_FAILED"
            self._event(
                "wing_generation_failed",
                job_id=str(claim.job_id),
                submission_id=str(claim.submission_id),
                status=status,
                error_code=code,
            )
            return GenerationOutcome(
                status=status,
                job_id=claim.job_id,
                submission_id=claim.submission_id,
                error_code=code,
            )
