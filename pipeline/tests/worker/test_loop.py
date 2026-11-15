"""The worker loop with fakes: outcomes, error codes, leases, shutdown and rule 8 cleanup."""

from __future__ import annotations

import io
import json
import threading
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from isai.errors import DecodeError, ModelMissingError, SilentAudioError, TooLongError
from isai.schema import load_json, schema_dir
from isai.worker.analyser import Analysis, Cancelled
from isai.worker.errors import JobError
from isai.worker.fakes import FakeJobQueue, FakeObjectStore
from isai.worker.loop import Outcome, Worker, WorkerConfig
from isai.worker.ports import SONGS, UPLOADS, Job
from isai.worker.repository import StoreSongRepository

SONG: dict[str, Any] = load_json(schema_dir() / "examples" / "twinkle-g-major.json")


def job(n: int = 1, source_type: str = "full-mix") -> Job:
    return Job(
        job_id=f"job-{n}",
        song_id=f"song-{n}",
        owner_id="user-1",
        upload_path=f"user-1/job-{n}.mp3",
        attempts=1,
        title="A private title",
        source_type=source_type,
        level="medium",
    )


class FakeAnalyser:
    """Reports two stages, then does what `behaviour` says."""

    def __init__(self, behaviour: Callable[[Callable[[], bool]], None] | None = None) -> None:
        self.behaviour = behaviour
        self.audio: list[bytes] = []
        self.work: list[Path] = []

    def analyse(
        self,
        audio: Path,
        job: Job,
        work: Path,
        on_stage: Callable[[str, float], None],
        cancelled: Callable[[], bool],
        timeout_sec: float,
    ) -> Analysis:
        self.audio.append(audio.read_bytes())
        self.work.append(work)
        (work / "cache").mkdir()
        (work / "cache" / "stem.wav").write_bytes(b"stem audio")
        on_stage("ingest", 0.5)
        on_stage("separate", 2.0)
        if self.behaviour is not None:
            self.behaviour(cancelled)
        return Analysis(song=SONG, midi=b"MThd")


def raises(error: BaseException) -> Callable[[Callable[[], bool]], None]:
    def behaviour(_cancelled: Callable[[], bool]) -> None:
        raise error

    return behaviour


def waits_until_cancelled(
    started: threading.Event | None = None,
) -> Callable[[Callable[[], bool]], None]:
    def behaviour(cancelled: Callable[[], bool]) -> None:
        if started is not None:
            started.set()
        for _ in range(500):
            if cancelled():
                raise Cancelled
            time.sleep(0.01)
        raise AssertionError("never cancelled")

    return behaviour


def make(
    tmp_path: Path, analyser: FakeAnalyser, jobs: list[Job] | None = None, **config: Any
) -> tuple[Worker, FakeJobQueue, FakeObjectStore, io.StringIO]:
    queue = FakeJobQueue(jobs if jobs is not None else [job()])
    store = FakeObjectStore()
    for j in queue.rows.values():
        store.put(UPLOADS, j.job.upload_path, b"song audio")
    temp = tmp_path / "temp"
    temp.mkdir()
    log = io.StringIO()
    settings: dict[str, Any] = {"renew_every": 0.01, "temp_root": temp, **config}
    worker = Worker(
        queue, store, StoreSongRepository(store), analyser, WorkerConfig("w1", **settings), log=log
    )
    return worker, queue, store, log


def test_a_job_succeeds_and_leaves_no_audio(tmp_path: Path) -> None:
    analyser = FakeAnalyser()
    worker, queue, store, log = make(tmp_path, analyser)
    assert worker.run(once=True) == 1
    row = queue.row("job-1")
    assert row.status == "succeeded"
    assert analyser.audio == [b"song audio"]
    assert row.summary is not None
    assert row.summary.key == SONG["tonality"]["key"]
    assert row.summary.song_path == "user-1/song-1.song.json"
    assert json.loads(store.objects[(SONGS, "user-1/song-1.song.json")][0]) == SONG
    assert store.objects[(SONGS, "user-1/song-1.mid")][0] == b"MThd"
    # Rule 8: the upload, the temp folder, the stems and the cache are gone.
    assert not store.has(UPLOADS, "user-1/job-1.mp3")
    assert list((tmp_path / "temp").iterdir()) == []
    assert queue.stages == ["download", "ingest", "separate", "save"]
    assert row.timings["separate"] == 2.0 and "download" in row.timings
    line = json.loads(log.getvalue().splitlines()[-1])
    assert line["outcome"] == "succeeded"


