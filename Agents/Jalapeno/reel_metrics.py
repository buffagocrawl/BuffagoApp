"""Safe analytics entry point. Never import legacy main.py or its repair paths."""
import argparse
import json
import sys


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("collect", "backfill", "diagnostic"))
    args = parser.parse_args()
    try:
        from reel_analytics.collector import main
        sys.exit(main(args.mode))
    except Exception as error:
        from reel_analytics.meta import MetaReadError
        from reel_analytics.storage import StorageError
        import re
        reason = str(error) if isinstance(error, (MetaReadError, StorageError)) and re.fullmatch(r"[a-z0-9_]+", str(error)) else "analytics_failed_details_withheld"
        print(json.dumps({"status": "blocked", "reason": reason}))
        sys.exit(1)
