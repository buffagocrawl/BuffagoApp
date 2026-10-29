"""Independent local-only CLI. Never imports legacy Jalapeño orchestration."""
import argparse
import json
import secrets
from pathlib import Path

from guess_wing_spot.pipeline import generate
from guess_wing_spot.sources import ReadOnlySources


def main(argv=None):
    parser = argparse.ArgumentParser(description="Read-only sources; local Guess the Wing Spot plan/preview only")
    parser.add_argument("mode", choices=("plan", "preview"))
    parser.add_argument("--seed", help="Reproducible tie-breaking against the same inventory and history")
    parser.add_argument("--env-file", type=Path, help="Optional existing credentials file; only Supabase origin/key are read")
    local = Path(__file__).resolve().parent / "guess_wing_spot" / "local"
    parser.add_argument("--output-dir", type=Path, default=local / "runs")
    parser.add_argument("--history-dir", type=Path, default=local / "history")
    parser.add_argument("--county-map", type=Path, help="Optional private verified address-identity mapping JSON")
    parser.add_argument("--review-file", type=Path, help="Private hash-bound human answer-clue exclusion findings")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    parser.add_argument("--logo", type=Path, default=Path(__file__).resolve().parents[2] / "crawl/assets/images/buffago-logo.png")
    args = parser.parse_args(argv)
    try:
        mapping = json.loads(args.county_map.read_text(encoding="utf-8")) if args.county_map else None
        reviews = json.loads(args.review_file.read_text(encoding="utf-8")) if args.review_file else None
        if mapping is not None and not isinstance(mapping, list):
            raise ValueError("County mapping must be a list of verified address entries")
        if reviews is not None and not isinstance(reviews, list):
            raise ValueError("Visual findings must be a list")
        repository = ReadOnlySources.from_environment(args.env_file)
        manifest, output = generate(repository, mode=args.mode, seed=args.seed or secrets.token_hex(12),
                                    output_root=args.output_dir, history_dir=args.history_dir, county_mapping=mapping,
                                    review_findings=reviews, ffmpeg=args.ffmpeg, ffprobe=args.ffprobe, logo_path=args.logo)
        # No source URLs, credentials, restaurant answers, or raw exceptions.
        print(json.dumps({"reel_id": manifest["reel_id"], "status": manifest["generation_status"],
                          "geography": manifest.get("geography"), "private_manifest": str((output / "manifest.private.json").resolve()),
                          "outputs": manifest["outputs"], "review_required": True}, indent=2))
        return 0 if manifest["generation_status"] in {"planned", "preview_generated", "skipped_no_eligible_geography"} else 2
    except Exception:
        # Do not print exceptions that could include an adapter URL/header.
        print(json.dumps({"status": "failed", "reason": "Read, eligibility, history, or local media validation failed; inspect configuration and rerun. No publishing path exists."}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
