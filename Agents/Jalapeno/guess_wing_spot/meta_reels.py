"""Facebook-Login Graph API Reels adapters, independent of source-linked jobs.

Every mutating provider call is preceded by a durable intent. Unknown outcomes
are reconciled by stored IDs and never automatically republished blindly.
"""
import re
import time
import hashlib
import hmac
from datetime import datetime, timezone

import requests


class MetaError(RuntimeError):
    def __init__(self, reason, *, uncertain=False, diagnostic=None):
        super().__init__(reason)
        self.uncertain = uncertain
        self.diagnostic = diagnostic


def safe_meta_message(error):
    """Return fixed summaries only; provider messages may echo credentials."""
    message = str(error.get("message", "")).casefold()
    for fragment, summary in (
        ("session has been invalidated", "Access-token session was invalidated by a password change or security action."),
        ("session has expired", "Access-token session has expired."),
        ("access token has expired", "Access token has expired."),
        ("appsecret_proof", "App-secret proof is missing or invalid."),
        ("app secret", "Application-secret authentication failed."),
        ("cannot parse access token", "Access token could not be parsed."),
        ("invalid oauth access token", "OAuth access token is invalid."),
        ("permission", "Meta rejected the requested permission or access."),
        ("unsupported get request", "Object is unavailable or inaccessible to this token."),
    ):
        if fragment in message:
            return summary
    return "Meta rejected the request; unrecognized provider message withheld."


class Graph:
    def __init__(self, token, version, session=None, *, app_secret=None):
        if not token or not re.fullmatch(r"v\d{2,3}\.0", version):
            raise MetaError("missing_token_or_explicit_api_version")
        self.token, self.version = token, version
        self.app_secret = app_secret
        self.session = session or requests.Session()

    def call(self, method, path, *, token=None, data=None, rupload=False, body=None):
        # Labels never contain IDs, query strings, tokens, or provider URLs.
        endpoint = path if path in {"app", "debug_token", "me/permissions"} else "account/content_publishing_limit" if path.endswith("/content_publishing_limit") else "account"
        if rupload:
            if not re.fullmatch(r"video-upload/v\d{2,3}\.0/\d+", path):
                raise MetaError("untrusted_upload_path")
            url = "https://rupload.facebook.com/" + path
            headers = {"Authorization": "OAuth " + (token or self.token), "offset": "0", "file_size": str(len(body)), "Content-Type": "application/octet-stream"}
        else:
            if not re.fullmatch(r"[a-zA-Z0-9_/-]+", path):
                raise MetaError("untrusted_graph_path")
            url = f"https://graph.facebook.com/{self.version}/{path}"
            headers = {"Authorization": "Bearer " + (token or self.token)}
            data = dict(data or {})
            if self.app_secret:
                data["appsecret_proof"] = hmac.new(self.app_secret.encode(), (token or self.token).encode(), hashlib.sha256).hexdigest()
        try:
            response = self.session.request(method, url, headers=headers, params=data if method == "GET" else None,
                                            data=body if rupload else data if method != "GET" else None,
                                            timeout=60, allow_redirects=False)
        except requests.RequestException:
            raise MetaError("provider_timeout_or_connection_failure", uncertain=method != "GET") from None
        try:
            payload = response.json()
        except ValueError:
            raise MetaError("invalid_provider_response", uncertain=method != "GET") from None
        actual_version = getattr(response, "headers", {}).get("facebook-api-version")
        if actual_version and actual_version != self.version:
            raise MetaError("provider_api_version_mismatch", uncertain=method != "GET")
        if response.status_code >= 400 or payload.get("error"):
            error = payload.get("error") or {}
            code = error.get("code")
            reason = "expired_or_invalid_credentials" if code == 190 else "permission_denied" if code in (10, 200, 294) else "rate_limited" if code in (4, 17, 32, 613) else "provider_request_rejected"
            message = safe_meta_message(error)
            category = "app_secret_matching" if "secret" in message else "token_validity" if code == 190 else "permissions" if code in (10, 200, 294) else "account_access" if endpoint.startswith("account") else "provider_request"
            raise MetaError(reason, uncertain=method != "GET" and response.status_code >= 500,
                            diagnostic={"endpoint": endpoint, "check": getattr(self, "validation_check", "provider_request"),
                                        "http_status": response.status_code, "meta_code": code if type(code) is int else None,
                                        "meta_subcode": error.get("error_subcode") if type(error.get("error_subcode")) is int else None,
                                        "message": message, "failure_category": category})
        return payload

    def validate(self, instagram_id, page_id, expected_instagram, expected_page):
        if not all(re.fullmatch(r"\d+", x or "") for x in (instagram_id, page_id)):
            raise MetaError("account_identifiers_missing")
        if not self.app_secret:
            raise MetaError("meta_app_secret_required_for_expiration_validation")
        self.validation_check = "token_application_identity_and_app_secret_proof"
        app = self.call("GET", "app", data={"fields": "id"})
        app_id = str(app.get("id", ""))
        if not app_id.isdigit():
            raise MetaError("token_application_identity_unavailable")
        self.validation_check = "token_validity_and_app_secret_matching"
        debug = self.call("GET", "debug_token", token=app_id + "|" + self.app_secret, data={"input_token": self.token}).get("data", {})
        if not debug.get("is_valid") or str(debug.get("app_id")) != app_id or debug.get("type") != "USER":
            raise MetaError("valid_same_app_user_access_token_required")
        expiry = int(debug.get("expires_at", 0))
        access_expiry = int(debug.get("data_access_expires_at", 0))
        if (expiry and expiry < time.time() + 86400) or (access_expiry and access_expiry < time.time() + 86400):
            raise MetaError("user_token_or_data_access_expires_within_24_hours")
        # Obtain the Page token in memory only; never serialize it in state.
        self.validation_check = "facebook_page_access_and_instagram_link"
        page = self.call("GET", page_id, data={"fields": "id,name,access_token,instagram_business_account"})
        page_token = page.get("access_token") or self.token
        linked = str((page.get("instagram_business_account") or {}).get("id", ""))
        # The Facebook Login IG User reference does not expose Basic Display's
        # account_type. Page linkage is this API's professional-account proof.
        self.validation_check = "linked_instagram_account_access"
        ig = self.call("GET", instagram_id, token=page_token, data={"fields": "id,username"})
        if (str(page.get("id")) != page_id or str(ig.get("id")) != instagram_id or linked != instagram_id
                or (expected_instagram and ig.get("username", "").casefold() != expected_instagram.casefold())
                or (expected_page and page.get("name", "").casefold() != expected_page.casefold())):
            raise MetaError("configured_account_identity_or_link_mismatch")
        # Required grants are verified through /me/permissions, or, for a Page
        # token, through the source user token when supported. Fail closed.
        self.validation_check = "required_publishing_permissions"
        grants = self.call("GET", "me/permissions")
        granted = {p["permission"] for p in grants.get("data", []) if p.get("status") == "granted"}
        required = {"instagram_basic", "instagram_content_publish", "pages_read_engagement", "pages_manage_posts"}
        if not required.issubset(granted):
            raise MetaError("required_publishing_permissions_missing", diagnostic={
                "endpoint": "me/permissions", "check": "required_publishing_permissions",
                "http_status": 200, "meta_code": None, "meta_subcode": None,
                "message": "Token is valid but required publishing grants are missing.",
                "failure_category": "permissions", "missing_permissions": sorted(required - granted),
                "verified_required_permissions": sorted(required & granted),
                "token_validity": "passed", "app_secret_matching": "passed", "account_access_and_link": "passed",
                "facebook_name": page["name"], "instagram_username": ig["username"],
            })
        self.validation_check = "instagram_publishing_quota_access"
        self.call("GET", instagram_id + "/content_publishing_limit", token=page_token, data={"fields": "config,quota_usage"})
        return {"instagram": {"id": instagram_id, "username": ig["username"], "account_type": "professional_page_linked_facebook_login"},
                "facebook": {"id": page_id, "name": page["name"]}, "api_version": self.version,
                "permissions_verified": sorted(required), "user_token_expires_at": expiry,
                "data_access_expires_at": access_expiry}, page_token


