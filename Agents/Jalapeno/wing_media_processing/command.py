"""Safe subprocess boundary. No command is ever passed through a shell."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any, Sequence

from .errors import PermanentMediaError, RetryableMediaError


def run_command(
    arguments: Sequence[str],
    *,
    timeout_seconds: int,
    permanent_failure: bool = False,
) -> subprocess.CompletedProcess[bytes]:
    if not arguments or not all(isinstance(argument, str) for argument in arguments):
        raise ValueError("arguments must be a non-empty sequence of strings")
    try:
        return subprocess.run(
            list(arguments),
            check=True,
            shell=False,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout_seconds,
        )
    except FileNotFoundError as exc:
        raise RetryableMediaError(f"required media binary is unavailable: {arguments[0]}") from exc
    except subprocess.TimeoutExpired as exc:
        raise RetryableMediaError(f"media command timed out: {arguments[0]}") from exc
    except subprocess.CalledProcessError as exc:
        error_type = PermanentMediaError if permanent_failure else RetryableMediaError
        # stderr commonly embeds private storage paths. Keep it out of durable
        # job failure reasons and logs surfaced to reviewers.
        raise error_type(
            f"media command failed with exit code {exc.returncode}: {arguments[0]}"
        ) from exc


def ffprobe_json(path: Path, *, ffprobe_binary: str, timeout_seconds: int = 20) -> dict[str, Any]:
    result = run_command(
        [
            ffprobe_binary,
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            str(path),
        ],
        timeout_seconds=timeout_seconds,
        permanent_failure=True,
    )
    try:
        payload = json.loads(result.stdout.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PermanentMediaError("ffprobe returned malformed metadata") from exc
    if not isinstance(payload, dict):
        raise PermanentMediaError("ffprobe metadata was not an object")
    return payload
