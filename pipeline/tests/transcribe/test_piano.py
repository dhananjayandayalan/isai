import numpy as np
import pytest

from isai.device import torch_available
from isai.errors import ModelMissingError
from isai.models import model_path
from isai.transcribe.piano import ByteDanceTranscriber, PianoResult, analyse_piano
from isai.transcribe.types import PedalSpan, TNote

RATE = 22_050
PLAYED = [(0.5, 60), (1.0, 64), (1.5, 67), (2.0, 72), (2.5, 48), (2.5, 55), (3.5, 65), (4.0, 69)]


class FakeTranscriber:
    name = "fake"
    version = "1"

    def transcribe(self, samples: np.ndarray, rate: int) -> PianoResult:
        return PianoResult(
            notes=[TNote(0.0, 0.5, 60, 200), TNote(0.0, 0.01, 72, 80), TNote(1.0, 1.5, 64, 70)],
            pedals=[PedalSpan(0.2, 2.0)],
            confidence=0.9,
        )


def test_analyse_piano_cleans_the_transcription_into_an_artifact() -> None:
    notes = analyse_piano(np.zeros(10, dtype=np.float32), RATE, FakeTranscriber())
    assert notes.list() == [TNote(0.0, 2.0, 60, 127), TNote(1.0, 2.0, 64, 70)]
    assert notes.confidence == 0.9
    assert notes.pedal_start.tolist() == [0.2] and notes.pedal_end.tolist() == [2.0]


def piano_tone(midi: int, seconds: float) -> np.ndarray:
    t = np.arange(int(seconds * RATE)) / RATE
    f = 440 * 2 ** ((midi - 69) / 12)
    partials = sum(
        np.sin(2 * np.pi * f * k * t) * 0.5**k * np.exp(-t * (1.5 + k)) for k in range(1, 6)
    )
    return np.minimum(1, t / 0.003) * partials


def _checkpoint_or_skip():
    if not torch_available():
        pytest.skip("needs torch (uv sync --extra cpu|cuda)")
    try:
        return model_path("piano-bytedance")
    except ModelMissingError:
        pytest.skip("piano-bytedance not fetched (isai models fetch piano-bytedance)")


@pytest.mark.slow
def test_bytedance_finds_every_played_note() -> None:
    audio = np.zeros(int(6 * RATE))
    for start, midi in PLAYED:
        tone = piano_tone(midi, 1.0)
        i = int(start * RATE)
        audio[i : i + tone.size] += tone
    audio = (0.5 * audio / np.abs(audio).max()).astype(np.float32)
    result = ByteDanceTranscriber(_checkpoint_or_skip(), "cpu").transcribe(audio, RATE)
    found = {(round(n.start * 2) / 2, n.midi) for n in result.notes}
    assert set(PLAYED) <= found  # synthetic overtones may add extra notes; real piano won't
    for start, midi in PLAYED:
        onset = min(abs(n.start - start) for n in result.notes if n.midi == midi)
        assert onset < 0.03
    assert 0 < result.confidence <= 1
