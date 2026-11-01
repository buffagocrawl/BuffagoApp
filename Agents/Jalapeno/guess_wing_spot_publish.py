"""Separate Actions-only publish entry point. Original plan/preview stay local."""
import argparse
import json
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("validate", "publish", "live-test", "health"))
    args = parser.parse_args()
    try:
        if args.mode=='health':
            from guess_wing_spot.health import run_health, OK
            return 0 if run_health()['status'] in OK else 1
        from guess_wing_spot.actions_runtime import run
        result = run(args.mode)
        return 0 if result["status"] in {"validated", "completed"} or result["status"].startswith("skipped") else 1
    except Exception as error:
        # Provider exceptions and response bodies must not leak from traceback.
        import re
        from guess_wing_spot.meta_reels import MetaError
        from guess_wing_spot.durable import DurableError
        safe = str(error) if isinstance(error, (MetaError, DurableError)) and re.fullmatch(r"[a-z0-9_]+", str(error)) else "provider_storage_ocr_or_source_validation_failed"
        print(json.dumps({"status": "blocked", "reason": safe}))
        print('::error::Publishing or health blocked: '+safe)
        import os
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            with open(os.environ['GITHUB_STEP_SUMMARY'],'a',encoding='utf-8') as stream:
                stream.write('\nAutomation blocked: '+safe+'\n')
        return 1


if __name__ == "__main__":
    sys.exit(main())