def test_logs_never_name_the_song_or_file(tmp_path: Path) -> None:
    worker, *_, log = make(tmp_path, FakeAnalyser(raises(DecodeError("bad file user-1/job-1.mp3"))))
    worker.run(once=True)
    text = log.getvalue()
    assert "A private title" not in text
    assert "job-1.mp3" not in text


@pytest.mark.parametrize(
    ("error", "code"),
    [
        (DecodeError("x"), "decode_failed"),
        (TooLongError("x"), "too_long"),
        (SilentAudioError("x"), "silent"),
        (ModelMissingError("x"), "model_failed"),
        (JobError("timeout", "analysis passed 1200 s"), "timeout"),
        (RuntimeError("boom"), "internal"),
    ],
)
def test_each_failure_has_its_code_and_cleans_up(
    tmp_path: Path, error: Exception, code: str
) -> None:
    worker, queue, store, _ = make(tmp_path, FakeAnalyser(raises(error)))
    worker.run(once=True)
    row = queue.row("job-1")
    assert (row.status, row.error_code) == ("failed", code)
    assert not store.has(UPLOADS, "user-1/job-1.mp3")
    assert not any(b == SONGS for b, _ in store.objects)
    assert list((tmp_path / "temp").iterdir()) == []


def test_an_internal_error_message_is_only_its_type(tmp_path: Path) -> None:
    worker, queue, *_ = make(tmp_path, FakeAnalyser(raises(RuntimeError("secret detail"))))
    worker.run(once=True)
    assert queue.row("job-1").error_message == "RuntimeError"


def test_an_unsupported_type_fails_before_downloading(tmp_path: Path) -> None:
    analyser = FakeAnalyser()
    worker, queue, store, _ = make(tmp_path, analyser, [job(source_type="carnatic")])
    worker.run(once=True)
    assert queue.row("job-1").error_code == "unsupported_type"
    assert analyser.audio == []
    assert not store.has(UPLOADS, "user-1/job-1.mp3")


def test_a_missing_upload_is_upload_expired(tmp_path: Path) -> None:
    worker, queue, store, _ = make(tmp_path, FakeAnalyser())
    store.delete(UPLOADS, ["user-1/job-1.mp3"])
    worker.run(once=True)
    assert queue.row("job-1").error_code == "upload_expired"


def test_the_lease_is_renewed_while_analysing(tmp_path: Path) -> None:
    worker, queue, *_ = make(tmp_path, FakeAnalyser(lambda _c: time.sleep(0.1)))
    worker.run(once=True)
    assert queue.row("job-1").renewals >= 2


def test_a_lost_lease_stops_the_job_and_keeps_the_upload(tmp_path: Path) -> None:
    worker, queue, store, _ = make(tmp_path, FakeAnalyser(waits_until_cancelled()))
    queue.lose_lease = True
    outcome = worker.process(queue.claim("w1", 60) or job())
    assert outcome is Outcome.LEASE_LOST
    assert queue.row("job-1").status == "running"  # not ours to fail: another worker has it
    assert store.has(UPLOADS, "user-1/job-1.mp3")  # the next attempt needs it
    assert list((tmp_path / "temp").iterdir()) == []


def test_finishing_after_the_lease_was_lost_removes_the_saved_song(tmp_path: Path) -> None:
    worker, queue, store, _ = make(tmp_path, FakeAnalyser())
    claimed = queue.claim("w1", 60)
    assert claimed is not None
    queue.row("job-1").worker_id = "w2"  # requeued and taken by another worker meanwhile
    assert worker.process(claimed) is Outcome.LEASE_LOST
    assert not any(b == SONGS for b, _ in store.objects)


