"""Local, append-only, independent generation ledger; no source-linked jobs."""
import json
import os
from pathlib import Path


def read_history(directory: Path) -> list[dict]:
    if not directory.exists():
        return []
    result = []
    for path in sorted(directory.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or not data.get("reel_id"):
            raise ValueError("Invalid independent history entry")
        result.append(data)
    return result


def write_private(path: Path, value: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive create prevents accidental overwrite. Files contain answers and
    # are private review material, never publication assets or CI uploads.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2, ensure_ascii=False)


def publication_slots(reel_id):
    return {platform: {"status": "not_published", "idempotency_key": f"{reel_id}:{platform}",
                       "external_post_id": None, "published_at": None,
                       "requires_fresh_source_revalidation": True}
            for platform in ("instagram", "facebook")}
