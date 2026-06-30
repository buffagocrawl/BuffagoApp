from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
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

    def _request(self, method: str, path: str, *, data: dict[str, Any] | None = None) -> dict[str, Any]:
        if self.simulate:
            raise SupabaseError("Live Graph API requests are disabled in simulation mode")
        response = self.transport.request(
            method=method.upper(),
            url=self._endpoint(path),
            data=data,
            params={"access_token": self.access_token} if method.upper() == "GET" else None,
            timeout=self.timeout_seconds,
        )
        if response.status_code >= 400:
            raise SupabaseError(f"Instagram Graph API request failed ({response.status_code}): {response.text}")
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
                "media_type": "IMAGE",
                "media_url": container.request_payload.get("image_url"),
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
        )
        return response
