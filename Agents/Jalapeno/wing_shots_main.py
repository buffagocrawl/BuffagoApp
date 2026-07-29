from __future__ import annotations

import argparse
import json
import os
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from supabase_client import SupabaseClient
from wing_shots.generation import (
    BrandedContentGenerator,
    FfmpegCommandRunner,
    WingShotsGenerationWorker,
)
from wing_shots.generation_repository import SupabaseGenerationRepository
from wing_shots.models import Platform
from wing_shots.orchestrator import NightlyConfig, WingShotsNightlyOrchestrator
from wing_shots.publishers import FacebookPublisher, InstagramPublisher, MetaConfig
from wing_shots.repository import (
    SupabaseRpcRepository,
    SupabaseStorageSignedUrlProvider,
)


def _enabled(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _business_date(value: str | None) -> date:
    if value:
        return date.fromisoformat(value)
    return datetime.now(ZoneInfo("America/New_York")).date()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Curate and publish one approved community Wing Shot."
    )
    parser.add_argument("--business-date", help="America/New_York date (YYYY-MM-DD)")
    parser.add_argument(
        "--live",
        action="store_true",
        help="Permit configured Meta calls; dry-run is the default",
    )
    parser.add_argument(
        "--generation-only",
        action="store_true",
        help="Claim and generate one protected branded community asset",
    )
    return parser


def _generation_worker(client: SupabaseClient) -> WingShotsGenerationWorker:
    workspace = Path(__file__).resolve().parents[2]
    logo_path = Path(
        os.getenv(
            "WING_SHOTS_BRAND_LOGO_PATH",
            str(workspace / "crawl/assets/images/buffago-logo.png"),
        )
    ).resolve()
    runner = FfmpegCommandRunner(
        ffmpeg_bin=os.getenv("WING_FFMPEG_BIN", "ffmpeg").strip(),
        ffprobe_bin=os.getenv("WING_FFPROBE_BIN", "ffprobe").strip(),
        docker_image=(
            os.getenv("WING_FFMPEG_DOCKER_IMAGE", "").strip() or None
        ),
    )
    return WingShotsGenerationWorker(
        repository=SupabaseGenerationRepository(client),
        generator=BrandedContentGenerator(
            logo_path=logo_path,
            command_runner=runner,
        ),
        worker_id=os.getenv(
            "WING_GENERATION_WORKER_ID", "jalapeno-wing-generation"
        ).strip(),
    )


def main() -> int:
    args = build_parser().parse_args()
    dry_run = not args.live
    client = SupabaseClient.from_env()
    if args.generation_only:
        outcome = _generation_worker(client).run_once()
        print(
            json.dumps(
                {
                    "status": outcome.status,
                    "job_id": str(outcome.job_id) if outcome.job_id else None,
                    "submission_id": (
                        str(outcome.submission_id)
                        if outcome.submission_id
                        else None
                    ),
                    "error_code": outcome.error_code,
                },
                indent=2,
                sort_keys=True,
            )
        )
        return 0 if outcome.status not in {"DEAD", "CLAIM_SETTLEMENT_FAILED"} else 1

    if args.live and not _enabled("WING_SHOTS_LIVE_PUBLISHING_ENABLED"):
        raise SystemExit(
            "Live publishing requires WING_SHOTS_LIVE_PUBLISHING_ENABLED=true"
        )

    repository = SupabaseRpcRepository(client)
    api_version = os.getenv("META_GRAPH_API_VERSION", "").strip()
    if args.live and not api_version:
        raise SystemExit(
            "Live publishing requires an explicit META_GRAPH_API_VERSION"
        )
    common = {
        "access_token": os.getenv("META_LONG_LIVED_ACCESS_TOKEN", "").strip(),
        "api_version": api_version or "dry-run",
        "dry_run": dry_run,
    }
    publishers = {
        Platform.INSTAGRAM: InstagramPublisher(
            MetaConfig(
                account_id=os.getenv(
                    "INSTAGRAM_BUSINESS_ACCOUNT_ID", ""
                ).strip(),
                enabled=_enabled("WING_INSTAGRAM_PUBLISHING_ENABLED"),
                **common,
            )
        ),
        Platform.FACEBOOK: FacebookPublisher(
            MetaConfig(
                account_id=os.getenv("FACEBOOK_PAGE_ID", "").strip(),
                enabled=_enabled("WING_FACEBOOK_PUBLISHING_ENABLED"),
                **common,
            )
        ),
    }
    orchestrator = WingShotsNightlyOrchestrator(
        repository=repository,
        publishers=publishers,
        generation_worker=_generation_worker(client),
        signed_urls=SupabaseStorageSignedUrlProvider(client),
        config=NightlyConfig(dry_run=dry_run),
    )
    receipt = orchestrator.run(business_date=_business_date(args.business_date))
    print(json.dumps(receipt.safe_dict(), indent=2, sort_keys=True))
    return 0 if receipt.status not in {"FAILED"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
