import numpy as np
import pytest

from isai.device import torch_available
from isai.errors import ModelMissingError
from isai.models import model_path
from isai.rhythm import BeatThisTracker, analyse_rhythm

RATE = 22_050


def drums(bpm: float, seconds: float) -> tuple[np.ndarray, list[float]]:
    """Kick on 1 and 3, snare on 2 and 4, hats on the eighths; returns audio and beat times."""
    rng = np.random.default_rng(0)
    t = np.arange(int(seconds * RATE)) / RATE
    audio = np.zeros_like(t)
    beat = 60 / bpm
    beats = list(np.arange(0.5, seconds - 0.5, beat))
    for i, b in enumerate(beats):
        start = int(b * RATE)
        n = int(0.2 * RATE)
        if i % 2 == 0:
            hit = np.sin(2 * np.pi * 55 * t[:n]) * np.exp(-t[:n] * 20)
        else:
            hit = 0.5 * rng.standard_normal(n) * np.exp(-t[:n] * 30)
        audio[start : start + n] += hit[: max(0, min(n, audio.size - start))]
        for k in (0, 1):
            h = int((b + k * beat / 2) * RATE)
            m = int(0.03 * RATE)
            audio[h : h + m] += 0.1 * rng.standard_normal(min(m, max(0, audio.size - h)))
    return (0.5 * audio / np.abs(audio).max()).astype(np.float32), [round(b, 3) for b in beats]


@pytest.mark.slow
def test_beat_this_finds_the_beats_of_a_drum_groove_the_same_way_twice() -> None:
    if not torch_available():
        pytest.skip("needs torch")
    try:
        checkpoint = model_path("beat-this")
    except ModelMissingError:
        pytest.skip("beat-this not fetched (isai models fetch beat-this)")
    audio, truth = drums(100, 20)
    tracker = BeatThisTracker(checkpoint, "cpu")
    first = tracker.track(audio, RATE)
    hits = sum(1 for b in truth if np.min(np.abs(first.beats - b)) <= 0.07)
    assert hits / len(truth) >= 0.9
    rhythm = analyse_rhythm(audio, RATE, tracker)
    assert rhythm.bpm == pytest.approx(100, rel=0.02)
    assert rhythm.tracker == "beat-this-final0-1"
    again = BeatThisTracker(checkpoint, "cpu").track(audio, RATE)
    assert np.array_equal(first.beats, again.beats) and np.array_equal(
        first.downbeats, again.downbeats
    )