def test_a_second_ctrl_c_releases_the_job(tmp_path: Path) -> None:
    started = threading.Event()
    worker, queue, store, _ = make(tmp_path, FakeAnalyser(waits_until_cancelled(started)))
    threading.Thread(target=lambda: (started.wait(5), worker.abort.set())).start()
    assert worker.process(queue.claim("w1", 60) or job()) is Outcome.RELEASED
    assert queue.row("job-1").status == "queued"
    assert store.has(UPLOADS, "user-1/job-1.mp3")
    assert list((tmp_path / "temp").iterdir()) == []


def test_stop_finishes_the_current_job_then_exits(tmp_path: Path) -> None:
    started = threading.Event()

    def slow(_cancelled: Callable[[], bool]) -> None:
        started.set()
        time.sleep(0.1)

    worker, queue, *_ = make(tmp_path, FakeAnalyser(slow), [job(1), job(2)])
    threading.Thread(target=lambda: (started.wait(5), worker.stop.set())).start()
    assert worker.run() == 1
    assert queue.row("job-1").status == "succeeded"
    assert queue.row("job-2").status == "queued"


def test_once_with_an_empty_queue_does_nothing(tmp_path: Path) -> None:
    worker, *_ = make(tmp_path, FakeAnalyser(), [])
    assert worker.run(once=True) == 0


def test_the_loop_survives_a_failing_claim(tmp_path: Path) -> None:
    worker, queue, _, log = make(tmp_path, FakeAnalyser(), poll_every=0.01)
    calls = {"n": 0}
    real = queue.claim

    def flaky(worker_id: str, lease_sec: int) -> Job | None:
        calls["n"] += 1
        if calls["n"] == 1:
            raise ConnectionError("offline")
        found = real(worker_id, lease_sec)
        if found is None:
            worker.stop.set()
        return found

    queue.claim = flaky  # type: ignore[method-assign]
    assert worker.run() == 1
    assert "claim_failed" in log.getvalue()


def test_sweep_deletes_uploads_older_than_a_day(tmp_path: Path) -> None:
    """The crash path: a worker died mid-job, so nothing deleted its upload."""
    now = datetime(2026, 11, 15, 12, 0, tzinfo=UTC)
    worker, _, store, _ = make(tmp_path, FakeAnalyser(), [])
    worker.now = lambda: now
    store.put(UPLOADS, "u/old.mp3", b"a", now - timedelta(hours=25))
    store.put(UPLOADS, "u/new.mp3", b"b", now - timedelta(hours=1))
    store.put(SONGS, "u/s.song.json", b"{}", now - timedelta(days=30))
    assert worker.sweep() == ["u/old.mp3"]
    assert not store.has(UPLOADS, "u/old.mp3")
    assert store.has(UPLOADS, "u/new.mp3")
    assert store.has(SONGS, "u/s.song.json")


def test_run_sweeps_at_start(tmp_path: Path) -> None:
    worker, _, store, _ = make(tmp_path, FakeAnalyser(), [])
    store.put(UPLOADS, "u/old.mp3", b"a", datetime.now(UTC) - timedelta(days=2))
    worker.run(once=True)
    assert not store.has(UPLOADS, "u/old.mp3")


def test_the_worker_beats_while_it_runs_and_names_its_job(tmp_path: Path) -> None:
    worker, queue, *_ = make(
        tmp_path, FakeAnalyser(lambda _c: time.sleep(0.15)), heartbeat_every=0.02
    )
    worker.run(once=True)
    assert queue.beats[0][0] == "w1"
    assert ("w1", queue.beats[0][1], "job-1") in queue.beats  # a beat during the job
    assert queue.beats[-1][2] in (None, "job-1")


def test_a_failing_heartbeat_does_not_stop_the_worker(tmp_path: Path) -> None:
    worker, queue, _, log = make(tmp_path, FakeAnalyser())

    def down(worker_id: str, version: str, job_id: str | None) -> None:
        raise ConnectionError("offline")

    queue.heartbeat = down  # type: ignore[method-assign]
    assert worker.run(once=True) == 1
    assert "heartbeat_failed" in log.getvalue()
