from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import BrandingConfig, CleanupConfig, ImageConfig, JalapenoConfig, StorageConfig
from image_pipeline.branding import BrandingResult, apply_branding
from image_pipeline.cleanup import CleanupResult, cleanup_temp_files
from image_pipeline.image_formatter import (
    INSTAGRAM_FEED_PRESET,
    INSTAGRAM_SQUARE_PRESET,
    FormatPreset,
    build_square_fallback,
    format_for_instagram,
    save_formatted_image,
)
from image_pipeline.image_generator import GeneratedImage, OpenAIImageGenerationClient, generate_image
from image_pipeline.image_storage import ImageStorageError, ImageUploadResult, SupabaseImageStorage
from image_pipeline.image_validator import ImageValidationResult, validate_image_file
from image_pipeline.meme_formatter import MemeFormatResult, format_meme_image
from jalapeno_db import link_image_asset_to_decision, insert_image_asset
from logging_utils import log_event
from ai_config import load_ai_config
from prompt_library_loader import PROMPT_LIBRARY_VERSION, load_prompt_text
from supabase_client import SupabaseClient


DEFAULT_IMAGE_PIPELINE_OUTPUT_PATH = Path(__file__).resolve().parents[1] / "data" / "latest_image_pipeline.json"


@dataclass(frozen=True, slots=True)
class ImagePipelineResult:
    run_id: str
    candidate_id: str
    post_id: str | None
    content_type: str
    image_type: str
    image_prompt: str
    image_prompt_preview: str
    model: str
    image_source: str
    prompt_version: str
    local_temp_path: str
    formatted_feed_path: str
    square_fallback_path: str
    validation_status: str
    image_validation_status: str
    image_validation_reason: str
    prompt_quality: int
    width: int
    height: int
    aspect_ratio: float
    file_size_bytes: int
    format: str
    branding_applied: bool
    meme_format_applied: bool
    storage_bucket: str | None
    storage_path: str | None
    public_url: str | None
    uploaded_at: str | None
    cleanup_status: str
    generation_time_ms: int
    cost_estimate_usd: float | None
    stage_durations_ms: dict[str, int] = field(default_factory=dict)
    validation_issues: list[str] = field(default_factory=list)
    content_validation_issues: list[str] = field(default_factory=list)
    branding_reason: str | None = None
    meme_top_text: str | None = None
    meme_bottom_text: str | None = None
    image_source_details: dict[str, Any] | None = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True, default=str)
        handle.write("\n")


def _safe_filename(run_id: str, candidate_id: str, timestamp: str, suffix: str) -> str:
    safe_run = run_id.replace("/", "_")
    safe_candidate = candidate_id.replace("/", "_")
    safe_timestamp = timestamp.replace(":", "").replace("-", "").replace(".", "")
    return f"{safe_run}_{safe_candidate}_{safe_timestamp}{suffix}"


def _ensure_unique_path(base_dir: Path, filename: str) -> Path:
    candidate = base_dir / filename
    if not candidate.exists():
        return candidate
    stem = candidate.stem
    suffix = candidate.suffix
    for index in range(1, 1000):
        attempt = candidate.with_name(f"{stem}_{index}{suffix}")
        if not attempt.exists():
            return attempt
    raise FileExistsError(f"Unable to create unique file name under {base_dir}")


def _extract_content_type(winner: dict[str, Any]) -> str:
    return str(winner.get("content_type") or winner.get("post_type") or "restaurant_spotlight")


def _extract_candidate_id(winner: dict[str, Any]) -> str:
    return str(winner.get("candidate_id") or winner.get("id") or winner.get("candidateId") or "")


def _image_type_for_content_type(content_type: str, visual_style: str | None = None) -> str:
    if visual_style == "meme" or content_type in {"meme", "funny_observation"}:
        return "meme"
    if content_type in {"restaurant_spotlight", "hidden_gem"}:
        return "restaurant"
    if content_type in {"food_holiday", "wing_fact", "sports_tie_in"}:
        return "food"
    if content_type in {"community_highlight", "xp_milestone", "leaderboard", "challenge"}:
        return "community"
    return "standard"


