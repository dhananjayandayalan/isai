"""In-memory ports for worker tests (and for trying the loop without Supabase)."""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from isai.worker.ports import Job, StoredObject, Summary


@dataclass
class FakeJobRow:
    job: Job
    status: str = "queued"
    worker_id: str | None = None
    stage: str | None = None
    timings: dict[str, float] = field(default_factory=lambda: {})
    error_code: str | None = None
    error_message: str | None = None
    summary: Summary | None = None
    renewals: int = 0


class FakeJobQueue:
    def __init__(self, jobs: list[Job] | None = None) -> None:
        self.rows: dict[str, FakeJobRow] = {}
        self.lock = threading.Lock()
        self.stages: list[str] = []
        self.beats: list[tuple[str, str, str | None]] = []
        self.lose_lease = False
        """Set to make renew() report the lease lost (another worker took the job)."""
        for job in jobs or []:
            self.add(job)

    def add(self, job: Job) -> None:
        self.rows[job.job_id] = FakeJobRow(job)

    def row(self, job_id: str) -> FakeJobRow:
        return self.rows[job_id]

    def _owned(self, job_id: str, worker_id: str) -> FakeJobRow | None:
        row = self.rows.get(job_id)
        if row is None or row.status != "running" or row.worker_id != worker_id:
            return None
        return row

    def claim(self, worker_id: str, lease_sec: int) -> Job | None:
        with self.lock:
            for row in self.rows.values():
                if row.status == "queued":
                    row.status, row.worker_id = "running", worker_id
                    return row.job
        return None

    def renew(self, job_id: str, worker_id: str, lease_sec: int) -> bool:
        with self.lock:
            row = self._owned(job_id, worker_id)
            if row is None or self.lose_lease:
                return False
            row.renewals += 1
            return True

    def set_stage(self, job_id: str, worker_id: str, stage: str, timings: dict[str, float]) -> bool:
        with self.lock:
            row = self._owned(job_id, worker_id)
            if row is None:
                return False
            row.stage, row.timings = stage, dict(timings)
            self.stages.append(stage)
            return True

    def finish(self, job_id: str, worker_id: str, summary: Summary) -> bool:
        with self.lock:
            row = self._owned(job_id, worker_id)
            if row is None:
                return False
            row.status, row.summary = "succeeded", summary
            return True

    def fail(self, job_id: str, worker_id: str, code: str, message: str) -> bool:
        with self.lock:
            row = self._owned(job_id, worker_id)
            if row is None:
                return False
            row.status, row.error_code, row.error_message = "failed", code, message
            return True

    def heartbeat(self, worker_id: str, version: str, job_id: str | None) -> None:
        with self.lock:
            self.beats.append((worker_id, version, job_id))

    def release(self, job_id: str, worker_id: str) -> bool:
        with self.lock:
            row = self._owned(job_id, worker_id)
            if row is None:
                return False
            row.status, row.worker_id, row.stage = "queued", None, None
            return True


class FakeObjectStore:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], tuple[bytes, datetime]] = {}
        self.fail_download = False

    def put(self, bucket: str, path: str, data: bytes, created_at: datetime | None = None) -> None:
        self.objects[(bucket, path)] = (data, created_at or datetime.now(UTC))

    def has(self, bucket: str, path: str) -> bool:
        return (bucket, path) in self.objects

    def download(self, bucket: str, path: str, dest: Path) -> None:
        if self.fail_download or (bucket, path) not in self.objects:
            raise FileNotFoundError(f"{bucket}/{path}")
        dest.write_bytes(self.objects[(bucket, path)][0])

    def upload(self, bucket: str, path: str, data: bytes, content_type: str) -> None:
        self.put(bucket, path, data)

    def delete(self, bucket: str, paths: list[str]) -> None:
        for path in paths:
            self.objects.pop((bucket, path), None)

    def list_all(self, bucket: str) -> list[StoredObject]:
        return [
            StoredObject(p, created) for (b, p), (_, created) in self.objects.items() if b == bucket
        ]
