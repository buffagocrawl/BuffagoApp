from __future__ import annotations

import argparse
import json
from pathlib import Path

from .runtime import CayenneRuntime


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Cayenne runtime QA agent")
    parser.add_argument("command", choices=("check-prerequisites", "run"))
    parser.add_argument("--request", type=Path)
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    runtime = CayenneRuntime(args.repo_root)
    if args.command == "check-prerequisites":
        print(json.dumps(runtime.check_prerequisites(), indent=2))
        return 0
    if not args.request:
        parser.error("run requires --request")
    result = runtime.run(json.loads(args.request.read_text(encoding="utf-8-sig")), dry_run=args.dry_run)
    print(json.dumps(result, indent=2))
    return 0 if result["status"] == "passed" else 2


if __name__ == "__main__":
    raise SystemExit(main())