def _build_storage_path(run_id: str, filename: str) -> str:
    now = _utcnow()
    return f"instagram/{now:%Y/%m/%d}/{run_id}/{filename}"


def _resolve_text(winner: dict[str, Any], key: str, fallback: str = "") -> str:
    value = winner.get(key)
    if isinstance(value, str) and value.strip():
        return value.strip()
    caption_package = winner.get("caption_package")
    if isinstance(caption_package, dict):
        nested = caption_package.get(key)
        if isinstance(nested, str) and nested.strip():
            return nested.strip()
    return fallback


def _save_image_file(image, path: Path, *, quality: int) -> None:
    save_formatted_image(image, path, quality=quality)


def _truncate_prompt(prompt: str, *, limit: int = 240) -> str:
    cleaned = " ".join(prompt.split()).strip()
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[: limit - 3].rstrip()}..."


def _format_meme_text(winner: dict[str, Any]) -> tuple[str, str]:
    top_text = _resolve_text(winner, "working_title", fallback="BUFFAGO WING ENERGY")
    bottom_text = _resolve_text(winner, "suggested_cta", fallback=_resolve_text(winner, "short_summary", fallback=""))
    if not bottom_text:
        bottom_text = "When the wings hit the table, everyone has thoughts."
    return top_text, bottom_text


def _write_summary(
    path: Path,
    *,
    result: ImagePipelineResult,
    validation: ImageValidationResult,
    upload: ImageUploadResult | None,
    cleanup: CleanupResult,
) -> None:
    payload = asdict(result)
    payload.update(
        {
            "validation": asdict(validation),
            "upload": asdict(upload) if upload else None,
            "cleanup": asdict(cleanup),
        }
    )
    _write_json(path, payload)


