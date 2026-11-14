from pathlib import Path

import numpy as np
import pytest

from isai.errors import DecodeError, SilentAudioError, TooLongError
from isai.ingest import IngestLimits, ingest
from isai.ingest.decode import find_tools
from isai.ingest.loudness import TARGET_LUFS, integrated_loudness, normalise
from isai.ingest.trim import sound_span
from isai.ingest.types import LOW_RATE, RATE
from tests.synth import encode, ffmpeg, silence, tone, write_wav

needs_ffmpeg = pytest.mark.skipif(
    ffmpeg() is None, reason="ffmpeg is not on PATH (install ffmpeg 6+)"
)


# ---------------------------------------------------------------- loudness (pure)


def test_a_full_scale_997_hz_sine_measures_minus_3_lufs() -> None:
    # BS.1770: a 0 dBFS sine near 1 kHz on one channel reads -3.01 LKFS.
    assert integrated_loudness(tone(997, 5), RATE) == pytest.approx(-3.01, abs=0.05)


@pytest.mark.parametrize("rate", [22_050, 44_100, 48_000])
def test_a_minus_20_dbfs_sine_measures_minus_23_lufs_at_any_rate(rate: int) -> None:
    assert integrated_loudness(tone(997, 5, rate, amplitude=0.1), rate) == pytest.approx(
        -23.01, abs=0.05
    )


def test_silence_and_quiet_parts_are_gated_out() -> None:
    assert integrated_loudness(silence(5), RATE) is None
    assert integrated_loudness(tone(997, 0.2), RATE) is None  # shorter than one block
    # Long silences don't drag the reading down: the gates leave them out. (The few 400 ms
    # blocks that straddle an edge are partly tone, pass both gates and lower it slightly.)
    padded = np.concatenate([silence(10), tone(997, 5, amplitude=0.1), silence(10)])
    assert integrated_loudness(padded, RATE) == pytest.approx(-23.01, abs=0.3)


def test_normalising_hits_the_target() -> None:
    loud = tone(440, 5, amplitude=0.9)
    measured = integrated_loudness(loud, RATE)
    assert measured is not None
    out = normalise(loud, measured)
    assert out.dtype == np.float32
    assert integrated_loudness(out, RATE) == pytest.approx(TARGET_LUFS, abs=0.05)


# ---------------------------------------------------------------- trim (pure)


def test_finds_the_span_of_sound_with_a_little_padding() -> None:
    audio = np.concatenate([silence(1), tone(440, 2, amplitude=0.1), silence(0.5)])
    span = sound_span(audio, RATE)
    assert span is not None
    start, end = span
    assert start / RATE == pytest.approx(0.95, abs=0.01)  # 1 s of silence, 50 ms of padding
    assert end / RATE == pytest.approx(3.05, abs=0.01)
    assert sound_span(silence(2), RATE) is None
    assert sound_span(np.zeros(10), RATE) is None


# ---------------------------------------------------------------- ingest (needs ffmpeg)


@needs_ffmpeg
def test_decodes_downmixes_resamples_normalises_and_trims(tmp_path: Path) -> None:
    rate = 48_000
    left = np.concatenate(
        [silence(1.0, rate), tone(440, 3, rate, amplitude=0.5), silence(0.5, rate)]
    )
    stereo = np.stack([left, np.zeros_like(left)], axis=1)
    wav = write_wav(tmp_path / "stereo.wav", stereo, rate)
    result = ingest(wav)
    assert result.offset_sec == pytest.approx(0.95, abs=0.02)
    assert result.duration_sec == pytest.approx(4.5, abs=0.01)
    assert result.samples.dtype == np.float32
    assert result.samples.size / RATE == pytest.approx(3.1, abs=0.05)
    assert result.samples_low.size == pytest.approx(result.samples.size * LOW_RATE / RATE, abs=2)
    measured = integrated_loudness(result.samples, RATE)
    assert measured == pytest.approx(TARGET_LUFS, abs=1.0)
    assert len(result.audio_hash) == 64


