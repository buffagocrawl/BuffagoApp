"""CLI entrypoint for the Wing Shot processing worker."""

from __future__ import annotations

import argparse
import json
import logging
import os
import socket
import sys

from supabase_client import SupabaseClient
from wing_media_processing import WingMediaProcessor

from .errors import ProviderConfigurationError
from .moderation import (
    HttpModerationProvider,
    ManualReviewProvider,
    ManualReviewTestProvider,
)
from .repository import ProcessingRepository
from .worker import WingProcessingWorker


def build_provider() -> HttpModerationProvider | ManualReviewProvider | ManualReviewTestProvider:
    mode = os.getenv("WING_MODERATION_PROVIDER_MODE", "http").strip().lower()
    environment = os.getenv("WING_PROCESSING_ENVIRONMENT", "production").strip().lower()
    if mode == "manual-review-test":
        allowed = os.getenv("WING_PROCESSING_ALLOW_TEST_PROVIDER", "").lower() == "true"
        if environment == "production" or not allowed:
            raise ProviderConfigurationError()
        return ManualReviewTestProvider()
    if mode == "manual-review":
        return ManualReviewProvider()
    if mode != "http":
        raise ProviderConfigurationError()
    endpoint = os.getenv("WING_MODERATION_PROVIDER_URL", "").strip()
    api_key = os.getenv("WING_MODERATION_API_KEY", "").strip()
    model = os.getenv("WING_MODERATION_MODEL", "").strip()
    version = os.getenv("WING_MODERATION_MODEL_VERSION", "").strip()
    if not endpoint or not api_key or not model or not version:
        raise ProviderConfigurationError()
    try:
        timeout = float(os.getenv("WING_MODERATION_TIMEOUT_SECONDS", "30"))
        return HttpModerationProvider(
            endpoint=endpoint,
            api_key=api_key,
            model=model,
            model_version=version,
            timeout_seconds=timeout,
        )
    except (TypeError, ValueError) as exc:
        raise ProviderConfigurationError() from exc


def _worker_id() -> str:
    configured = os.getenv("WING_PROCESSING_WORKER_ID", "").strip()
    if configured:
        return configured[:120]
    return f"wing-worker-{socket.gethostname()}"[:120]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Process private Wing Shot media")
    parser.add_argument("--once", action="store_true", help="Process at most one job")
    parser.add_argument(
        "--drain",
        type=int,
        default=0,
        help="Process up to N jobs, stopping when the queue is empty",
    )
    parser.add_argument(
        "--cleanup-once",
        action="store_true",
        help="Delete at most one server-authorized expired original",
    )
    parser.add_argument(
        "--cleanup-drain",
        type=int,
        default=0,
        help="Delete up to N server-authorized expired originals",
    )
    parser.add_argument(
        "--validate-config",
        action="store_true",
        help="Validate required configuration without claiming a job",
    )
    args = parser.parse_args(argv)
    if args.drain < 0 or args.drain > 100:
        parser.error("--drain must be between 0 and 100")
    if args.cleanup_drain < 0 or args.cleanup_drain > 100:
        parser.error("--cleanup-drain must be between 0 and 100")
    if (
        not args.once
        and args.drain == 0
        and not args.cleanup_once
        and args.cleanup_drain == 0
        and not args.validate_config
    ):
        parser.error(
            "choose --once, --drain N, --cleanup-once, "
            "--cleanup-drain N, or --validate-config"
        )

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    try:
        provider_required = args.validate_config or args.once or args.drain > 0
        provider = (
            build_provider()
            if provider_required
            else ManualReviewTestProvider()
        )
        client = SupabaseClient.from_env()
    except Exception as exc:
        code = (
            exc.code
            if isinstance(exc, ProviderConfigurationError)
            else "WORKER_CONFIGURATION_INVALID"
        )
        print(json.dumps({"status": "CONFIGURATION_INVALID", "error_code": code}))
        return 2
    if args.validate_config:
        print(json.dumps({"status": "CONFIGURATION_VALID"}))
        return 0

    worker = WingProcessingWorker(
        repository=ProcessingRepository(client),
        processor=WingMediaProcessor(),
        moderation_provider=provider,
        worker_id=_worker_id(),
    )
    process_count = 1 if args.once else args.drain
    for _ in range(process_count):
        outcome = worker.run_once()
        if outcome.status == "NO_JOB":
            break
    cleanup_count = 1 if args.cleanup_once else args.cleanup_drain
    for _ in range(cleanup_count):
        outcome = worker.run_cleanup_once()
        if outcome.status == "NO_JOB":
            break
    return 0


if __name__ == "__main__":
    sys.exit(main())