class ReelPublisher:
    def __init__(self, graph, instagram_id, page_id, page_token, *, sleep=time.sleep):
        self.graph, self.instagram_id, self.page_id, self.page_token = graph, instagram_id, page_id, page_token
        self.sleep = sleep

    def publish(self, platform, state, persist, revalidate, video_url, video_bytes, window_ok):
        p = state["platforms"][platform]
        if p["status"] == "published":
            return
        if p.get("pending"):
            self.reconcile(platform, state, persist)
            if p["status"] == "published" or p.get("pending"):
                return
        if p.get("attempts", 0) >= 8:
            p.update(status="blocked", reason="platform_attempt_limit")
            persist()
            return
        p["attempts"] = p.get("attempts", 0) + 1
        persist()

        def mutation(operation, path, *, data=None, body=None, rupload=False):
            p.update(pending=operation, status="pending", intent_at=datetime.now(timezone.utc).isoformat())
            persist()  # If storage fails, no provider POST occurs.
            try:
                result = self.graph.call("POST", path, token=self.page_token, data=data, body=body, rupload=rupload)
            except MetaError as error:
                if not error.uncertain:
                    p["pending"] = None
                p.update(status="uncertain" if error.uncertain else "failed", reason=str(error))
                persist()
                raise
            return result

        try:
            if platform == "instagram":
                if not p.get("container_id"):
                    result = mutation("create", self.instagram_id + "/media", data={"media_type": "REELS", "video_url": video_url(), "caption": state["caption"], "share_to_feed": "true"})
                    if not str(result.get("id", "")).isdigit():
                        raise MetaError("container_id_missing", uncertain=True)
                    p.update(container_id=str(result["id"]), pending=None, status="container_created")
                    persist()
                ready = False
                for _ in range(5):
                    status = self.graph.call("GET", p["container_id"], token=self.page_token, data={"fields": "status_code"}).get("status_code")
                    if status == "FINISHED":
                        ready = True
                        break
                    if status in {"ERROR", "EXPIRED"}:
                        raise MetaError("instagram_container_failed_or_expired")
                    self.sleep(60)
                if not ready:
                    raise MetaError("instagram_processing_pending")
                revalidate()
                if not window_ok():
                    raise MetaError("publication_window_closed")
                result = mutation("publish", self.instagram_id + "/media_publish", data={"creation_id": p["container_id"]})
                if not str(result.get("id", "")).isdigit():
                    raise MetaError("published_media_id_missing", uncertain=True)
                p.update(publication_id=str(result["id"]), pending=None, status="published")
                persist()
                try:
                    p["post_url"] = self.graph.call("GET", p["publication_id"], token=self.page_token, data={"fields": "permalink"}).get("permalink")
                    persist()
                except MetaError:
                    pass  # Missing link must never cause a second publication.
            else:
                if not p.get("video_id"):
                    result = mutation("create", self.page_id + "/video_reels", data={"upload_phase": "start"})
                    if not str(result.get("video_id", "")).isdigit():
                        raise MetaError("facebook_video_id_missing", uncertain=True)
                    p.update(video_id=str(result["video_id"]), pending=None, status="video_created")
                    persist()
                if not p.get("uploaded"):
                    result = mutation("upload", f"video-upload/{self.graph.version}/{p['video_id']}", rupload=True, body=video_bytes())
                    if not result.get("success"):
                        raise MetaError("facebook_upload_not_confirmed", uncertain=True)
                    p.update(uploaded=True, pending=None, status="uploaded")
                    persist()
                revalidate()
                if not window_ok():
                    raise MetaError("publication_window_closed")
                result = mutation("publish", self.page_id + "/video_reels", data={"upload_phase": "finish", "video_id": p["video_id"], "video_state": "PUBLISHED", "description": state["caption"]})
                if not result.get("success"):
                    raise MetaError("facebook_publication_not_confirmed", uncertain=True)
                p.update(pending="publish", status="processing")
                persist()
                for _ in range(10):
                    self.reconcile(platform, state, persist)
                    if p["status"] == "published":
                        break
                    self.sleep(10)
        except MetaError as error:
            p.update(status="uncertain" if p.get("pending") or error.uncertain else "failed", reason=str(error))
            persist()

    def reconcile(self, platform, state, persist):
        p = state["platforms"][platform]
        operation = p.get("pending")
        identifier = p.get("container_id" if platform == "instagram" else "video_id")
        if not identifier:
            # Unknown create outcome has no stored provider identity. Do not
            # create another session on a retry; never guess acceptance.
            p.update(status="uncertain", reason="provider_identity_missing_after_intent")
            persist()
            return
        try:
            if platform == "instagram":
                result = self.graph.call("GET", identifier, token=self.page_token, data={"fields": "status_code"})
                if result.get("status_code") == "PUBLISHED":
                    p.update(status="published", pending=None, reason=None)
                    persist()
                    # Container identity proves publication. Find the public
                    # permalink if exactly one recent matching Reel exists.
                    try:
                        media = self.graph.call("GET", self.instagram_id + "/media", token=self.page_token,
                                                data={"fields": "id,caption,permalink,timestamp,media_product_type", "limit": 50})
                    except MetaError:
                        return  # Publication is already durably confirmed.
                    matches = [m for m in media.get("data", []) if m.get("caption") == state["caption"]
                               and m.get("media_product_type") == "REELS" and m.get("timestamp", "") >= p.get("intent_at", "")[:19]]
                    if len(matches) == 1:
                        p.update(publication_id=matches[0]["id"], post_url=matches[0].get("permalink"))
                elif operation == "publish":
                    p.update(status="uncertain", reason="publication_intent_not_yet_reconciled")
                else:
                    p.update(pending=None, status="container_created")
            else:
                result = self.graph.call("GET", identifier, token=self.page_token, data={"fields": "status"})
                status = result.get("status", {})
                if status.get("publishing_phase", {}).get("status") == "complete":
                    p.update(status="published", pending=None, publication_id=identifier,
                             post_url="https://www.facebook.com/reel/" + identifier, reason=None)
                elif operation == "publish":
                    p.update(status="uncertain", reason="publication_intent_not_yet_reconciled")
                elif operation == "upload" and status.get("uploading_phase", {}).get("status") == "complete":
                    p.update(uploaded=True, pending=None, status="uploaded")
                elif operation != "publish":
                    p.update(pending=None, status="video_created")
            persist()
        except MetaError as error:
            p.update(status="uncertain", reason=str(error))
            persist()
