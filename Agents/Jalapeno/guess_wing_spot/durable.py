"""Private immutable ledger, physically separated from every source bucket.

Standard Storage create-without-upsert is the atomic claim primitive. State
revisions are append-only: no mutable index, cache, overwrite or source RPC.
"""
import json
import re
from urllib.parse import quote

import requests


class DurableError(RuntimeError):
    pass


class Busy(DurableError):
    pass


class PrivateLedger:
    BUCKET = "jalapeno-assets"
    PREFIX = "guess-wing-spot-v1/"

    def __init__(self, origin, key, session=None):
        if not re.fullmatch(r"https://[a-z0-9.-]+", origin):
            raise DurableError("invalid_storage_origin")
        self.origin = origin
        self.session = session or requests.Session()
        self.session.headers.update(apikey=key, Authorization="Bearer " + key)

    def request(self, method, path, **kwargs):
        try:
            response = self.session.request(method, self.origin + "/storage/v1/" + path, timeout=45,
                                            allow_redirects=False, **kwargs)
        except requests.RequestException:
            raise DurableError("storage_unavailable_or_uncertain") from None
        return response

    def check_private(self):
        response = self.request("GET", "bucket/" + self.BUCKET)
        if response.status_code != 200 or response.json().get("public") is not False:
            raise DurableError("ledger_bucket_must_exist_and_be_private")

    def key(self, key):
        if not re.fullmatch(r"[a-zA-Z0-9/_ .-]+", key) or ".." in key or key.startswith("/"):
            raise DurableError("invalid_private_object_key")
        return self.PREFIX + key

    def get_bytes(self, key):
        response = self.request("GET", "object/authenticated/" + self.BUCKET + "/" + quote(self.key(key), safe="/"),
                                headers={"Cache-Control": "no-cache"})
        if response.status_code == 404:
            return None
        if response.status_code == 400:
            # Storage's current authenticated endpoint encodes a missing
            # object as HTTP 400 with logical 404/not_found. Do not confuse
            # this with permission/auth failures or unavailable storage.
            try:
                error = response.json()
            except ValueError:
                error = {}
            if str(error.get("statusCode")) == "404" and error.get("error") == "not_found":
                return None
        if response.status_code != 200:
            raise DurableError("private_read_failed")
        return response.content

    def get(self, key):
        data = self.get_bytes(key)
        return json.loads(data) if data is not None else None

    def create(self, key, data, mime="application/json"):
        content = json.dumps(data, sort_keys=True).encode() if mime == "application/json" else data
        response = self.request("POST", "object/" + self.BUCKET + "/" + quote(self.key(key), safe="/"),
                                data=content, headers={"Content-Type": mime, "x-upsert": "false", "Cache-Control": "no-store"})
        if response.status_code in (400, 409) and str(response.json().get("error", "")).lower() in {"duplicate", "asset already exists"}:
            return False
        if response.status_code not in (200, 201):
            # Status-only reporting: responses can contain private paths.
            raise DurableError("private_create_failed_or_conflict")
        # Prove the exact intent is durably readable before any provider POST.
        if self.get_bytes(key) != content:
            raise DurableError("private_write_readback_failed")
        return True

    def names(self, prefix, *, reverse=False):
        result = []
        while True:
            response = self.request("POST", "object/list/" + self.BUCKET, json={"prefix": self.key(prefix), "limit": 100,
                                    "offset": len(result), "sortBy": {"column": "name", "order": "desc" if reverse else "asc"}})
            if response.status_code != 200:
                raise DurableError("private_list_failed")
            page = response.json()
            result.extend(x["name"] for x in page)
            if len(page) < 100:
                return result
            if len(result) > 20000:
                raise DurableError("private_ledger_listing_limit")

    def latest(self, date):
        names = self.names(f"days/{date}/states/", reverse=True)
        return self.get(f"days/{date}/states/{names[0]}") if names else None

    def save(self, date, state):
        state["revision"] = state.get("revision", 0) + 1
        if not self.create(f"days/{date}/states/{state['revision']:06d}.json", state):
            raise Busy("concurrent_state_revision")

    def claim(self, date, scope, owner, previous_finished):
        if scope not in {"run", "instagram", "facebook"}:
            raise DurableError("invalid_claim_scope")
        prefix = f"claims/{date}/{scope}/"
        names = self.names(prefix, reverse=True)
        sequence = 1
        if names:
            prior = self.get(prefix + names[0])
            if prior["owner"] == owner or not previous_finished(prior["owner"]):
                raise Busy("prior_claim_still_active_or_unverifiable")
            sequence = int(names[0].split(".")[0]) + 1
        if sequence > 12:
            raise Busy("daily_claim_retry_limit")
        if not self.create(prefix + f"{sequence:06d}.json", {"owner": owner, "scope": scope, "date": date}):
            raise Busy("claim_already_acquired")

    def history(self):
        return [self.get("history/" + name) for name in self.names("history/") if name.endswith(".json")]

    def video_url(self, reel_id):
        key = f"outputs/{reel_id}.mp4"
        response = self.request("POST", "object/sign/" + self.BUCKET + "/" + quote(self.key(key), safe="/"), json={"expiresIn": 3600})
        if response.status_code != 200:
            raise DurableError("generated_video_sign_failed")
        signed = response.json().get("signedURL", "")
        if not signed.startswith("/object/sign/" + self.BUCKET + "/" + self.PREFIX + "outputs/"):
            raise DurableError("unexpected_generated_video_url")
        return self.origin + "/storage/v1" + signed

    def cleanup_outputs(self, retained_ids):
        # Only explicitly known generated MP4s may be removed. Ledger and all
        # source/legacy objects are unreachable through this deletion method.
        names = self.names("outputs/")
        for name in names:
            if re.fullmatch(r"[a-f0-9-]{36}\.mp4", name) and name[:-4] not in retained_ids:
                response = self.request("DELETE", "object/" + self.BUCKET, json={"prefixes": [self.key("outputs/" + name)]})
                if response.status_code != 200:
                    raise DurableError("generated_output_cleanup_failed")
