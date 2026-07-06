from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from typing import Any
from uuid import uuid4

import requests

from supabase_client import SupabaseError


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True, slots=True)
class InstagramContainerResponse:
    container_id: str
    response_payload: dict[str, Any]
    created_at: str
    request_payload_safe: dict[str, Any]
    status: str = "created"


@dataclass(frozen=True, slots=True)
class InstagramPublishResponse:
    published_media_id: str
    response_payload: dict[str, Any]
    published_at: str
    status: str = "published"


@dataclass(slots=True)
class _SimulatedContainerState:
    request_payload: dict[str, Any]
    request_payload_safe: dict[str, Any]
    created_at: str
    status: str = "IN_PROGRESS"
    polls: int = 0
    published_media_id: str | None = None
    permalink: str | None = None
    media_details: dict[str, Any] | None = None


class InstagramGraphClient:
    def __init__(
        self,
        *,
        ig_user_id: str,
        access_token: str,
        api_version: str = "v23.0",
        simulate: bool = False,
        timeout_seconds: int = 30,
        transport: Any | None = None,
    ) -> None:
        self.ig_user_id = ig_user_id
        self.access_token = access_token
        self.api_version = api_version
        self.simulate = simulate
        self.timeout_seconds = timeout_seconds
        self.transport = transport or requests.Session()
        self._simulated_containers: dict[str, _SimulatedContainerState] = {}
        self._simulated_media: dict[str, dict[str, Any]] = {}

    def _endpoint(self, path: str) -> str:
        base = f"https://graph.facebook.com/{self.api_version.strip('/')}"
        return f"{base}/{path.lstrip('/')}"

    def _redact_access_token(self, value: str) -> str:
        return value.replace(self.access_token, "[redacted]") if self.access_token else value

    def _request(
        self,
        method: str,
        path: str,
        *,
        data: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if self.simulate:
            raise SupabaseError("Live Graph API requests are disabled in simulation mode")
        request_params = dict(params or {})
        if method.upper() == "GET":
            request_params["access_token"] = self.access_token
        response = self.transport.request(
            method=method.upper(),
            url=self._endpoint(path),
            data=data,
            params=request_params or None,
            timeout=self.timeout_seconds,
        )
        if response.status_code >= 400:
            raise SupabaseError(f"Instagram Graph API request failed ({response.status_code}): {self._redact_access_token(response.text)}")
        if not response.content:
            return {}
        return response.json()

    def _request_raw(
        self,
        method: str,
        path: str,
        *,
        data: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> requests.Response:
        if self.simulate:
            raise SupabaseError("Live Graph API requests are disabled in simulation mode")
        request_params = dict(params or {})
        if method.upper() == "GET":
            request_params["access_token"] = self.access_token
        return self.transport.request(
            method=method.upper(),
            url=self._endpoint(path),
            data=data,
            params=request_params or None,
            timeout=self.timeout_seconds,
        )

    def _json_or_error(self, response: requests.Response, context: str) -> dict[str, Any]:
        if response.status_code >= 400:
            raise SupabaseError(f"{context} ({response.status_code}): {self._redact_access_token(response.text)}")
        if not response.content:
            return {}
        return response.json()

    def create_media_container(self, payload: dict[str, Any], *, request_payload_safe: dict[str, Any]) -> InstagramContainerResponse:
        if self.simulate:
            container_id = f"sim-container-{uuid4().hex}"
            created_at = _utcnow().isoformat()
            self._simulated_containers[container_id] = _SimulatedContainerState(
                request_payload=dict(payload),
                request_payload_safe=dict(request_payload_safe),
                created_at=created_at,
            )
            return InstagramContainerResponse(
                container_id=container_id,
                response_payload={"id": container_id},
                created_at=created_at,
                request_payload_safe=dict(request_payload_safe),
                status="created",
            )
        response = self._request(
            "POST",
            f"{self.ig_user_id}/media",
            data=payload,
        )
        container_id = str(response.get("id") or "")
        if not container_id:
            raise SupabaseError("Instagram Graph API did not return a media container id")
        return InstagramContainerResponse(
            container_id=container_id,
            response_payload=response,
            created_at=_utcnow().isoformat(),
            request_payload_safe=dict(request_payload_safe),
            status=str(response.get("status") or "created"),
        )

    def get_container_status(self, container_id: str) -> dict[str, Any]:
        if self.simulate:
            container = self._simulated_containers.get(container_id)
            if container is None:
                return {"id": container_id, "status_code": "UNKNOWN"}
            container.polls += 1
            if container.status == "IN_PROGRESS" and container.polls >= 2:
                container.status = "FINISHED"
            return {"id": container_id, "status_code": container.status}
        response = self._request(
            "GET",
            container_id,
            params={"fields": "status_code"},
        )
        return response

    def publish_media(self, container_id: str) -> InstagramPublishResponse:
        if self.simulate:
            container = self._simulated_containers.get(container_id)
            if container is None:
                raise SupabaseError(f"Unknown simulated container: {container_id}")
            if container.published_media_id:
                published_at = _utcnow().isoformat()
                return InstagramPublishResponse(
                    published_media_id=container.published_media_id,
                    response_payload={"id": container.published_media_id, "duplicate": True},
                    published_at=published_at,
                    status="published",
                )
            published_media_id = f"sim-media-{uuid4().hex}"
            published_at = _utcnow().isoformat()
            container.published_media_id = published_media_id
            container.permalink = f"https://instagram.com/p/{published_media_id[:11]}/"
            container.media_details = {
                "id": published_media_id,
                "permalink": container.permalink,
                "timestamp": published_at,
                "media_type": "REELS" if container.request_payload.get("media_type") == "REELS" else "IMAGE",
                "media_url": container.request_payload.get("video_url") or container.request_payload.get("image_url"),
                "caption": container.request_payload.get("caption"),
            }
            self._simulated_media[published_media_id] = dict(container.media_details)
            return InstagramPublishResponse(
                published_media_id=published_media_id,
                response_payload={"id": published_media_id},
                published_at=published_at,
                status="published",
            )
        response = self._request(
            "POST",
            f"{self.ig_user_id}/media_publish",
            data={"creation_id": container_id, "access_token": self.access_token},
        )
        published_media_id = str(response.get("id") or "")
        if not published_media_id:
            raise SupabaseError("Instagram Graph API did not return a published media id")
        return InstagramPublishResponse(
            published_media_id=published_media_id,
            response_payload=response,
            published_at=_utcnow().isoformat(),
            status=str(response.get("status") or "published"),
        )

    def get_media_details(self, media_id: str) -> dict[str, Any]:
        if self.simulate:
            details = self._simulated_media.get(media_id)
            if details is not None:
                return dict(details)
            return {
                "id": media_id,
                "permalink": f"https://instagram.com/p/{media_id[:11]}/",
                "timestamp": _utcnow().isoformat(),
                "media_type": "IMAGE",
                "media_url": None,
                "caption": None,
            }
        response = self._request(
            "GET",
            media_id,
            params={"fields": "id,permalink,timestamp,media_type,media_url,caption"},
        )
        return response

    def get_media_metrics(self, media_id: str) -> dict[str, Any]:
        if self.simulate:
            return {
                "id": media_id,
                "like_count": 12,
                "comments_count": 2,
                "saved": 1,
                "shares": 1,
                "reach": 250,
                "impressions": 310,
                "requested_insight_metrics": ["reach", "impressions", "saved", "shares"],
                "returned_insight_metrics": ["reach", "impressions", "saved", "shares"],
                "missing_insight_metrics": [],
                "source": "simulated",
            }
        details_response = self._request_raw(
            "GET",
            media_id,
            params={"fields": "id,caption,like_count,comments_count,permalink,timestamp,media_type"},
        )
        details = self._json_or_error(details_response, "Instagram Graph API media details failed")
        metrics = dict(details)
        media_type = str(details.get("media_type") or "").upper()
        if media_type in {"REELS", "VIDEO"}:
            requested_metrics = ["reach", "plays", "saved", "shares", "total_interactions"]
        else:
            requested_metrics = ["reach", "impressions", "saved", "shares"]
        returned_metrics: list[str] = []
        missing_metrics: list[str] = []
        insight_errors: dict[str, str] = {}
        for metric_name in requested_metrics:
            insights_response = self._request_raw(
                "GET",
                f"{media_id}/insights",
                params={"metric": metric_name},
            )
            if insights_response.status_code >= 400:
                missing_metrics.append(metric_name)
                insight_errors[metric_name] = self._redact_access_token(insights_response.text)
                continue
            insights_payload = insights_response.json() if insights_response.content else {}
            metric_returned = False
            for item in insights_payload.get("data", []) if isinstance(insights_payload, dict) else []:
                if not isinstance(item, dict):
                    continue
                name = item.get("name")
                values = item.get("values")
                if not isinstance(name, str) or not isinstance(values, list) or not values:
                    continue
                first_value = values[0] if isinstance(values[0], dict) else {}
                metrics[name] = first_value.get("value")
                returned_metrics.append(name)
                metric_returned = True
            if not metric_returned:
                missing_metrics.append(metric_name)
        metrics["requested_insight_metrics"] = requested_metrics
        metrics["returned_insight_metrics"] = sorted(set(returned_metrics))
        metrics["missing_insight_metrics"] = sorted(set(missing_metrics))
        if insight_errors:
            metrics["insight_errors"] = insight_errors
        return metrics

    def get_me(self, *, fields: str = "id,name") -> dict[str, Any]:
        if self.simulate:
            return {"id": "sim-user", "name": "Simulated User"}
        return self._request("GET", "me", params={"fields": fields})

    def get_me_accounts(self, *, fields: str = "id,name,instagram_business_account{id,username}", limit: int = 100) -> dict[str, Any]:
        if self.simulate:
            return {"data": []}
        return self._request("GET", "me/accounts", params={"fields": fields, "limit": limit})

    def get_recent_media(self, *, limit: int = 25) -> list[dict[str, Any]]:
        if self.simulate:
            return list(self._simulated_media.values())[:limit]
        response = self._request(
            "GET",
            f"{self.ig_user_id}/media",
            params={"fields": "id,caption,permalink,timestamp,media_type", "limit": limit},
        )
        data = response.get("data")
        return list(data) if isinstance(data, list) else []

    def get_media_details_safe(self, media_id: str) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        if self.simulate:
            return self.get_media_details(media_id), None
        response = self._request_raw(
            "GET",
            media_id,
            params={"fields": "id,permalink,timestamp,media_type,media_url,caption"},
        )
        if response.status_code >= 400:
            error_payload = None
            if response.content:
                try:
                    error_payload = response.json()
                except json.JSONDecodeError:
                    error_payload = {"raw_text": self._redact_access_token(response.text)}
            return None, {
                "status_code": response.status_code,
                "error": error_payload if error_payload is not None else {"raw_text": self._redact_access_token(response.text)},
            }
        return response.json() if response.content else {}, None
