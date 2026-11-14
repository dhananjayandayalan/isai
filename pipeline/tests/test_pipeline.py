"""The stage graph per source type, on fake models (see tests/fakes.py and conftest)."""

from pathlib import Path

import numpy as np
import pytest

from isai.assemble import SongInfo
from isai.cli import main
from isai.pipeline import Options, run
from isai.schema import validate_song
from tests.fakes import fake_models
from tests.synth import cadence, click_track, ffmpeg, silence, write_wav

pytestmark = pytest.mark.skipif(ffmpeg() is None, reason="ffmpeg is not on PATH")
RATE = 44_100


@pytest.fixture(scope="module")
def song(tmp_path_factory: pytest.TempPathFactory) -> Path:
    music = cadence(7, "major", cycles=2, rate=RATE)
    clicks, _ = click_track(60, 4, seconds=music.size / RATE, rate=RATE, start=0.0)
    audio = np.concatenate([silence(0.5, RATE), music + 0.5 * clicks[: music.size]])
    return write_wav(tmp_path_factory.mktemp("song") / "song.wav", audio, RATE)


def info(kind: str) -> SongInfo:
    return SongInfo(song_id="x", title="t", source_type=kind, created_at="2026-11-14T10:00:00Z")


def test_piano_solo_gives_a_two_hand_song(song: Path) -> None:
    models, separator, piano, pitch = fake_models()
    result = run(song, info("piano-solo"), Options("piano-solo", cache_root=None, models=models))
    validate_song(result.song)
    notes = result.song["notes"]
    hands = {n["midi"]: n["hand"] for n in notes}
    assert hands[36] == "left" and hands[72] == "right"
    assert result.song["meta"]["confidence"]["notes"] == 0.75
    assert "tonicHz" not in result.song["tonality"]
    assert (separator.calls, piano.calls, pitch.calls) == (0, 1, 0)
    assert [r.name for r in result.records] == ["ingest", "rhythm", "tonality", "piano", "harmony"]
    # The transcription is kept by default, with chords recognised under it.
    assert {n["source"] for n in notes} == {"transcribed"}
    assert result.song["chords"] and result.song["chords"][0]["label"] == "C"
    assert list(result.arrangements) == ["transcribed"]


def test_a_cappella_gets_chords_from_its_melody_and_the_singers_tonic(song: Path) -> None:
    models, separator, piano, pitch = fake_models()
    result = run(song, info("a-cappella"), Options("a-cappella", cache_root=None, models=models))
    validate_song(result.song)
    assert {n["hand"] for n in result.song["notes"]} == {"left", "right"}
    chords = result.song["chords"]
    assert chords and chords[-1]["label"] == "G"  # the last phrase ends on the tonic
    tonality = result.song["tonality"]
    assert tonality["key"] == "G"
    assert tonality["tonicHz"] == pytest.approx(392.0, abs=0.5)  # the fake sings G4
    assert (separator.calls, piano.calls, pitch.calls) == (0, 0, 1)


def test_full_mix_separates_and_tracks_the_vocals_and_the_bass(song: Path) -> None:
    models, separator, piano, pitch = fake_models()
    result = run(song, info("full-mix"), Options("full-mix", cache_root=None, models=models))
    validate_song(result.song)
    assert {n["hand"] for n in result.song["notes"]} == {"left", "right"}
    assert (separator.calls, piano.calls, pitch.calls) == (1, 0, 2)  # vocals and bass
    assert result.stem_files == []


def test_a_cached_run_builds_no_models(song: Path, tmp_path: Path) -> None:
    models, *_ = fake_models()
    run(song, info("full-mix"), Options("full-mix", cache_root=tmp_path, models=models))
    again, separator, piano, pitch = fake_models()
    result = run(song, info("full-mix"), Options("full-mix", cache_root=tmp_path, models=again))
    assert (separator.calls, piano.calls, pitch.calls) == (0, 0, 0)
    assert all(r.cached for r in result.records if r.name != "ingest")


def files_under(folder: Path) -> list[str]:
    return sorted(p.relative_to(folder).as_posix() for p in folder.rglob("*") if p.is_file())


