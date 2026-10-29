"""GET/HEAD-only adapter. Deliberately does not reuse the write-capable client.

No RPC, storage signing, queue, processing, upload, or publication endpoints exist
on this interface. Error messages never include response bodies or credentials.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class SourceError(RuntimeError):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise SourceError("Redirect refused; credentials must stay on the configured host")


@dataclass
class Snapshot:
    photos: list[dict]
    votes: dict[str, dict]
    destinations: dict[str, dict]
    states: dict[str, dict]
    users: dict[str, dict]
    unsafe: set[str]

    def source_digest(self, ids: list[str]) -> str:
        rows = sorted((p for p in self.photos if p["id"] in ids), key=lambda p: p["id"])
        return hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()


TABLES = {
    # Full rows are read only to hash every source field before/after a run.
    # They are never serialized into a manifest, log, or public artifact.
    "wing_media_submissions": ("id", "*"),
    "wing_jury_photo_vote_counts": ("submission_id", "submission_id,like_count,dislike_count,neutral_count,updated_at"),
    "destinations": ("id", "id,name,address,city,state_id,lat,lng"),
    "states": ("state_id", "state_id,state_code,state_name"),
    "users": ("user_id", "user_id,username,display_name,social_opt_out,allow_social_tagging,social_attribution_preference"),
    "wing_submission_abuse_signals": ("id", "id,submission_id,severity"),
}


def read_environment(path: Path | None) -> dict[str, str]:
    """Read only two named values; no interpolation, logging, or global env edits."""
    values = {}
    if path:
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            key, sep, value = line.partition("=")
            if sep and key.strip() in {"SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"}:
                values[key.strip()] = value.strip().strip("\"'")
    for key in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        if os.environ.get(key):
            values[key] = os.environ[key]
    return values


class ReadOnlySources:
    def __init__(self, url: str, key: str, *, opener=None):
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.netloc or parsed.path not in ("", "/") or parsed.query or parsed.fragment or parsed.username:
            raise SourceError("A plain HTTPS Supabase origin is required")
        if not key:
            raise SourceError("Read credentials are missing")
        self._origin, self._key = url.rstrip("/"), key
        self._opener = opener or build_opener(NoRedirect())
        self.read_requests = 0

    @classmethod
    def from_environment(cls, path: Path | None):
        env = read_environment(path)
        return cls(env.get("SUPABASE_URL", ""), env.get("SUPABASE_SERVICE_ROLE_KEY", ""))

    def _request(self, method: str, path: str, *, params=None, maximum=16_000_000):
        if method not in {"GET", "HEAD"}:
            raise SourceError("Only GET and HEAD are permitted")
        if path.startswith("rest/v1/"):
            if path.removeprefix("rest/v1/") not in TABLES:
                raise SourceError("Table or RPC endpoint is not allowlisted")
        elif not re.fullmatch(r"storage/v1/object/authenticated/wing-submissions/processed/[0-9a-f-]{36}/primary", path):
            raise SourceError("Storage endpoint is not an existing processed-photo path")
        target = self._origin + "/" + path
        if params:
            target += "?" + urlencode(params)
        request = Request(target, method=method, headers={
            "apikey": self._key, "Authorization": "Bearer " + self._key,
            "Accept-Profile": "public",
        })
        try:
            self.read_requests += 1
            with self._opener.open(request, timeout=30) as response:
                if method == "HEAD":
                    return b""
                body = response.read(maximum + 1)
                if len(body) > maximum:
                    raise SourceError("Read exceeded the bounded response size")
                return body
        except HTTPError as error:
            raise SourceError(f"Read-only request failed: HTTP {error.code}") from None
        except (URLError, TimeoutError, OSError):
            raise SourceError("Read-only request failed; connection unavailable") from None

    def rows(self, table: str, filters=None) -> list[dict]:
        if table not in TABLES:
            raise SourceError("Table is not allowlisted")
        order, columns = TABLES[table]
        result = []
        while True:
            params = {"select": columns, "order": order + ".asc", "limit": 500, "offset": len(result), **(filters or {})}
            # Do not let callers broaden the explicit schema contract.
            params.update(select=columns, order=order + ".asc", limit=500, offset=len(result))
            page = json.loads(self._request("GET", "rest/v1/" + table, params=params))
            if not isinstance(page, list):
                raise SourceError("Unexpected read-only table response")
            result.extend(page)
            if len(page) < 500:
                return result
            if len(result) >= 100_000:
                raise SourceError("Inventory exceeded the bounded pagination limit")

    def related(self, table: str, column: str, ids) -> list[dict]:
        if column not in {"submission_id", "id", "user_id"}:
            raise SourceError("Unsupported relation")
        ids = sorted(set(str(i) for i in ids if i))
        if any(not re.fullmatch(r"[0-9a-f-]{36}", i) for i in ids):
            raise SourceError("Invalid source identifier")
        result = []
        for offset in range(0, len(ids), 80):
            result.extend(self.rows(table, {column: "in.(" + ",".join(ids[offset:offset + 80]) + ")"}))
        return result

    def load(self) -> Snapshot:
        photos = self.rows("wing_media_submissions", {"media_type": "eq.photo"})
        required = {"id", "user_id", "destination_id", "media_type", "status", "owner_deleted_at", "withdrawn_at",
                    "consent_version", "consented_at", "attribution_preference", "processed_storage_path", "moderation_status",
                    "wing_verification_status", "rejected_at", "approved_at", "approved_by"}
        if any(not required.issubset(p) for p in photos):
            raise SourceError("Source schema differs from the verified photo contract")
        votes = self.related("wing_jury_photo_vote_counts", "submission_id", (p["id"] for p in photos))
        destinations = self.related("destinations", "id", (p["destination_id"] for p in photos))
        users = self.related("users", "user_id", (p["user_id"] for p in photos))
        abuse = self.related("wing_submission_abuse_signals", "submission_id", (p["id"] for p in photos))
        return Snapshot(photos, {v["submission_id"]: v for v in votes},
                        {d["id"]: d for d in destinations},
                        {str(s["state_id"]): s for s in self.rows("states")},
                        {u["user_id"]: u for u in users},
                        {a["submission_id"] for a in abuse if a["severity"] in {"high", "critical"}})

    def asset_available(self, photo_id: str) -> bool:
        try:
            self._request("HEAD", f"storage/v1/object/authenticated/wing-submissions/processed/{photo_id}/primary")
            return True
        except SourceError:
            return False

    def photo_bytes(self, photo_id: str) -> bytes:
        return self._request("GET", f"storage/v1/object/authenticated/wing-submissions/processed/{photo_id}/primary")
