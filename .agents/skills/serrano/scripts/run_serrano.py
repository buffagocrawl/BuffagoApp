from __future__ import annotations

import sys
from pathlib import Path


def main(argv: list[str] | None = None) -> int:
    repo_root = Path(__file__).resolve().parents[4]
    serrano_dir = repo_root / "Agents" / "Serrano"
    if str(serrano_dir) not in sys.path:
        sys.path.insert(0, str(serrano_dir))
    from serrano.cli import main as serrano_main

    return serrano_main(argv)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