@needs_ffmpeg
def test_downmixes_stereo_to_mono(tmp_path: Path) -> None:
    sine = tone(440, 3, amplitude=0.3)
    mono = ingest(write_wav(tmp_path / "mono.wav", sine))
    both = ingest(write_wav(tmp_path / "both.wav", np.stack([sine, sine], axis=1)))
    one = ingest(write_wav(tmp_path / "one.wav", np.stack([sine, np.zeros_like(sine)], axis=1)))
    # ffmpeg's downmix keeps power, not amplitude, so the levels before normalising differ...
    assert one.loudness_lufs < mono.loudness_lufs < both.loudness_lufs
    # ...and normalising makes every layout the same mono signal.
    for other in (both, one):
        assert other.samples.size == mono.samples.size
        assert np.allclose(other.samples, mono.samples, atol=1e-3)


@needs_ffmpeg
@pytest.mark.parametrize("suffix", [".mp3", ".flac", ".m4a"])
def test_decodes_common_formats(tmp_path: Path, suffix: str) -> None:
    wav = write_wav(
        tmp_path / "tone.wav", np.concatenate([tone(440, 2, amplitude=0.3), silence(0.2)])
    )
    result = ingest(encode(wav, suffix))
    assert result.duration_sec == pytest.approx(2.2, abs=0.1)  # encoder padding varies a little
    assert integrated_loudness(result.samples, RATE) == pytest.approx(TARGET_LUFS, abs=1.0)


@needs_ffmpeg
def test_the_same_audio_gives_the_same_hash_and_samples(tmp_path: Path) -> None:
    wav = write_wav(tmp_path / "a.wav", tone(330, 2, amplitude=0.4))
    first, second = ingest(wav), ingest(wav)
    assert first.audio_hash == second.audio_hash
    assert np.array_equal(first.samples, second.samples)
    other = ingest(write_wav(tmp_path / "b.wav", tone(331, 2, amplitude=0.4)))
    assert other.audio_hash != first.audio_hash


@needs_ffmpeg
def test_refuses_audio_that_is_too_long_or_too_big(tmp_path: Path) -> None:
    wav = write_wav(tmp_path / "long.wav", tone(440, 3, amplitude=0.3))
    with pytest.raises(TooLongError, match="limit"):
        ingest(wav, IngestLimits(max_seconds=2))
    with pytest.raises(TooLongError, match="MB"):
        ingest(wav, IngestLimits(max_bytes=1000))


@needs_ffmpeg
def test_refuses_too_long_audio_whose_container_hides_its_length(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # When ffprobe can't tell the duration, the decoded length decides.
    wav = write_wav(tmp_path / "long.wav", tone(440, 3, amplitude=0.3))
    monkeypatch.setattr("isai.ingest.probe_duration", lambda _tools, _path: None)
    with pytest.raises(TooLongError, match="longer than"):
        ingest(wav, IngestLimits(max_seconds=2))


@needs_ffmpeg
def test_refuses_silence(tmp_path: Path) -> None:
    with pytest.raises(SilentAudioError):
        ingest(write_wav(tmp_path / "silent.wav", silence(3)))
    with pytest.raises(SilentAudioError):
        ingest(write_wav(tmp_path / "hiss.wav", tone(440, 3, amplitude=1e-5)))


@needs_ffmpeg
def test_refuses_a_file_that_is_not_audio(tmp_path: Path) -> None:
    text = tmp_path / "notes.mp3"
    text.write_text("this is not audio")
    with pytest.raises(DecodeError, match="not an audio file"):
        ingest(text)


def test_says_how_to_fix_a_missing_ffmpeg(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.delenv("ISAI_FFMPEG", raising=False)
    with pytest.raises(DecodeError, match="Install ffmpeg 6 or newer"):
        find_tools()


@needs_ffmpeg
def test_reads_the_ffmpeg_version() -> None:
    tools = find_tools()
    assert int(tools.version.split(".")[0]) >= 6
