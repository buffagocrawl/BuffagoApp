"""Enforced HTTP boundary: publication reads and analytics-only immutable writes."""
import hashlib
import json
import re
from urllib.parse import quote

import requests

BUCKET = "jalapeno-assets"
ANALYTICS = "guess-wing-spot-analytics-v1/"
PUBLICATIONS = ("guess-wing-spot-v1/", "guess-wing-spot-live-test-v1/")


class StorageError(RuntimeError):
    pass


class Store:
    def __init__(self, origin, key, *, readonly=False, session=None):
        if not re.fullmatch(r"https://[a-z0-9.-]+", origin):
            raise StorageError("invalid_storage_origin")
        self.origin, self.readonly = origin, readonly
        self.session = session or requests.Session()
        self.session.headers.update(apikey=key, Authorization="Bearer " + key)
        self.read_hashes, self.audit = {}, []

    def request(self, method, path, **kwargs):
        # No REST database, RPC, bucket administration, deletion, upsert, or
        # publication object writes can cross this boundary, even by mistake.
        list_path = "object/list/" + BUCKET
        object_path = "object/" + BUCKET + "/"
        allowed = (method == "GET" and (path == "bucket/" + BUCKET or
                   path.startswith("object/authenticated/" + BUCKET + "/")))
        if method == "GET" and path.startswith("object/authenticated/" + BUCKET + "/"):
            self.valid_key(path[len("object/authenticated/" + BUCKET + "/"):])
        if method == "POST" and path == list_path:
            self.valid_key(kwargs["json"]["prefix"], listing=True)
            allowed = True  # Storage list is a read operation using POST.
        if method == "POST" and path.startswith(object_path):
            key = path[len(object_path):]
            self.valid_key(key)
            allowed = (not self.readonly and key.startswith(ANALYTICS) and
                       kwargs.get("headers", {}).get("x-upsert") == "false")
        if not allowed:
            raise StorageError("forbidden_storage_operation")
        self.audit.append({"method": method, "path": path})
        try:
            response = self.session.request(method, self.origin + "/storage/v1/" + path,
                                            timeout=45, allow_redirects=False, **kwargs)
        except requests.RequestException:
            raise StorageError("storage_connection_failed") from None
        return response

    @staticmethod
    def valid_key(key, *, listing=False):
        if not re.fullmatch(r"[a-zA-Z0-9/_.-]+", key) or ".." in key:
            raise StorageError("invalid_storage_key")
        if key.startswith(ANALYTICS):
            return key
        if any(key.startswith(p + "days/") for p in PUBLICATIONS):
            return key
        raise StorageError("storage_read_outside_analytics_or_publication_days")

    def check_private(self):
        r = self.request("GET", "bucket/" + BUCKET)
        if r.status_code != 200 or r.json().get("public") is not False:
            raise StorageError("analytics_bucket_must_be_private")

    def read(self, key):
        self.valid_key(key)
        r = self.request("GET", "object/authenticated/" + BUCKET + "/" + quote(key, safe="/"),
                         headers={"Cache-Control": "no-cache"})
        if r.status_code == 404:
            return None
        if r.status_code == 400:
            error = r.json()
            if str(error.get("statusCode")) == "404" and error.get("error") == "not_found":
                return None
        if r.status_code != 200:
            raise StorageError("storage_read_failed")
        if not key.startswith(ANALYTICS):
            digest = hashlib.sha256(r.content).hexdigest()
            prior = self.read_hashes.setdefault(key, digest)
            if prior != digest:
                raise StorageError("publication_record_changed_during_collection")
        return r.json()

    def names(self, prefix):
        self.valid_key(prefix, listing=True)
        names = []
        for offset in range(0, 20000, 100):
            r = self.request("POST", "object/list/" + BUCKET,
                             json={"prefix": prefix, "limit": 100, "offset": offset,
                                   "sortBy": {"column": "name", "order": "asc"}})
            if r.status_code != 200:
                raise StorageError("storage_list_failed")
            page = r.json()
            names.extend(x["name"] for x in page)
            if len(page) < 100:
                return names
        raise StorageError("storage_listing_limit")

    def create(self, relative, payload):
        key = self.valid_key(ANALYTICS + relative)
        data = json.dumps(payload, sort_keys=True, allow_nan=False).encode()
        r = self.request("POST", "object/" + BUCKET + "/" + key, data=data,
                         headers={"Content-Type": "application/json", "x-upsert": "false"})
        if r.status_code in (400, 409):
            if str(r.json().get("error", "")).lower() in {"duplicate", "asset already exists"}:
                return False
        if r.status_code not in (200, 201):
            raise StorageError("analytics_create_failed")
        if self.read(key) != payload:
            raise StorageError("analytics_readback_failed")
        return True

    def verify_publications_unchanged(self):
        for key in list(self.read_hashes):
            if self.read(key) is None:
                raise StorageError("publication_record_disappeared")
        writes = [r for r in self.audit if r["method"] == "POST" and
                  r["path"].startswith("object/" + BUCKET + "/")]
        if any(not r["path"].startswith("object/" + BUCKET + "/" + ANALYTICS) for r in writes):
            raise StorageError("write_boundary_verification_failed")
        return {"publication_objects_verified": len(self.read_hashes),
                "publication_hashes_unchanged": True,
                "analytics_object_create_requests": len(writes),
                "app_or_source_endpoints_accessed": False,
                "writes_confined_to": ANALYTICS}


def discover(store):
    posts, errors, seen = [], [], set()
    for namespace in PUBLICATIONS:
        try:
            dates = store.names(namespace + "days/")
        except StorageError as error:
            errors.append({"scope": namespace, "reason": str(error)})
            continue
        for date in dates:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
                continue
            try:
                prefix = namespace + "days/" + date + "/states/"
                revisions = [n for n in store.names(prefix) if re.fullmatch(r"\d{6}\.json", n)]
                if not revisions:
                    continue
                state = store.read(prefix + max(revisions)) or {}
                reel_id = state.get("reel_id", "")
                if not re.fullmatch(r"[a-f0-9-]{36}", reel_id):
                    continue
                for platform in ("instagram", "facebook"):
                    p = state.get("platforms", {}).get(platform, {})
                    if p.get("status") != "published":
                        continue
                    media_id = str(p.get("publication_id") or "")
                    if not media_id.isdigit():
                        errors.append({"platform": platform, "reason": "published_media_id_missing"})
                        continue
                    identity = (platform, media_id)
                    if identity in seen:
                        continue
                    seen.add(identity)
                    # Explicit projection: never copy captions, answers, photos,
                    # signed asset URLs, votes, or provider intents into analytics.
                    posts.append({"reel_id": reel_id, "platform": platform, "media_id": media_id,
                                  "geography": {k: state.get("geography", {}).get(k) for k in
                                                ("label", "level", "state_code")},
                                  "publication_namespace": namespace,
                                  "ledger_date": date,
                                  "ledger_published_at": p.get("published_at"),
                                  "live_test": namespace == PUBLICATIONS[1]})
            except (StorageError, ValueError, TypeError) as error:
                errors.append({"scope": namespace, "date": date,
                               "reason": str(error) if isinstance(error, StorageError) else "invalid_ledger_record"})
    return posts, errors
