"""Meta v25 read-only insights; separate vocabularies and explicit missing values."""
import hashlib
import hmac
import math
import re
import time
from datetime import datetime, timezone

import requests

IG_METRICS = {
    "views": "views", "reach": "reach", "likes_reactions": "likes",
    "comments": "comments", "shares": "shares", "saves": "saved",
    "watch_time_ms": "ig_reels_video_view_total_time", "avg_watch_time_ms": "ig_reels_avg_watch_time",
}
FB_METRICS = {
    "views": "fb_reels_total_plays", "initial_plays": "blue_reels_play_count",
    "reach": "post_impressions_unique", "likes_reactions": "post_video_likes_by_reaction_type",
    "comments": "post_video_social_actions", "shares": "post_video_social_actions",
    "watch_time_ms": "post_video_view_time", "avg_watch_time_ms": "post_video_avg_time_watched",
}
PERMISSIONS = {
    "instagram": {"instagram_basic", "instagram_manage_insights", "pages_read_engagement"},
    "facebook": {"read_insights", "pages_manage_engagement"},
}
DEFINITIONS = {
    "instagram": {
        "views": "Instagram plays, including repeat plays; organic media insights, not unique people.",
        "reach": "Estimated unique Instagram accounts seeing this Reel at least once.",
        "likes_reactions": "Organic likes.", "comments": "Organic comments.",
        "shares": "Reel shares.", "saves": "Times Instagram users saved the media.",
        "watch_time_ms": "Total Reel playback time including replays, milliseconds.",
        "avg_watch_time_ms": "Average Reel playback time, milliseconds; provider-defined denominator.",
    },
    "facebook": {
        "views": "Facebook Reel starts of at least 1ms, including replays (fb_reels_total_plays).",
        "initial_plays": "Reel starts of at least 1ms, excluding replays (blue_reels_play_count).",
        "reach": "Estimated people seeing this Reel at least once, whether or not they played it.",
        "likes_reactions": "Sum of returned Reel reaction-type counts.",
        "comments": "Comments from the social-actions breakdown.",
        "shares": "Shares from the social-actions breakdown.", "saves": "No documented Reel save insight in this API.",
        "watch_time_ms": "Total Reel playback time including replays, milliseconds.",
        "avg_watch_time_ms": "Average milliseconds played per play instance, including replays.",
    },
}


class MetaReadError(RuntimeError):
    def __init__(self, reason, code=None):
        super().__init__(reason)
        self.code = code


def number(value):
    return value if type(value) in (int, float) and math.isfinite(value) and value >= 0 else None


def missing(reason):
    return {"value": None, "reason": reason}


def scalar(payload, metric):
    rows = [x for x in payload.get("data", []) if x.get("name") == metric]
    if len(rows) != 1:
        return None
    row = rows[0]
    values = row.get("values", [])
    # Lifetime request only: do not sum time-series points as a lifetime count.
    if len(values) == 1:
        return values[0].get("value")
    return row.get("total_value", {}).get("value")


def normalize(platform, payloads, failures):
    mapping = IG_METRICS if platform == "instagram" else FB_METRICS
    result = {}
    for name, metric in mapping.items():
        if metric in failures:
            result[name] = missing(failures[metric])
            continue
        value = scalar(payloads.get(metric, {}), metric)
        if platform == "facebook" and name == "likes_reactions":
            if isinstance(value, dict) and value and all(number(v) is not None for v in value.values()):
                value = sum(value.values())
            else:
                value = None
        if platform == "facebook" and name in {"comments", "shares"}:
            # Missing breakdown keys are unavailable, never invented zeroes.
            key = "comment" if name == "comments" else "share"
            value = value.get(key) if isinstance(value, dict) else None
        value = number(value)
        result[name] = {"value": value, "reason": None if value is not None else "empty_or_unavailable"}
    if platform == "facebook":
        result["saves"] = missing("unsupported_by_documented_reel_api")
    return result


