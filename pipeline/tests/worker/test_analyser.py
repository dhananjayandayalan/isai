"""SubprocessAnalyser against a stand-in for `isai analyse` (no models, no audio)."""

from __future__ import annotations

import sys
import textwrap
from collections.abc import Callable
from pathlib import Path

import pytest

from isai.worker.analyser import Analysis, Cancelled, SubprocessAnalyser
from isai.worker.errors import JobError
from isai.worker.ports import Job

STUB = textwrap.dedent(
    """
    import json, sys, time, pathlib
    args = sys.argv[1:]
    out = pathlib.Path(args[args.index("--out") + 1])
    audio = pathlib.Path(args[1])
    mode = audio.read_text()
    print("isai: plain message naming " + str(audio), file=sys.stderr)
    print(json.dumps({"event": "stage", "stage": "ingest", "seconds": 0.25}), file=sys.stderr)
    sys.stderr.flush()
    if mode.startswith("exit"):
        sys.exit(int(mode[4:]))
    if mode == "hang":
        time.sleep(60)
    out.mkdir(parents=True)
    if mode != "nothing":
        song_id = args[args.index("--id") + 1]
        (out / (audio.stem + ".song.json")).write_text(json.dumps({"id": song_id}))
        (out / (audio.stem + ".mid")).write_bytes(b"MThd")
    """
)

JOB = Job("j", "song-9", "u", "u/j.mp3", 1, "Title", "full-mix", "easy")


@pytest.fixture
def analyser(tmp_path: Path) -> SubprocessAnalyser:
    stub = tmp_path / "stub.py"
    stub.write_text(STUB)
    return SubprocessAnalyser(command=[sys.executable, str(stub)], poll_sec=0.02)


def run(
    analyser: SubprocessAnalyser,
    tmp_path: Path,
    mode: str,
    timeout: float = 30.0,
    cancelled: Callable[[], bool] = lambda: False,
) -> tuple[Analysis, list[tuple[str, float]]]:
    audio = tmp_path / "input.mp3"
    audio.write_text(mode)
    stages: list[tuple[str, float]] = []
    result = analyser.analyse(
        audio, JOB, tmp_path, lambda s, t: stages.append((s, t)), cancelled, timeout
    )
    return result, stages


def test_success_reads_the_song_and_reports_stages(
    analyser: SubprocessAnalyser, tmp_path: Path
) -> None:
    result, stages = run(analyser, tmp_path, "ok")
    assert result.song == {"id": "song-9"}
    assert result.midi == b"MThd"
    assert stages == [("ingest", 0.25)]


@pytest.mark.parametrize(
    ("exit_code", "code"),
    [(4, "decode_failed"), (5, "too_long"), (6, "silent"), (7, "model_failed"), (1, "internal")],
)
def test_exit_codes_become_job_errors(
    analyser: SubprocessAnalyser, tmp_path: Path, exit_code: int, code: str
) -> None:
    with pytest.raises(JobError) as caught:
        run(analyser, tmp_path, f"exit{exit_code}")
    assert caught.value.code == code
    assert "input.mp3" not in str(caught.value)


def test_no_output_is_internal(analyser: SubprocessAnalyser, tmp_path: Path) -> None:
    with pytest.raises(JobError) as caught:
        run(analyser, tmp_path, "nothing")
    assert caught.value.code == "internal"


def test_the_deadline_stops_the_child(analyser: SubprocessAnalyser, tmp_path: Path) -> None:
    with pytest.raises(JobError) as caught:
        run(analyser, tmp_path, "hang", timeout=1.0)
    assert caught.value.code == "timeout"


def test_cancelling_stops_the_child(analyser: SubprocessAnalyser, tmp_path: Path) -> None:
    calls = {"n": 0}

    def cancelled() -> bool:
        calls["n"] += 1
        return calls["n"] > 20

    with pytest.raises(Cancelled):
        run(analyser, tmp_path, "hang", cancelled=cancelled)


def test_the_default_command_is_this_package() -> None:
    assert SubprocessAnalyser().command[1:] == ["-m", "isai.cli"]
