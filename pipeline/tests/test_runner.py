import io
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pytest

from isai import cache
from isai.errors import DecodeError, ExitCode, PipelineError, SilentAudioError, TooLongError
from isai.runner import Runner


@dataclass
class Beats:
    times: np.ndarray
    bpm: float
    label: str
    meter: list[int]
    note: str | None = None


@dataclass
class Key:
    tonic: int
    confidence: float


class Counter:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def beats(self) -> Beats:
        self.calls.append("beats")
        return Beats(times=np.array([0.0, 0.5, 1.0]), bpm=120.0, label="x", meter=[4, 4])

    def key(self) -> Key:
        self.calls.append("key")
        return Key(tonic=7, confidence=0.25)


def run(
    runner: Runner, counter: Counter, beat_options: dict[str, object] | None = None
) -> tuple[Beats, Key]:
    beats = runner.stage("rhythm", "1", Beats, counter.beats, beat_options)
    key = runner.stage("tonality", "1", Key, counter.key)
    return beats, key


def test_cache_round_trips_arrays_numbers_and_strings(tmp_path: Path) -> None:
    original = Beats(times=np.array([0.1, 1 / 3, 2.0]), bpm=0.1 + 0.2, label="é", meter=[3, 4])
    cache.save(tmp_path / "beats", original)
    loaded = cache.load(tmp_path / "beats", Beats)
    assert loaded is not None
    assert np.array_equal(loaded.times, original.times)
    assert loaded.times.dtype == original.times.dtype
    assert loaded.bpm == original.bpm  # exact, not rounded
    assert (loaded.label, loaded.meter, loaded.note) == ("é", [3, 4], None)


def test_cache_load_ignores_a_missing_or_unfinished_entry(tmp_path: Path) -> None:
    assert cache.load(tmp_path / "nothing", Key) is None
    cache.save(tmp_path / "key", Key(tonic=1, confidence=0.5))
    (tmp_path / "key" / cache.DONE_FILE).unlink()  # a run that died while writing
    assert cache.load(tmp_path / "key", Key) is None


def test_cache_save_wants_a_dataclass(tmp_path: Path) -> None:
    with pytest.raises(TypeError):
        cache.save(tmp_path / "x", {"tonic": 1})
    with pytest.raises(TypeError):
        cache.save(tmp_path / "x", Key)


def test_runner_skips_finished_stages_on_the_second_run(tmp_path: Path) -> None:
    counter = Counter()
    first = run(Runner(audio_hash="abc", cache_root=tmp_path), counter)
    again = Runner(audio_hash="abc", cache_root=tmp_path)
    second = run(again, counter)
    assert counter.calls == ["beats", "key"]
    assert [r.cached for r in again.records] == [True, True]
    assert np.array_equal(first[0].times, second[0].times)
    assert second[1] == first[1]


def test_no_cache_runs_every_stage(tmp_path: Path) -> None:
    counter = Counter()
    run(Runner(audio_hash="abc", cache_root=tmp_path), counter)
    run(Runner(audio_hash="abc", cache_root=None), counter)
    assert counter.calls == ["beats", "key", "beats", "key"]


def test_from_stage_reruns_that_stage_and_everything_after(tmp_path: Path) -> None:
    counter = Counter()
    run(Runner(audio_hash="abc", cache_root=tmp_path), counter)
    counter.calls.clear()
    run(Runner(audio_hash="abc", cache_root=tmp_path, from_stage="tonality"), counter)
    assert counter.calls == ["key"]
    counter.calls.clear()
    run(Runner(audio_hash="abc", cache_root=tmp_path, from_stage="rhythm"), counter)
    assert counter.calls == ["beats", "key"]


def test_a_changed_stage_invalidates_the_stages_after_it_only(tmp_path: Path) -> None:
    counter = Counter()
    run(Runner(audio_hash="abc", cache_root=tmp_path), counter)
    counter.calls.clear()
    # New options for rhythm: rhythm and everything after it run again.
    run(Runner(audio_hash="abc", cache_root=tmp_path), counter, {"tracker": "other"})
    assert counter.calls == ["beats", "key"]
    counter.calls.clear()
    # Another song: nothing is shared.
    run(Runner(audio_hash="def", cache_root=tmp_path), counter)
    assert counter.calls == ["beats", "key"]
    assert sorted(p.name for p in tmp_path.iterdir()) == ["abc", "def"]


def test_a_changed_uncached_step_invalidates_the_stages_after_it(tmp_path: Path) -> None:
    counter = Counter()
    first = Runner(audio_hash="abc", cache_root=tmp_path)
    first.note("ingest", "1", 0.1, {"offset": 0.5})
    run(first, counter)
    same = Runner(audio_hash="abc", cache_root=tmp_path)
    same.note("ingest", "1", 0.1, {"offset": 0.5})
    run(same, counter)
    assert counter.calls == ["beats", "key"]
    for version, options in (("2", {"offset": 0.5}), ("1", {"offset": 0.9})):
        counter.calls.clear()
        changed = Runner(audio_hash="abc", cache_root=tmp_path)
        changed.note("ingest", version, 0.1, options)
        run(changed, counter)
        assert counter.calls == ["beats", "key"]


def test_records_timings_and_logs_json_lines() -> None:
    ticks = iter([0.0, 0.25, 1.0, 1.5])
    stream = io.StringIO()
    runner = Runner(audio_hash="abc", log_json=True, log_stream=stream, clock=lambda: next(ticks))
    run(runner, Counter())
    runner.note("ingest", "1", 0.75)
    assert [(r.name, r.seconds, r.cached) for r in runner.records] == [
        ("rhythm", 0.25, False),
        ("tonality", 0.5, False),
        ("ingest", 0.75, False),
    ]
    lines = [json.loads(line) for line in stream.getvalue().splitlines()]
    assert lines[0] == {
        "event": "stage",
        "stage": "rhythm",
        "version": "1",
        "seconds": 0.25,
        "cached": False,
    }
    assert len(lines) == 3


def test_logs_nothing_without_log_json() -> None:
    stream = io.StringIO()
    run(Runner(audio_hash="abc", log_stream=stream), Counter())
    assert stream.getvalue() == ""


def test_each_failure_names_its_exit_code() -> None:
    assert DecodeError("x").exit_code == ExitCode.DECODE_FAILED == 4
    assert TooLongError("x").exit_code == ExitCode.TOO_LONG == 5
    assert SilentAudioError("x").exit_code == ExitCode.SILENT == 6
    assert isinstance(SilentAudioError("x"), PipelineError)
