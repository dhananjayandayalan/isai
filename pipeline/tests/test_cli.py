import io
import json
import shutil
import subprocess
import sys
from pathlib import Path

import mido  # pyright: ignore[reportMissingTypeStubs]
import numpy as np
import pytest

import isai.pipeline
from isai.assemble import SongInfo
from isai.cli import main
from isai.ingest import IngestLimits
from isai.pipeline import Options, run
from isai.schema import SongValidationError, current_version, load_json, validate_song
from tests.synth import cadence, click_track, ffmpeg, silence, write_wav

needs_ffmpeg = pytest.mark.skipif(
    ffmpeg() is None, reason="ffmpeg is not on PATH (install ffmpeg 6+)"
)
RATE = 44_100


@pytest.fixture(scope="module")
def song_file(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Eight seconds of a G major cadence over a 60 BPM 4/4 click, after a second of silence."""
    music = cadence(7, "major", cycles=2, rate=RATE)
    clicks, _ = click_track(60, 4, seconds=music.size / RATE, rate=RATE, start=0.0)
    audio = np.concatenate(
        [silence(1.0, RATE), music + 0.5 * clicks[: music.size], silence(0.5, RATE)]
    )
    return write_wav(tmp_path_factory.mktemp("song") / "cadence.wav", audio, RATE)


def analyse(song: Path, out: Path, *extra: str) -> int:
    return main(["analyse", str(song), "--type", "full-mix", "--out", str(out), *extra])


@needs_ffmpeg
def test_analyse_writes_a_valid_song_and_a_midi_file(song_file: Path, tmp_path: Path) -> None:
    assert analyse(song_file, tmp_path / "out", "--cache-dir", str(tmp_path / "cache")) == 0
    song = load_json(tmp_path / "out" / "cadence.song.json")
    validate_song(song)
    assert song["schemaVersion"] == current_version() == "0.2.0"
    assert song["title"] == "cadence"
    assert song["sourceType"] == "full-mix"
    assert song["durationSec"] == pytest.approx(9.5, abs=0.01)
    assert song["tempo"]["bpm"] == pytest.approx(60, rel=0.02)
    assert song["timeSignature"] == {"num": 4, "den": 4}
    assert (song["tonality"]["key"], song["tonality"]["mode"]) == ("G", "major")
    assert song["tonality"]["scale"] == [7, 9, 11, 0, 2, 4, 6]
    # Times are on the original audio: the first beat is after the second of silence.
    assert song["tempo"]["beats"][0] == pytest.approx(1.0, abs=0.05)
    assert set(song["tempo"]["downbeats"]) <= set(song["tempo"]["beats"])
    assert song["notes"] == [] and song["chords"] == []
    confidence = song["meta"]["confidence"]
    assert confidence["key"] > 0 and confidence["tempo"] > 0 and confidence["chords"] == 0
    midi = mido.MidiFile(file=io.BytesIO((tmp_path / "out" / "cadence.mid").read_bytes()))
    assert [t.name for t in midi.tracks[1:]] == ["Right hand", "Left hand"]


@needs_ffmpeg
def test_the_same_input_and_flags_give_byte_identical_output(
    song_file: Path, tmp_path: Path
) -> None:
    fixed = ["--id", "repeatable", "--created-at", "2026-11-14T10:00:00+00:00"]
    assert analyse(song_file, tmp_path / "a", "--no-cache", *fixed) == 0
    assert analyse(song_file, tmp_path / "b", "--no-cache", *fixed) == 0
    # A cached run gives the same bytes as a fresh one.
    assert analyse(song_file, tmp_path / "c", "--cache-dir", str(tmp_path / "cache"), *fixed) == 0
    assert analyse(song_file, tmp_path / "d", "--cache-dir", str(tmp_path / "cache"), *fixed) == 0
    for name in ("cadence.song.json", "cadence.mid"):
        first = (tmp_path / "a" / name).read_bytes()
        for other in ("b", "c", "d"):
            assert (tmp_path / other / name).read_bytes() == first, f"{other}/{name}"


@needs_ffmpeg
def test_the_cache_skips_finished_stages_and_no_cache_runs_them(
    song_file: Path, tmp_path: Path
) -> None:
    info = SongInfo(
        song_id="x", title="t", source_type="full-mix", created_at="2026-11-14T10:00:00+00:00"
    )
    cache = tmp_path / "cache"
    first = run(song_file, info, Options(source_type="full-mix", cache_root=cache))
    second = run(song_file, info, Options(source_type="full-mix", cache_root=cache))
    fresh = run(song_file, info, Options(source_type="full-mix", cache_root=None))
    rerun = run(
        song_file, info, Options(source_type="full-mix", cache_root=cache, from_stage="tonality")
    )
    cached = lambda result: {r.name: r.cached for r in result.records}  # noqa: E731
    assert cached(first) == {"ingest": False, "rhythm": False, "tonality": False}
    assert cached(second) == {"ingest": False, "rhythm": True, "tonality": True}
    assert cached(fresh) == {"ingest": False, "rhythm": False, "tonality": False}
    assert cached(rerun) == {"ingest": False, "rhythm": True, "tonality": False}
    assert first.song == second.song == fresh.song == rerun.song


@needs_ffmpeg
def test_logs_each_stage_as_a_json_line(
    song_file: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert analyse(song_file, tmp_path / "out", "--no-cache", "--log-json") == 0
    lines = [json.loads(line) for line in capsys.readouterr().err.splitlines()]
    assert [line["stage"] for line in lines] == ["ingest", "rhythm", "tonality"]
    assert all(line["event"] == "stage" and line["seconds"] >= 0 for line in lines)


def test_type_is_required_and_carnatic_is_for_later(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    audio = tmp_path / "x.wav"
    audio.write_bytes(b"")
    with pytest.raises(SystemExit) as exc:
        main(["analyse", str(audio), "--out", str(tmp_path)])
    assert exc.value.code == 2
    with pytest.raises(SystemExit):
        main(["analyse", str(audio), "--type", "polka", "--out", str(tmp_path)])
    assert main(["analyse", str(audio), "--type", "carnatic", "--out", str(tmp_path)]) == 2
    assert "coming in a later version" in capsys.readouterr().err


def test_missing_input_exits_2(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert analyse(tmp_path / "nope.wav", tmp_path / "out") == 2
    assert "input file not found" in capsys.readouterr().err
    assert not (tmp_path / "out").exists()


def test_a_bad_created_at_exits_2(
    song_file: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert analyse(song_file, tmp_path / "out", "--created-at", "yesterday") == 2
    assert "ISO 8601" in capsys.readouterr().err


@needs_ffmpeg
def test_decode_failure_exits_4(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    text = tmp_path / "notes.mp3"
    text.write_text("not audio")
    assert analyse(text, tmp_path / "out", "--no-cache") == 4
    assert "not an audio file" in capsys.readouterr().err


@needs_ffmpeg
def test_too_long_exits_5(song_file: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # The real limit is 12 minutes; a 2 s limit makes the 9.5 s test song too long.
    original = isai.pipeline.ingest
    monkeypatch.setattr(
        isai.pipeline, "ingest", lambda path, _limits: original(path, IngestLimits(max_seconds=2))
    )
    assert analyse(song_file, tmp_path / "out", "--no-cache") == 5


@needs_ffmpeg
def test_silence_exits_6(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    silent = write_wav(tmp_path / "silent.wav", silence(2, RATE), RATE)
    assert analyse(silent, tmp_path / "out", "--no-cache") == 6
    assert "silent" in capsys.readouterr().err


@needs_ffmpeg
def test_schema_not_found_exits_3(
    song_file: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ISAI_SCHEMA_DIR", str(tmp_path / "empty"))
    import isai.schema

    isai.schema.load_schema.cache_clear()
    isai.schema._validator.cache_clear()  # pyright: ignore[reportPrivateUsage]
    try:
        assert analyse(song_file, tmp_path / "out", "--no-cache") == 3
    finally:
        monkeypatch.delenv("ISAI_SCHEMA_DIR")
        isai.schema.load_schema.cache_clear()
        isai.schema._validator.cache_clear()  # pyright: ignore[reportPrivateUsage]


@needs_ffmpeg
def test_an_invalid_song_exits_1(
    song_file: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def reject(_doc: object) -> None:
        raise SongValidationError(["$.tempo: broken on purpose"])

    monkeypatch.setattr("isai.assemble.validate_song", reject)
    assert analyse(song_file, tmp_path / "out", "--no-cache") == 1


@needs_ffmpeg
def test_console_script_runs(song_file: Path, tmp_path: Path) -> None:
    # The `isai` entry point installed next to this interpreter, not `python -m`.
    script = shutil.which("isai", path=str(Path(sys.executable).parent))
    assert script is not None, "isai console script is not installed in this environment"
    result = subprocess.run(
        [
            script,
            "analyse",
            str(song_file),
            "--type",
            "piano-solo",
            "--out",
            str(tmp_path),
            "--no-cache",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    validate_song(load_json(tmp_path / "cadence.song.json"))