class MetaReader:
    def __init__(self, token, secret, version, *, session=None, sleep=time.sleep):
        if version != "v25.0" or not token or not secret:
            raise MetaReadError("configured_v25_token_and_app_secret_required")
        self.token, self.secret, self.version = token, secret, version
        self.session, self.sleep = session or requests.Session(), sleep
        self.page_token = None
        self.audit, self.granted = [], set()
        self.rate_limited = False

    def get(self, path, params=None, *, page=False):
        if not re.fullmatch(r"(?:me/permissions|\d+(?:/(?:insights|video_insights))?)", path):
            raise MetaReadError("forbidden_meta_read_path")
        if self.rate_limited:
            raise MetaReadError("rate_limited_deferred")
        token = self.page_token if page else self.token
        params = dict(params or {})
        params["appsecret_proof"] = hmac.new(self.secret.encode(), token.encode(), hashlib.sha256).hexdigest()
        reason, code = "transient_failure", None
        for attempt in range(3):
            self.audit.append({"method": "GET", "endpoint": "insights" if "/" in path and path != "me/permissions" else "identity_or_metadata"})
            try:
                r = self.session.get(f"https://graph.facebook.com/{self.version}/{path}", params=params,
                                     headers={"Authorization": "Bearer " + token}, timeout=35, allow_redirects=False)
                try:
                    payload = r.json()
                except ValueError:
                    payload = {}
                error = payload.get("error") or {}
                code = error.get("code")
                actual_version = r.headers.get("facebook-api-version")
                if actual_version and actual_version != self.version:
                    raise MetaReadError("api_version_mismatch")
                if 200 <= r.status_code < 300 and not error and payload:
                    # Avoid consuming a nearly exhausted per-app/Page budget.
                    if any(self._usage(r.headers.get(h, "{}")) >= 90 for h in
                           ("x-app-usage", "x-page-usage", "x-business-use-case-usage")):
                        self.sleep(5)
                    return payload
                transient = r.status_code == 429 or r.status_code >= 500 or code in {1, 2, 4, 17, 32, 341, 613}
                reason = ("permission_denied" if code in {10, 200, 294} or r.status_code == 403 else
                          "invalid_or_expired_token" if code == 190 else
                          "rate_limited" if r.status_code == 429 or code in {4, 17, 32, 341, 613} else
                          "unsupported_or_unavailable" if code == 100 else "provider_rejected")
                if not transient:
                    raise MetaReadError(reason, code)
                retry_after = r.headers.get("Retry-After", "0")
                try:
                    delay = max(float(retry_after), 2 ** attempt)
                except ValueError:
                    delay = 2 ** attempt
                if delay > 60:
                    self.rate_limited = True
                    raise MetaReadError("rate_limited_deferred", code)
            except requests.RequestException:
                reason, delay = "transient_connection_failure", 2 ** attempt
            if attempt < 2:
                self.sleep(delay)
        if reason == "rate_limited":
            self.rate_limited = True
        raise MetaReadError(reason, code)

    @staticmethod
    def _usage(value):
        import json
        def maximum(obj):
            if isinstance(obj, dict):
                return max((maximum(v) for k, v in obj.items() if k != "estimated_time_to_regain_access"), default=0)
            if isinstance(obj, list):
                return max(map(maximum, obj), default=0)
            return obj if type(obj) in (int, float) else 0
        try:
            return maximum(json.loads(value))
        except (ValueError, TypeError):
            return 0

    def identity(self, ig_id, page_id, expected_ig, expected_page):
        if not ig_id.isdigit() or not page_id.isdigit() or not expected_ig or not expected_page:
            raise MetaReadError("pinned_account_identity_required")
        grants = self.get("me/permissions")
        self.granted = {p["permission"] for p in grants.get("data", []) if p.get("status") == "granted"}
        page = self.get(page_id, {"fields": "id,name,access_token,instagram_business_account"})
        self.page_token = page.get("access_token") or self.token
        ig = self.get(ig_id, {"fields": "id,username"})
        if (str(page.get("id")) != page_id or str(ig.get("id")) != ig_id or
            str((page.get("instagram_business_account") or {}).get("id")) != ig_id or
            page.get("name", "").casefold() != expected_page.casefold() or
            ig.get("username", "").casefold() != expected_ig.casefold()):
            raise MetaReadError("pinned_account_identity_or_link_mismatch")
        return {"api_version": self.version, "account_type": "professional_page_linked_facebook_login",
                "identity_verified": True,
                "permissions": {p: {"required": sorted(required), "missing": sorted(required - self.granted)}
                                for p, required in PERMISSIONS.items()}}

    def metadata(self, post):
        ig = post["platform"] == "instagram"
        fields = "id,timestamp,permalink" if ig else "id,created_time,permalink_url"
        data = self.get(post["media_id"], {"fields": fields}, page=not ig)
        if str(data.get("id")) != post["media_id"]:
            raise MetaReadError("media_identity_mismatch")
        timestamp = data.get("timestamp" if ig else "created_time")
        try:
            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                raise ValueError()
        except (AttributeError, ValueError):
            raise MetaReadError("actual_publication_time_unavailable") from None
        link = data.get("permalink" if ig else "permalink_url")
        if not ig and isinstance(link, str) and link.startswith("/"):
            link = "https://www.facebook.com" + link
        if not isinstance(link, str) or not re.fullmatch(r"https://(?:www\.)?(?:instagram\.com|facebook\.com)/[^\s?]+/?", link):
            link = None
        return {**post, "published_at": dt.astimezone(timezone.utc).isoformat(),
                "publication_time_source": "meta_media_timestamp" if ig else "meta_video_created_time",
                "post_url": link, "post_url_reason": None if link else "permalink_unavailable"}

    def insights(self, post):
        platform = post["platform"]
        metrics = IG_METRICS if platform == "instagram" else FB_METRICS
        missing_permissions = PERMISSIONS[platform] - self.granted
        payloads, failures = {}, {}
        for metric in sorted(set(metrics.values())):
            if missing_permissions:
                failures[metric] = "missing_permission:" + ",".join(sorted(missing_permissions))
                continue
            try:
                payload = self.get(post["media_id"] + ("/insights" if platform == "instagram" else "/video_insights"),
                                   {"metric": metric, "period": "lifetime"}, page=platform == "facebook")
                # Drop paging URLs (may contain access tokens). Retain the raw
                # supported insight rows, not untrusted error messages.
                payloads[metric] = self.redact({"data": payload.get("data", [])})
            except MetaReadError as error:
                failures[metric] = str(error)
        return normalize(platform, payloads, failures), payloads, failures

    def redact(self, value):
        if isinstance(value, dict):
            return {k: self.redact(v) for k, v in value.items()
                    if k not in {"access_token", "appsecret_proof", "paging"}}
        if isinstance(value, list):
            return [self.redact(v) for v in value]
        if isinstance(value, str):
            for secret in (self.token, self.secret, self.page_token):
                if secret:
                    value = value.replace(secret, "[redacted]")
        return value