def _run_image_pipeline_impl(
    config: JalapenoConfig,
    *,
    content_decision: dict[str, Any],
    logger=None,
    client: SupabaseClient | None = None,
    generation_client: Any | None = None,
    upload_enabled: bool = True,
    persist_enabled: bool = True,
    output_path: Path = DEFAULT_IMAGE_PIPELINE_OUTPUT_PATH,
    dry_run: bool = True,
) -> ImagePipelineResult:
    started_at = time.perf_counter()
    decision_summary = content_decision.get("decision_summary")
    decision_run_id = ""
    if isinstance(decision_summary, dict):
        decision_run_id = str(decision_summary.get("run_id") or "")
    run_id = str(content_decision.get("run_id") or decision_run_id or "")
    winner = content_decision.get("winner")
    if not isinstance(winner, dict):
        raise ValueError("content_decision must include a winner dictionary")

    candidate_id = _extract_candidate_id(winner)
    content_type = _extract_content_type(winner)
    visual_style = str(winner.get("visual_style") or winner.get("style") or "").strip().lower() or None
    image_type = _image_type_for_content_type(content_type, visual_style)
    image_prompt = _resolve_text(winner, "image_prompt", fallback=_resolve_text(winner.get("caption_package", {}) if isinstance(winner.get("caption_package"), dict) else {}, "image_prompt", fallback=""))
    if not image_prompt:
        raise ValueError("Winner record is missing image_prompt")
    ai_config = load_ai_config()
    image_model = ai_config.models.development.image

    temp_dir = Path(config.image.temp_dir)
    temp_dir.mkdir(parents=True, exist_ok=True)
    image_library_prompt = load_prompt_text("image_generation")
    if generation_client is None and not dry_run:
        generation_client = OpenAIImageGenerationClient.from_env(logger=logger)
    feed_preset = FormatPreset(
        name="instagram_feed",
        width=config.image.default_width,
        height=config.image.default_height,
        output_format=config.image.output_format,
        quality=config.image.quality,
    )
    square_preset = FormatPreset(
        name="instagram_square",
        width=config.image.square_width,
        height=config.image.square_height,
        output_format=config.image.output_format,
        quality=config.image.quality,
    )
    log_event(
        logger,
        "image_pipeline_started",
        run_id=run_id,
        candidate_id=candidate_id,
        content_type=content_type,
        image_type=image_type,
        prompt_version=PROMPT_LIBRARY_VERSION,
        image_model=image_model,
        branding_enabled=config.branding.enabled,
        branding_asset_path=str(config.branding.logo_path) if config.branding.logo_path else None,
    )
    log_event(
        logger,
        "image_prompt_loaded",
        run_id=run_id,
        candidate_id=candidate_id,
        content_type=content_type,
        image_type=image_type,
        prompt_version=PROMPT_LIBRARY_VERSION,
        prompt_path="prompt_library/prompts/image_generation.md",
        prompt_length=len(image_library_prompt),
    )

    generation_started = time.perf_counter()
    log_event(
        logger,
        "image_generation_started",
        run_id=run_id,
        candidate_id=candidate_id,
        content_type=content_type,
        image_type=image_type,
        model=image_model,
        image_model=image_model,
        prompt_version=PROMPT_LIBRARY_VERSION,
        image_prompt_preview=_truncate_prompt(image_prompt),
    )
    try:
        generated = generate_image(
            prompt=image_prompt,
            content_type=content_type,
            image_type=image_type,
            model=image_model,
            size=(1024, 1536) if image_type != "meme" else (1024, 1024),
            generation_client=generation_client,
            cost_estimate_usd=0.0,
            allow_placeholder_fallback=dry_run,
        )
    except Exception as exc:
        retry_prompt = (
            f"{image_prompt} Regenerate with cleaner composition, more appetizing crisp saucy wings, stronger natural lighting, "
            "no distorted food, no confusing props, no text, and a clear Instagram-feed focal point."
        )
        log_event(
            logger,
            "image_regeneration_triggered",
            level="warning",
            run_id=run_id,
            candidate_id=candidate_id,
            content_type=content_type,
            image_type=image_type,
            model=image_model,
            retry_count=1,
            error=str(exc),
        )
        try:
            generated = generate_image(
                prompt=retry_prompt,
                content_type=content_type,
                image_type=image_type,
                model=image_model,
                size=(1024, 1536) if image_type != "meme" else (1024, 1024),
                generation_client=generation_client,
                cost_estimate_usd=0.0,
                allow_placeholder_fallback=dry_run,
            )
            image_prompt = retry_prompt
        except Exception as retry_exc:
            log_event(
                logger,
                "image_generation_failed",
                level="error",
                run_id=run_id,
                candidate_id=candidate_id,
                content_type=content_type,
                image_type=image_type,
                model=image_model,
                prompt_version=PROMPT_LIBRARY_VERSION,
                generation_time_ms=int((time.perf_counter() - generation_started) * 1000),
                cost_estimate=0.0,
                image_prompt_preview=_truncate_prompt(image_prompt),
                error=str(retry_exc),
            )
            raise
    if generated.image_source != "real_ai" and not dry_run:
        log_event(
            logger,
            "fallback_content_used",
            level="warning",
            run_id=run_id,
            candidate_id=candidate_id,
            content_type=content_type,
            image_type=image_type,
            stage="image_generation",
            status="fallback",
            fallback_type=generated.image_source,
        )

    generation_duration_ms = int((time.perf_counter() - generation_started) * 1000)
    timestamp = _utcnow().strftime("%Y%m%dT%H%M%S%fZ")
    original_filename = _safe_filename(run_id, candidate_id, timestamp, ".png")
    local_temp_path = _ensure_unique_path(temp_dir, original_filename)
    generated.image.convert("RGBA").save(local_temp_path, format="PNG", optimize=True)
    log_event(
        logger,
        "image_generation_completed",
        run_id=run_id,
        candidate_id=candidate_id,
        content_type=content_type,
        image_type=image_type,
        file_path=local_temp_path,
        model=generated.model,
        image_model=generated.model,
        image_source=generated.image_source,
        prompt_version=generated.prompt_version,
        generation_time_ms=generation_duration_ms,
        cost_estimate=generated.cost_estimate_usd,
        image_prompt_preview=_truncate_prompt(image_prompt),
    )
    log_event(
        logger,
        "image_saved_temp",
        run_id=run_id,
        candidate_id=candidate_id,
        content_type=content_type,
        image_type=image_type,
        file_path=local_temp_path,
    )

    validation_started = time.perf_counter()
    log_event(
        logger,
        "image_quality_review_started",
        run_id=run_id,
        candidate_id=candidate_id,
        content_type=content_type,
        image_type=image_type,
        file_path=local_temp_path,
        stage="image_quality_review",
        status="started",
    )
    validation = validate_image_file(
        local_temp_path,
        image_source=generated.image_source,
        prompt=image_prompt,
        allow_non_ai_source=dry_run,
    )
    validation_duration_ms = int((time.perf_counter() - validation_started) * 1000)
    log_event(
        logger,
        "image_validated",
        run_id=run_id,
        candidate_id=candidate_id,
        content_type=content_type,
        image_type=image_type,
        file_path=local_temp_path,
        validation_status=validation.status,
        image_validation_status=validation.status,
        image_validation_reason=validation.validation_reason,
        image_source=generated.image_source,
        prompt_quality=validation.prompt_quality,
        width=validation.width,
        height=validation.height,
        aspect_ratio=validation.aspect_ratio,
        format=validation.format,
        file_size_bytes=validation.file_size_bytes,
        duration_ms=validation_duration_ms,
        issues=validation.issues,
        content_issues=validation.content_issues,
    )
    log_event(
        logger,
        "image_quality_review_completed",
        run_id=run_id,
        candidate_id=candidate_id,
        content_type=content_type,
        image_type=image_type,
        file_path=local_temp_path,
        stage="image_quality_review",
        status=validation.status,
        duration_ms=validation_duration_ms,
        appetizing=validation.valid,
        on_brand=validation.prompt_quality >= 70,
        instagram_ready=validation.valid,
        quality_notes=validation.issues,
    )
    if not validation.valid:
        if dry_run:
            raise ValueError("; ".join(validation.issues))
        retry_prompt = (
            f"{image_prompt} QUALITY FIX: make the wings clearly appetizing, natural, crispy, glossy, well lit, on-brand for Buffago, "
            "not weird, not distorted, not gross, not confusing, no text in image."
        )
        log_event(
            logger,
            "image_regeneration_triggered",
            level="warning",
            run_id=run_id,
            candidate_id=candidate_id,
            content_type=content_type,
            image_type=image_type,
            retry_count=1,
            reason=validation.validation_reason,
        )
        generated = generate_image(
            prompt=retry_prompt,
            content_type=content_type,
            image_type=image_type,
            model=image_model,
            size=(1024, 1536) if image_type != "meme" else (1024, 1024),
            generation_client=generation_client,
            cost_estimate_usd=0.0,
            allow_placeholder_fallback=False,
        )
        image_prompt = retry_prompt
        generated.image.convert("RGBA").save(local_temp_path, format="PNG", optimize=True)
        validation = validate_image_file(
            local_temp_path,
            image_source=generated.image_source,
            prompt=image_prompt,
            allow_non_ai_source=False,
        )
        if not validation.valid:
            raise ValueError("; ".join(validation.issues))

    from PIL import Image, ImageOps

    with Image.open(local_temp_path) as original:
        original_image = original.convert("RGBA")

    formatting_started = time.perf_counter()
    if image_type == "meme":
        meme_top, meme_bottom = _format_meme_text(winner)
        meme_result = format_meme_image(original_image, top_text=meme_top, bottom_text=meme_bottom)
        feed_image = format_for_instagram(meme_result.image, preset=feed_preset, image_type="meme")
        square_image = ImageOps.pad(
            meme_result.image,
            (square_preset.width, square_preset.height),
            method=Image.Resampling.LANCZOS,
            color=(20, 20, 24),
            centering=(0.5, 0.5),
        )
        meme_format_applied = meme_result.applied
        meme_top_text = meme_top
        meme_bottom_text = meme_bottom
        log_event(
            logger,
            "meme_format_applied",
            run_id=run_id,
            candidate_id=candidate_id,
            content_type=content_type,
            image_type=image_type,
            file_path=local_temp_path,
            top_text=meme_top,
            bottom_text=meme_bottom,
            image_source=generated.image_source,
        )
    else:
        feed_image = format_for_instagram(original_image, preset=feed_preset, image_type=image_type)
        square_image = format_for_instagram(original_image, preset=square_preset, image_type=image_type)
        meme_format_applied = False
        meme_top_text = None
        meme_bottom_text = None

    branding_result: BrandingResult = apply_branding(
        feed_image,
        branding_config=config.branding,
        label_text=config.branding.label_text,
        avoid_bottom_text=image_type == "meme",
    )
    if branding_result.applied:
        log_event(
            logger,
            "branding_applied",
            run_id=run_id,
            candidate_id=candidate_id,
            content_type=content_type,
            image_type=image_type,
            file_path=local_temp_path,
            branding_enabled=True,
            branding_asset_path=branding_result.logo_path,
            branding_asset_loaded=branding_result.asset_loaded,
            branding_position=branding_result.position,
            branding_scale=branding_result.scale,
            image_model=generated.model,
        )
        feed_image = branding_result.image
    else:
        log_level = "warning" if branding_result.reason in {"logo_missing", "logo_unreadable"} and config.branding.enabled else "info"
        log_event(
            logger,
            "branding_skipped",
            level=log_level,
            run_id=run_id,
            candidate_id=candidate_id,
            content_type=content_type,
            image_type=image_type,
            file_path=local_temp_path,
            reason=branding_result.reason,
            branding_enabled=config.branding.enabled,
            branding_asset_path=branding_result.logo_path or (str(config.branding.logo_path) if config.branding.logo_path else None),
            branding_asset_loaded=branding_result.asset_loaded,
            branding_position=branding_result.position,
            branding_scale=branding_result.scale,
            image_model=generated.model,
        )

    feed_filename = _safe_filename(run_id, candidate_id, timestamp, f".{config.image.output_format.lower()}")
    square_filename = _safe_filename(run_id, candidate_id, timestamp, f"_square.{config.image.output_format.lower()}")
    feed_path = _ensure_unique_path(temp_dir, feed_filename)
    square_path = _ensure_unique_path(temp_dir, square_filename)
    _save_image_file(feed_image, feed_path, quality=config.image.quality)
    _save_image_file(square_image, square_path, quality=config.image.quality)
    formatted_file_size_bytes = feed_path.stat().st_size
    formatting_duration_ms = int((time.perf_counter() - formatting_started) * 1000)
    log_event(
        logger,
        "image_resized",
        run_id=run_id,
        candidate_id=candidate_id,
        content_type=content_type,
        image_type=image_type,
        file_path=feed_path,
        duration_ms=formatting_duration_ms,
        width=feed_image.width,
        height=feed_image.height,
    )

    upload_result: ImageUploadResult | None = None
    public_url: str | None = None
    storage_path: str | None = None
    storage_bucket = config.storage.bucket if config.storage.provider.lower() == "supabase" else None
    if upload_enabled and not dry_run and client is not None:
        upload_started = time.perf_counter()
        storage = SupabaseImageStorage(client)
        storage_path = _build_storage_path(run_id, feed_path.name)
        upload_result = storage.upload(feed_path, bucket=config.storage.bucket, storage_path=storage_path, content_type="image/jpeg" if feed_path.suffix.lower() in {".jpg", ".jpeg"} else "image/png")
        public_url = upload_result.public_url
        log_event(
            logger,
            "image_uploaded",
            run_id=run_id,
            candidate_id=candidate_id,
            content_type=content_type,
            image_type=image_type,
            file_path=feed_path,
            public_url=public_url,
            storage_bucket=upload_result.bucket,
            storage_path=upload_result.storage_path,
            image_source=generated.image_source,
            duration_ms=int((time.perf_counter() - upload_started) * 1000),
        )
    elif upload_enabled and not dry_run and client is None:
        raise ValueError("Image upload requires a Supabase client")

    persist_started = time.perf_counter()
    if persist_enabled and client is not None:
        asset_row = insert_image_asset(
            client,
            run_id=run_id,
            candidate_id=candidate_id,
            post_id=winner.get("post_id"),
            local_temp_path=str(local_temp_path),
            storage_bucket=upload_result.bucket if upload_result else storage_bucket,
            storage_path=upload_result.storage_path if upload_result else storage_path,
            public_url=upload_result.public_url if upload_result else public_url,
            image_type=image_type,
            content_type=content_type,
            width=feed_image.width,
            height=feed_image.height,
            aspect_ratio=round(feed_image.width / feed_image.height, 4),
            file_size_bytes=formatted_file_size_bytes,
            format=feed_path.suffix.lstrip(".").upper(),
            branding_applied=branding_result.applied,
            meme_format_applied=meme_format_applied,
            validation_status=validation.status,
            image_source=generated.image_source,
            image_prompt=image_prompt,
            prompt_quality=validation.prompt_quality,
            validation_reason=validation.validation_reason,
            prompt_version=generated.prompt_version,
            generation_time_ms=generated.generation_time_ms,
            image_model=generated.model,
            metadata={
                "cost_estimate_usd": generated.cost_estimate_usd,
                "image_source_details": generated.source_details,
                "validation_issues": list(validation.issues),
                "content_validation_issues": list(validation.content_issues),
                "stage_durations_ms": {
                    "generation": generation_duration_ms,
                    "validation": validation_duration_ms,
                    "formatting": formatting_duration_ms,
                },
            },
            uploaded_at=upload_result.uploaded_at if upload_result else None,
            cleanup_status="pending",
            logger=logger,
        )
        link_image_asset_to_decision(
            client,
            run_id=run_id,
            candidate_id=candidate_id,
            image_asset_id=str(asset_row.get("id")) if isinstance(asset_row, dict) and asset_row.get("id") else None,
            image_public_url=upload_result.public_url if upload_result else public_url,
            image_storage_path=upload_result.storage_path if upload_result else storage_path,
            image_uploaded_at=upload_result.uploaded_at if upload_result else None,
            image_prompt=image_prompt,
            image_source=generated.image_source,
            prompt_quality=validation.prompt_quality,
            validation_reason=validation.validation_reason,
        )
        log_event(
            logger,
            "image_url_saved",
            run_id=run_id,
            candidate_id=candidate_id,
            content_type=content_type,
            image_type=image_type,
            public_url=upload_result.public_url if upload_result else public_url,
            storage_bucket=upload_result.bucket if upload_result else storage_bucket,
            storage_path=upload_result.storage_path if upload_result else storage_path,
            duration_ms=int((time.perf_counter() - persist_started) * 1000),
        )

    cleanup_result = cleanup_temp_files(
        [local_temp_path, feed_path, square_path],
        success=True,
        cleanup_temp_files=config.cleanup.cleanup_temp_files,
        keep_failed_images=config.cleanup.keep_failed_images,
    )
    cleanup_status = "completed" if not cleanup_result.failed_paths else "partial"
    if persist_enabled and client is not None and asset_row is not None and isinstance(asset_row, dict) and asset_row.get("id"):
        try:
            client.update_rows(
                "jalapeno_image_assets",
                {"id": f"eq.{asset_row['id']}"},
                {"cleanup_status": cleanup_status},
            )
        except Exception as exc:  # pragma: no cover - defensive guard
            log_event(
                logger,
                "image_asset_cleanup_status_update_failed",
                level="warning",
                run_id=run_id,
                candidate_id=candidate_id,
                content_type=content_type,
                image_type=image_type,
                error=str(exc),
            )
    log_event(
        logger,
        "temp_cleanup_completed",
        run_id=run_id,
        candidate_id=candidate_id,
        content_type=content_type,
        image_type=image_type,
        removed_paths=cleanup_result.removed_paths,
        kept_paths=cleanup_result.kept_paths,
        failed_paths=cleanup_result.failed_paths,
        duration_ms=int((time.perf_counter() - persist_started) * 1000) if persist_enabled else 0,
    )

    result = ImagePipelineResult(
        run_id=run_id,
        candidate_id=candidate_id,
        post_id=str(winner.get("post_id")) if winner.get("post_id") else None,
        content_type=content_type,
        image_type=image_type,
        image_prompt=image_prompt,
        image_prompt_preview=_truncate_prompt(image_prompt),
        model=generated.model,
        image_source=generated.image_source,
        prompt_version=generated.prompt_version,
        local_temp_path=str(local_temp_path),
        formatted_feed_path=str(feed_path),
        square_fallback_path=str(square_path),
        validation_status=validation.status,
        image_validation_status=validation.status,
        image_validation_reason=validation.validation_reason,
        prompt_quality=validation.prompt_quality,
        width=feed_image.width,
        height=feed_image.height,
        aspect_ratio=round(feed_image.width / feed_image.height, 4),
        file_size_bytes=formatted_file_size_bytes,
        format=feed_path.suffix.lstrip(".").upper(),
        branding_applied=branding_result.applied,
        meme_format_applied=meme_format_applied,
        storage_bucket=upload_result.bucket if upload_result else storage_bucket,
        storage_path=upload_result.storage_path if upload_result else storage_path,
        public_url=upload_result.public_url if upload_result else public_url,
        uploaded_at=upload_result.uploaded_at if upload_result else None,
        cleanup_status=cleanup_status,
        generation_time_ms=generated.generation_time_ms,
        cost_estimate_usd=generated.cost_estimate_usd,
        stage_durations_ms={
            "generation": generation_duration_ms,
            "validation": validation_duration_ms,
            "formatting": formatting_duration_ms,
        },
        validation_issues=list(validation.issues),
        content_validation_issues=list(validation.content_issues),
        branding_reason=branding_result.reason,
        meme_top_text=meme_top_text,
        meme_bottom_text=meme_bottom_text,
        image_source_details=generated.source_details,
    )

    _write_summary(output_path, result=result, validation=validation, upload=upload_result, cleanup=cleanup_result)
    log_event(
        logger,
        "image_pipeline_completed",
        run_id=run_id,
        candidate_id=candidate_id,
        content_type=content_type,
        image_type=image_type,
        file_path=feed_path,
        public_url=result.public_url,
        image_source=result.image_source,
        image_validation_status=result.image_validation_status,
        image_validation_reason=result.image_validation_reason,
        prompt_quality=result.prompt_quality,
        duration_ms=int((time.perf_counter() - started_at) * 1000),
    )
    return result


