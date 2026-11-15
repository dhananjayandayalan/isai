"""What the worker needs from the outside world (ADR 0015): a job queue, object storage and a
place for finished Songs. Supabase implements them in `supabase_impl`; tests use `fakes`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Protocol

UPLOADS = "uploads"
SONGS = "songs"


@dataclass(frozen=True)
class Job:
    """A claimed job: what the pipeline needs to analyse one upload."""

    job_id: str
    song_id: str
    owner_id: str
    upload_path: str
    attempts: int
    title: str
    source_type: str
    level: str


@dataclass(frozen=True)
class Summary:
    """The Song's facts copied to the `songs` row for the library list."""

    schema_version: str
    pipeline_version: str
    key: str
    mode: str
    bpm: float
    duration_sec: float
    song_path: str
    midi_path: str

    @staticmethod
    def from_song(song: dict[str, Any], song_path: str, midi_path: str) -> Summary:
        return Summary(
            schema_version=str(song["schemaVersion"]),
            pipeline_version=str(song["meta"]["pipelineVersion"]),
            key=str(song["tonality"]["key"]),
            mode=str(song["tonality"]["mode"]),
            bpm=float(song["tempo"]["bpm"]),
            duration_sec=float(song["durationSec"]),
            song_path=song_path,
            midi_path=midi_path,
        )

    def to_json(self) -> dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "pipelineVersion": self.pipeline_version,
            "key": self.key,
            "mode": self.mode,
            "bpm": self.bpm,
            "durationSec": self.duration_sec,
            "songPath": self.song_path,
            "midiPath": self.midi_path,
        }


class JobQueue(Protocol):
    """The jobs table's RPCs. Every call names the worker; a lost lease returns False."""

    def claim(self, worker_id: str, lease_sec: int) -> Job | None: ...
    def renew(self, job_id: str, worker_id: str, lease_sec: int) -> bool: ...
    def set_stage(
        self, job_id: str, worker_id: str, stage: str, timings: dict[str, float]
    ) -> bool: ...
    def finish(self, job_id: str, worker_id: str, summary: Summary) -> bool: ...
    def fail(self, job_id: str, worker_id: str, code: str, message: str) -> bool: ...
    def release(self, job_id: str, worker_id: str) -> bool: ...


@dataclass(frozen=True)
class StoredObject:
    path: str
    created_at: datetime


class ObjectStore(Protocol):
    def download(self, bucket: str, path: str, dest: Path) -> None: ...
    def upload(self, bucket: str, path: str, data: bytes, content_type: str) -> None: ...
    def delete(self, bucket: str, paths: list[str]) -> None: ...
    def list_all(self, bucket: str) -> list[StoredObject]: ...


class SongRepository(Protocol):
    def save(
        self, owner_id: str, song_id: str, song: dict[str, Any], midi: bytes
    ) -> tuple[str, str]:
        """Store the Song JSON and MIDI; return their paths in the songs bucket."""
        ...

    def delete(self, paths: list[str]) -> None: ...
