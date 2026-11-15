import numpy as np
import pytest

from isai.device import torch_available
from isai.transcribe.melody import (
    HOP,
    RATE,
    CrepeTracker,
    PyinTracker,
    analyse_melody,
    frame_rms,
)
from isai.transcribe.types import F0Track
from tests.synth import harmonic_note

MELODY = [62, 64, 66, 67]  # D4 E4 F#4 G4


def sung(rate: int = 22_050, cents: float = 0.0) -> np.ndarray:
    """Four 0.4 s notes with 0.15 s rests, a little vibrato-free 'voice'."""
    parts: list[np.ndarray] = [np.zeros(int(0.2 * rate))]
    for midi in MELODY:
        parts.append(0.3 * harmonic_note(midi, 0.4, rate, cents))
        parts.append(np.zeros(int(0.15 * rate)))
    return np.concatenate(parts).astype(np.float32)


class FakeTracker:
    name = "fake"
    version = "1"

    def track(self, samples: np.ndarray, rate: int) -> F0Track:
        frames = 100
        hz = np.where(np.arange(frames) < 50, 440.0 * 2 ** (3 / 1200), 0.0)  # 3 cents sharp
        return F0Track(
            times=np.arange(frames, dtype=np.float64) * 0.01,
            hz=hz,
            confidence=np.where(hz > 0, 0.8, 0.0),
            rms=np.full(frames, 0.1),
        )


def test_analyse_melody_segments_and_measures_tuning_and_confidence() -> None:
    melody = analyse_melody(np.zeros(10, dtype=np.float32), RATE, FakeTracker())
    assert [n.midi for n in melody.notes()] == [69]
    assert melody.tuning_cents == pytest.approx(3, abs=0.5)
    assert melody.notes_confidence == pytest.approx(0.8)
    assert melody.tracker == "fake-1"
    assert melody.track().hz.size == 100


def test_analyse_melody_of_silence_has_no_notes_and_no_confidence() -> None:
    class Silent(FakeTracker):
        def track(self, samples: np.ndarray, rate: int) -> F0Track:
            return F0Track(
                np.arange(10, dtype=np.float64) * 0.01, np.zeros(10), np.zeros(10), np.zeros(10)
            )

    melody = analyse_melody(np.zeros(10, dtype=np.float32), RATE, Silent())
    assert melody.notes() == []
    assert melody.notes_confidence == 0.0


def test_frame_rms_is_loud_where_the_audio_is() -> None:
    audio = np.concatenate([np.zeros(RATE // 2), 0.5 * np.ones(RATE // 2)]).astype(np.float32)
    rms = frame_rms(audio, RATE // HOP)
    assert rms[5] == pytest.approx(0.0)
    assert rms[80] == pytest.approx(0.5, abs=0.01)


def test_pyin_follows_a_sung_line() -> None:
    melody = analyse_melody(sung(), 22_050, PyinTracker())
    assert [n.midi for n in melody.notes()] == MELODY
    first = melody.notes()[0]
    assert first.start == pytest.approx(0.2, abs=0.05)
    assert first.end == pytest.approx(0.6, abs=0.06)


@pytest.mark.slow
@pytest.mark.skipif(not torch_available(), reason="needs torch (uv sync --extra cpu|cuda)")
def test_torchcrepe_follows_a_detuned_sung_line() -> None:
    melody = analyse_melody(sung(cents=-25), 22_050, CrepeTracker("cpu"))
    assert [n.midi for n in melody.notes()] == MELODY
    assert melody.tuning_cents == pytest.approx(-25, abs=8)
    assert melody.notes_confidence > 0.5