def run_image_pipeline(
    config: JalapenoConfig,
    *,
    content_decision: dict[str, Any],
    logger=None,
    client: SupabaseClient | None = None,
    generation_client: Any | None = None,
    upload_enabled: bool = True,
    persist_enabled: bool = True,
    output_path: Path = DEFAULT_IMAGE_PIPELINE_OUTPUT_PATH,
    dry_run: bool = True,
) -> ImagePipelineResult:
    started_at = time.perf_counter()
    winner = content_decision.get("winner") if isinstance(content_decision, dict) else None
    run_id = ""
    candidate_id = ""
    content_type = ""
    image_type = ""
    if isinstance(content_decision, dict):
        run_id = str(content_decision.get("run_id") or "")
    if isinstance(winner, dict):
        candidate_id = _extract_candidate_id(winner)
        content_type = _extract_content_type(winner)
        visual_style = str(winner.get("visual_style") or winner.get("style") or "").strip().lower() or None
        image_type = _image_type_for_content_type(content_type, visual_style)
    try:
        return _run_image_pipeline_impl(
            config,
            content_decision=content_decision,
            logger=logger,
            client=client,
            generation_client=generation_client,
            upload_enabled=upload_enabled,
            persist_enabled=persist_enabled,
            output_path=output_path,
            dry_run=dry_run,
        )
    except Exception as exc:
        log_event(
            logger,
            "image_pipeline_failed",
            level="error",
            run_id=run_id,
            candidate_id=candidate_id,
            content_type=content_type,
            image_type=image_type,
            file_path=None,
            public_url=None,
            error=str(exc),
            duration_ms=int((time.perf_counter() - started_at) * 1000),
        )
        raise
