"""The worker loop: claim a job, analyse its upload, store the Song, and always clean up.

Rule 8: when a job ends, succeeded or failed, its upload object and its temp folder (the
audio, the stems and the stage cache) are deleted. Two cases keep the upload because the
job isn't over: the worker releasing it on shutdown, and a lost lease (another worker has
the job now). The 24 h sweep catches whatever a crash leaves behind.
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Any, TextIO

from isai import __version__
from isai.pipeline import SUPPORTED_TYPES
from isai.worker.analyser import Analyser, Cancelled
from isai.worker.errors import JobError, code_for_exception
from isai.worker.ports import UPLOADS, Job, JobQueue, ObjectStore, SongRepository, Summary


@dataclass
class WorkerConfig:
    worker_id: str
    lease_sec: int = 120
    renew_every: float = 30.0
    job_timeout: float = 20 * 60.0
    poll_every: float = 5.0
    heartbeat_every: float = 30.0
    sweep_every: float = 10 * 60.0
    upload_max_age: timedelta = field(default_factory=lambda: timedelta(hours=24))
    temp_root: Path | None = None


class Outcome(Enum):
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    RELEASED = "released"
    LEASE_LOST = "lease_lost"


class Worker:
    def __init__(
        self,
        queue: JobQueue,
        store: ObjectStore,
        songs: SongRepository,
        analyser: Analyser,
        config: WorkerConfig,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
        log: TextIO | None = None,
    ) -> None:
        self.queue = queue
        self.store = store
        self.songs = songs
        self.analyser = analyser
        self.config = config
        self.now = now
        self.log_stream = log if log is not None else sys.stderr
        self.stop = threading.Event()
        """Finish the current job, then stop (the first Ctrl+C)."""
        self.abort = threading.Event()
        """Let the current job go back to the queue now (the second Ctrl+C)."""
        self._lock = threading.Lock()
        self._current: str | None = None
        """The job being processed, for the heartbeat."""

    def log(self, event: str, **fields: Any) -> None:
        """One JSON line. Never file names, titles or audio details (architecture §9)."""
        line = {"event": event, "worker": self.config.worker_id, **fields}
        self.log_stream.write(json.dumps(line) + "\n")
        self.log_stream.flush()

    # -- one job ---------------------------------------------------------------------------

    def process(self, job: Job) -> Outcome:
        wid = self.config.worker_id
        started = time.monotonic()
        work = Path(tempfile.mkdtemp(prefix="isai-job-", dir=self.config.temp_root))
        done = threading.Event()
        lease_lost = threading.Event()
        timings: dict[str, float] = {}

        def renew() -> None:
            while not done.wait(self.config.renew_every):
                try:
                    with self._lock:
                        kept = self.queue.renew(job.job_id, wid, self.config.lease_sec)
                except Exception:
                    continue  # a network blip: try again next round; the lease has slack
                if not kept:
                    lease_lost.set()
                    return

        def stage(name: str, seconds: float | None = None) -> None:
            if seconds is not None:
                timings[name] = round(seconds, 3)
            with self._lock:
                self.queue.set_stage(job.job_id, wid, name, timings)

        def cancelled() -> bool:
            return lease_lost.is_set() or self.abort.is_set()

        renewer = threading.Thread(target=renew, daemon=True)
        renewer.start()
        self._current = job.job_id
        outcome = Outcome.FAILED
        code: str | None = None
        try:
            if job.source_type not in SUPPORTED_TYPES:
                raise JobError("unsupported_type", f"source type {job.source_type}")
            stage("download")
            audio = work / f"input{Path(job.upload_path).suffix.lower()}"
            t0 = time.monotonic()
            try:
                self.store.download(UPLOADS, job.upload_path, audio)
            except FileNotFoundError as e:
                raise JobError("upload_expired", "upload missing") from e
            timings["download"] = round(time.monotonic() - t0, 3)
            analysis = self.analyser.analyse(
                audio, job, work, stage, cancelled, self.config.job_timeout
            )
            if cancelled():
                raise Cancelled
            stage("save")
            paths = self.songs.save(job.owner_id, job.song_id, analysis.song, analysis.midi)
            summary = Summary.from_song(analysis.song, *paths)
            with self._lock:
                finished = self.queue.finish(job.job_id, wid, summary)
            if finished:
                outcome = Outcome.SUCCEEDED
            else:
                self.songs.delete(list(paths))
                outcome = Outcome.LEASE_LOST
        except Cancelled:
            if lease_lost.is_set():
                outcome = Outcome.LEASE_LOST
            else:
                with self._lock:
                    self.queue.release(job.job_id, wid)
                outcome = Outcome.RELEASED
        except Exception as e:
            code = code_for_exception(e)
            message = str(e) if isinstance(e, JobError) else type(e).__name__
            if lease_lost.is_set():
                outcome = Outcome.LEASE_LOST
            else:
                try:
                    with self._lock:
                        self.queue.fail(job.job_id, wid, code, message)
                except Exception:
                    pass  # the lease will expire and requeue_expired takes over
                outcome = Outcome.FAILED
        finally:
            self._current = None
            done.set()
            renewer.join(timeout=5)
            if outcome in (Outcome.SUCCEEDED, Outcome.FAILED):
                self._delete_upload(job)
            shutil.rmtree(work, ignore_errors=True)
        self.log(
            "job",
            job=job.job_id,
            attempt=job.attempts,
            type=job.source_type,
            outcome=outcome.value,
            code=code,
            seconds=round(time.monotonic() - started, 1),
            stages=timings,
        )
        return outcome

    def _delete_upload(self, job: Job) -> None:
        try:
            self.store.delete(UPLOADS, [job.upload_path])
        except Exception as e:  # the 24 h sweep deletes it later
            self.log("upload_delete_failed", job=job.job_id, error=type(e).__name__)

    # -- the queue -------------------------------------------------------------------------

    def sweep(self) -> list[str]:
        """Delete upload objects older than the limit (rule 8's safety net)."""
        cutoff = self.now() - self.config.upload_max_age
        old = [o.path for o in self.store.list_all(UPLOADS) if o.created_at < cutoff]
        for i in range(0, len(old), 100):
            self.store.delete(UPLOADS, old[i : i + 100])
        if old:
            self.log("sweep", deleted=len(old))
        return old

    def beat(self) -> None:
        try:
            with self._lock:
                self.queue.heartbeat(self.config.worker_id, __version__, self._current)
        except Exception as e:  # offline for a moment: the next beat tries again
            self.log("heartbeat_failed", error=type(e).__name__)

    def run(self, once: bool = False) -> int:
        """Process jobs until `stop` is set (or one job with `once`); return how many."""
        finished = threading.Event()

        def heartbeats() -> None:
            self.beat()
            while not finished.wait(self.config.heartbeat_every):
                self.beat()

        beater = threading.Thread(target=heartbeats, daemon=True)
        beater.start()
        try:
            return self._run(once)
        finally:
            finished.set()
            beater.join(timeout=5)

    def _run(self, once: bool) -> int:
        processed = 0
        last_sweep: float | None = None
        while not self.stop.is_set():
            if last_sweep is None or time.monotonic() - last_sweep >= self.config.sweep_every:
                try:
                    self.sweep()
                except Exception as e:
                    self.log("sweep_failed", error=type(e).__name__)
                last_sweep = time.monotonic()
            try:
                job = self.queue.claim(self.config.worker_id, self.config.lease_sec)
            except Exception as e:
                self.log("claim_failed", error=type(e).__name__)
                job = None
                if once:
                    return processed
            if job is None:
                if once:
                    return processed
                self.stop.wait(self.config.poll_every)
                continue
            self.process(job)
            processed += 1
            if once:
                return processed
        return processed
