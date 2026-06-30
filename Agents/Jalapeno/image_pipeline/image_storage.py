from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from supabase_client import SupabaseClient, SupabaseError


class ImageStorageError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class ImageUploadResult:
    bucket: str
    storage_path: str
    public_url: str
    uploaded_at: str


class SupabaseImageStorage:
    def __init__(self, client: SupabaseClient) -> None:
        self.client = client

    def bucket_exists(self, bucket: str) -> bool:
        endpoint = f"{self.client.config.url.rstrip('/')}/storage/v1/bucket/{quote(bucket)}"
        response = self.client._session.get(  # pylint: disable=protected-access
            endpoint,
            headers={
                "apikey": self.client.config.service_role_key,
                "Authorization": f"Bearer {self.client.config.service_role_key}",
                "Accept": "application/json",
            },
            timeout=self.client.config.timeout_seconds,
        )
        return response.status_code == 200

    def public_url(self, bucket: str, storage_path: str) -> str:
        return f"{self.client.config.url.rstrip('/')}/storage/v1/object/public/{quote(bucket)}/{quote(storage_path, safe='/')}"

    def upload(self, file_path: Path, *, bucket: str, storage_path: str, content_type: str) -> ImageUploadResult:
        if not self.bucket_exists(bucket):
            raise ImageStorageError(
                f"Supabase Storage bucket '{bucket}' does not exist. Create it before enabling uploads."
            )

        endpoint = f"{self.client.config.url.rstrip('/')}/storage/v1/object/{quote(bucket)}/{quote(storage_path, safe='/')}"
        with file_path.open("rb") as handle:
            response = self.client._session.put(  # pylint: disable=protected-access
                endpoint,
                data=handle.read(),
                headers={
                    "apikey": self.client.config.service_role_key,
                    "Authorization": f"Bearer {self.client.config.service_role_key}",
                    "Content-Type": content_type,
                    "x-upsert": "false",
                },
                timeout=self.client.config.timeout_seconds,
            )
        if response.status_code >= 400:
            raise ImageStorageError(f"Supabase Storage upload failed ({response.status_code}): {response.text}")

        uploaded_at = datetime.now(timezone.utc).isoformat()
        return ImageUploadResult(
            bucket=bucket,
            storage_path=storage_path,
            public_url=self.public_url(bucket, storage_path),
            uploaded_at=uploaded_at,
        )

