from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Iterable
from urllib.parse import quote

import requests


class SupabaseError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class SupabaseConfig:
    url: str
    service_role_key: str
    schema: str = "public"
    timeout_seconds: int = 30


class SupabaseClient:
    def __init__(self, config: SupabaseConfig) -> None:
        self.config = config
        self._session = requests.Session()
        self._session.headers.update(
            {
                "apikey": config.service_role_key,
                "Authorization": f"Bearer {config.service_role_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Prefer": "return=representation",
            }
        )

    @classmethod
    def from_env(cls) -> "SupabaseClient":
        url = os.getenv("SUPABASE_URL", "").strip()
        service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not url or not service_role_key:
            raise SupabaseError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        return cls(SupabaseConfig(url=url, service_role_key=service_role_key))

    def _endpoint(self, path: str) -> str:
        return f"{self.config.url.rstrip('/')}/rest/v1/{path.lstrip('/')}"

    def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_payload: dict[str, Any] | list[dict[str, Any]] | None = None,
    ) -> Any:
        response = self._session.request(
            method=method.upper(),
            url=self._endpoint(path),
            params=params,
            json=json_payload,
            timeout=self.config.timeout_seconds,
            headers={"Content-Profile": self.config.schema, "Accept-Profile": self.config.schema},
        )
        if response.status_code >= 400:
            raise SupabaseError(f"Supabase request failed ({response.status_code}): {response.text}")
        if not response.content:
            return None
        return response.json()

    def table_exists(self, table_name: str) -> bool:
        try:
            self.request("GET", quote(table_name), params={"select": "id", "limit": 1})
        except SupabaseError:
            return False
        return True

    def table_columns(self, table_name: str) -> set[str]:
        try:
            self.request("GET", quote(table_name), params={"select": "*", "limit": 0})
        except SupabaseError as exc:
            raise SupabaseError(f"Unable to inspect columns for {table_name}: {exc}") from exc
        return set(self._schema_columns(table_name))

    def _schema_columns(self, table_name: str) -> list[str]:
        response = self._session.request(
            method="GET",
            url=self._endpoint(""),
            timeout=self.config.timeout_seconds,
            headers={
                "apikey": self.config.service_role_key,
                "Authorization": f"Bearer {self.config.service_role_key}",
                "Accept": "application/openapi+json",
                "Accept-Profile": self.config.schema,
            },
        )
        if response.status_code >= 400:
            raise SupabaseError(f"Supabase schema request failed ({response.status_code}): {response.text}")
        payload = response.json()
        definitions = payload.get("definitions") if isinstance(payload, dict) else None
        if not isinstance(definitions, dict):
            components = payload.get("components") if isinstance(payload, dict) else None
            definitions = components.get("schemas") if isinstance(components, dict) else None
        table_definition = definitions.get(table_name) if isinstance(definitions, dict) else None
        properties = table_definition.get("properties") if isinstance(table_definition, dict) else None
        if not isinstance(properties, dict):
            raise SupabaseError(f"Supabase schema did not include table {table_name}")
        return list(properties.keys())

    def fetch_rows(self, table_name: str, *, filters: dict[str, Any] | None = None, select: str = "*") -> list[dict[str, Any]]:
        params: dict[str, Any] = {"select": select}
        if filters:
            params.update(filters)
        result = self.request("GET", quote(table_name), params=params)
        return result or []

    def insert_row(self, table_name: str, payload: dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, Any]]:
        result = self.request("POST", quote(table_name), json_payload=payload)
        return result or []

    def update_rows(self, table_name: str, filters: dict[str, Any], payload: dict[str, Any]) -> list[dict[str, Any]]:
        params = dict(filters)
        result = self.request("PATCH", quote(table_name), params=params, json_payload=payload)
        return result or []

    def _storage_endpoint(self, path: str) -> str:
        return f"{self.config.url.rstrip('/')}/storage/v1/{path.lstrip('/')}"

    def storage_bucket_exists(self, bucket: str) -> bool:
        response = self._session.get(
            self._storage_endpoint(f"bucket/{quote(bucket)}"),
            headers={
                "apikey": self.config.service_role_key,
                "Authorization": f"Bearer {self.config.service_role_key}",
                "Accept": "application/json",
            },
            timeout=self.config.timeout_seconds,
        )
        return response.status_code == 200

    def storage_public_url(self, bucket: str, storage_path: str) -> str:
        return f"{self.config.url.rstrip('/')}/storage/v1/object/public/{quote(bucket)}/{quote(storage_path, safe='/')}"

    def upload_storage_object(
        self,
        bucket: str,
        storage_path: str,
        *,
        data: bytes,
        content_type: str,
    ) -> dict[str, Any]:
        response = self._session.put(
            self._storage_endpoint(f"object/{quote(bucket)}/{quote(storage_path, safe='/')}"),
            headers={
                "apikey": self.config.service_role_key,
                "Authorization": f"Bearer {self.config.service_role_key}",
                "Content-Type": content_type,
                "x-upsert": "false",
            },
            data=data,
            timeout=self.config.timeout_seconds,
        )
        if response.status_code >= 400:
            raise SupabaseError(f"Supabase storage upload failed ({response.status_code}): {response.text}")
        if not response.content:
            return {}
        return response.json()

    def upsert_rows(self, table_name: str, payload: dict[str, Any] | list[dict[str, Any]], *, on_conflict: str) -> list[dict[str, Any]]:
        headers = {"Prefer": f"resolution=merge-duplicates,return=representation", "On-Conflict": on_conflict}
        response = self._session.request(
            method="POST",
            url=self._endpoint(quote(table_name)),
            params={"on_conflict": on_conflict},
            json=payload,
            timeout=self.config.timeout_seconds,
            headers={
                "apikey": self.config.service_role_key,
                "Authorization": f"Bearer {self.config.service_role_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Content-Profile": self.config.schema,
                "Accept-Profile": self.config.schema,
                **headers,
            },
        )
        if response.status_code >= 400:
            raise SupabaseError(f"Supabase request failed ({response.status_code}): {response.text}")
        return response.json() if response.content else []

    def health_check(self, table_name: str = "jalapeno_settings") -> bool:
        self.fetch_rows(table_name, select="id", filters={"limit": 1})
        return True

    def setting_values(self, setting_keys: Iterable[str]) -> dict[str, dict[str, Any]]:
        keys = set(setting_keys)
        if not keys:
            return {}
        rows = self.fetch_rows("jalapeno_settings", select="setting_key,setting_value,is_enabled,is_secret")
        return {row["setting_key"]: row for row in rows if row.get("setting_key") in keys}
