"""The worker's ports over Supabase (service role). Nothing else in the pipeline imports
supabase (CLAUDE.md rule 10)."""

from __future__ import annotations

import os
import socket
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, cast

from isai.worker.ports import Job, StoredObject, Summary


@dataclass(frozen=True)
class Settings:
    url: str
    service_key: str
    worker_id: str


class SettingsError(ValueError):
    pass


def read_env_file(path: Path) -> dict[str, str]:
    """KEY=VALUE lines; blank lines and # comments skipped, surrounding quotes removed."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("'\"")
    return values


def load_settings(
    env: Mapping[str, str] | None = None, env_file: Path | None = Path(".env")
) -> Settings:
    """From the environment, falling back to `pipeline/.env` (never committed)."""
    merged = read_env_file(env_file) if env_file is not None else {}
    merged.update(env if env is not None else os.environ)
    url = merged.get("ISAI_SUPABASE_URL", "")
    key = merged.get("ISAI_SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        raise SettingsError(
            "set ISAI_SUPABASE_URL and ISAI_SUPABASE_SERVICE_KEY (see pipeline/.env.example)"
        )
    worker_id = merged.get("ISAI_WORKER_ID") or f"{socket.gethostname()}-{os.getpid()}"
    return Settings(url=url, service_key=key, worker_id=worker_id)


def connect(settings: Settings) -> Any:
    from supabase import create_client

    return create_client(settings.url, settings.service_key)


def _rows(response: Any) -> list[dict[str, Any]]:
    data = response.data
    if isinstance(data, list):
        return cast(list[dict[str, Any]], data)
    return []


class SupabaseJobQueue:
    def __init__(self, client: Any) -> None:
        self.client = client

    def _call(self, name: str, params: dict[str, Any]) -> Any:
        return self.client.rpc(name, params).execute().data

    def claim(self, worker_id: str, lease_sec: int) -> Job | None:
        rows = _rows(
            self.client.rpc(
                "claim_job", {"p_worker_id": worker_id, "p_lease_sec": lease_sec}
            ).execute()
        )
        if not rows:
            return None
        r = rows[0]
        return Job(
            job_id=str(r["job_id"]),
            song_id=str(r["song_id"]),
            owner_id=str(r["owner_id"]),
            upload_path=str(r["upload_path"]),
            attempts=int(r["attempts"]),
            title=str(r["title"]),
            source_type=str(r["source_type"]),
            level=str(r["level"]),
        )

    def renew(self, job_id: str, worker_id: str, lease_sec: int) -> bool:
        params = {"p_job_id": job_id, "p_worker_id": worker_id, "p_lease_sec": lease_sec}
        return bool(self._call("renew_lease", params))

    def set_stage(self, job_id: str, worker_id: str, stage: str, timings: dict[str, float]) -> bool:
        params = {"p_job_id": job_id, "p_worker_id": worker_id, "p_stage": stage,
                  "p_timings": timings}  # fmt: skip
        return bool(self._call("set_stage", params))

    def finish(self, job_id: str, worker_id: str, summary: Summary) -> bool:
        params = {"p_job_id": job_id, "p_worker_id": worker_id, "p_summary": summary.to_json()}
        return bool(self._call("finish_job", params))

    def fail(self, job_id: str, worker_id: str, code: str, message: str) -> bool:
        params = {"p_job_id": job_id, "p_worker_id": worker_id, "p_code": code,
                  "p_message": message}  # fmt: skip
        return bool(self._call("fail_job", params))

    def heartbeat(self, worker_id: str, version: str, job_id: str | None) -> None:
        params = {"p_worker_id": worker_id, "p_version": version, "p_job_id": job_id}
        self.client.rpc("heartbeat", params).execute()

    def release(self, job_id: str, worker_id: str) -> bool:
        return bool(self._call("release_job", {"p_job_id": job_id, "p_worker_id": worker_id}))


def _is_not_found(error: Exception) -> bool:
    text = str(error).lower()
    return "not found" in text or "404" in text


class SupabaseObjectStore:
    def __init__(self, client: Any) -> None:
        self.client = client

    def _bucket(self, bucket: str) -> Any:
        return self.client.storage.from_(bucket)

    def download(self, bucket: str, path: str, dest: Path) -> None:
        try:
            data = self._bucket(bucket).download(path)
        except Exception as e:
            if _is_not_found(e):
                raise FileNotFoundError(f"{bucket}/{path}") from e
            raise
        dest.write_bytes(cast(bytes, data))

    def upload(self, bucket: str, path: str, data: bytes, content_type: str) -> None:
        self._bucket(bucket).upload(path, data, {"content-type": content_type, "upsert": "true"})

    def delete(self, bucket: str, paths: list[str]) -> None:
        if paths:
            self._bucket(bucket).remove(paths)

    def list_all(self, bucket: str) -> list[StoredObject]:
        """Every object, one folder deep (`{user}/{file}`), as uploads are laid out."""
        found: list[StoredObject] = []
        for entry in self._list(bucket, ""):
            name = str(entry.get("name", ""))
            if entry.get("id") is None:  # a folder
                for item in self._list(bucket, name):
                    if item.get("id") is not None:
                        found.append(_stored(f"{name}/{item['name']}", item))
            else:
                found.append(_stored(name, entry))
        return found

    def _list(self, bucket: str, prefix: str) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        offset = 0
        while True:
            page = cast(
                list[dict[str, Any]],
                self._bucket(bucket).list(prefix, {"limit": 1000, "offset": offset}),
            )
            out += page
            if len(page) < 1000:
                return out
            offset += 1000


def _stored(path: str, item: dict[str, Any]) -> StoredObject:
    created = str(item.get("created_at") or "")
    return StoredObject(path, datetime.fromisoformat(created.replace("Z", "+00:00")))