def test_no_audio_leaves_the_cache_without_keep_stems(song: Path, tmp_path: Path) -> None:
    out, cache = tmp_path / "out", tmp_path / "cache"
    args = [
        "analyse",
        str(song),
        "--type",
        "full-mix",
        "--out",
        str(out),
        "--cache-dir",
        str(cache),
    ]
    assert main(args) == 0
    assert files_under(out) == ["song.mid", "song.song.json"]
    # Nothing else was written: the stems exist only under the cache folder.
    assert sorted(p.name for p in tmp_path.iterdir()) == ["cache", "out"]
    assert any(name.startswith("separate-") for name in (p.name for p in cache.rglob("*")))


def test_keep_stems_writes_the_stems_next_to_the_song(
    song: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    out = tmp_path / "out"
    assert (
        main(
            [
                "analyse",
                str(song),
                "--type",
                "full-mix",
                "--out",
                str(out),
                "--no-cache",
                "--keep-stems",
            ]
        )
        == 0
    )
    assert files_under(out) == [
        "song.mid",
        "song.song.json",
        "stems/bass.wav",
        "stems/drums.wav",
        "stems/other.wav",
        "stems/vocals.wav",
    ]
    assert "Wrote 4 stems" in capsys.readouterr().out


def test_the_same_input_gives_the_same_song_with_every_type(song: Path) -> None:
    for kind in ("piano-solo", "full-mix", "a-cappella"):
        first = run(song, info(kind), Options(kind, cache_root=None, models=fake_models()[0]))
        second = run(song, info(kind), Options(kind, cache_root=None, models=fake_models()[0]))
        assert first.song == second.song and first.midi == second.midi, kind


@pytest.mark.slow
@pytest.mark.parametrize("kind", ["piano-solo", "full-mix", "a-cappella"])
def test_real_models_give_byte_identical_output_on_cpu(song: Path, kind: str) -> None:
    from isai.device import torch_available
    from isai.errors import ModelMissingError
    from isai.models import model_path

    if not torch_available():
        pytest.skip("needs torch")
    try:
        model_path("hdemucs")
        model_path("piano-bytedance")
    except ModelMissingError:
        pytest.skip("models not fetched (isai models fetch)")
    first = run(song, info(kind), Options(kind, cache_root=None, device="cpu"))
    second = run(song, info(kind), Options(kind, cache_root=None, device="cpu"))
    validate_song(first.song)
    assert first.song == second.song
    assert first.midi == second.midi


def test_every_level_and_a_simplified_piano(song: Path) -> None:
    from isai.arrange.constraints import ANote, check

    options = Options(
        "full-mix", cache_root=None, models=fake_models()[0], levels=("easy", "medium", "full")
    )
    result = run(song, info("full-mix"), options)
    assert list(result.arrangements) == ["easy", "medium", "full"]
    counts = []
    for level, (doc, midi) in result.arrangements.items():
        validate_song(doc)
        notes = [
            ANote(n["start"], n["end"], n["midi"], n["velocity"], n["hand"]) for n in doc["notes"]
        ]
        assert check(notes, 60 / doc["tempo"]["bpm"] / 4 - 0.002) == [], level
        counts.append(len({n.start for n in notes if n.hand == "left"}))  # left-hand onsets
        assert midi
    assert counts[0] <= counts[1] < counts[2]  # full is the busiest rhythm
    simple = run(
        song,
        info("piano-solo"),
        Options("piano-solo", cache_root=None, models=fake_models()[0], simplify="easy"),
    )
    assert list(simple.arrangements) == ["easy"]
    assert {n["source"] for n in simple.song["notes"]} == {"arranged"}


def test_level_all_writes_a_song_per_level(song: Path, tmp_path: Path) -> None:
    out = tmp_path / "out"
    assert (
        main(
            [
                "analyse",
                str(song),
                "--type",
                "a-cappella",
                "--out",
                str(out),
                "--no-cache",
                "--level",
                "all",
            ]
        )
        == 0
    )
    assert files_under(out) == sorted(
        f"song.{level}.{ext}"
        for level in ("easy", "medium", "full")
        for ext in ("mid", "song.json")
    )
