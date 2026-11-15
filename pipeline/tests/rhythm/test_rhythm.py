import numpy as np
import pytest

from isai.rhythm import LibrosaTracker, TrackedBeats, analyse_rhythm
from isai.rhythm.derive import (
    FALLBACK_METER_CONFIDENCE,
    bpm,
    intervals,
    is_stable,
    metre,
    stability,
    tempo_confidence,
)
from isai.rhythm.tracker import accents, bar_phase
from tests.synth import click_track

RATE = 22_050


def grid(period: float, count: int, start: float = 0.0) -> list[float]:
    return [start + i * period for i in range(count)]


# ---------------------------------------------------------------- derived values (pure)


def test_bpm_is_the_median_interval() -> None:
    assert bpm(grid(0.5, 16)) == pytest.approx(120.0)
    # One late beat doesn't move the median.
    beats = grid(0.5, 16)
    beats[8] += 0.1
    assert bpm(beats) == pytest.approx(120.0)
    assert bpm([1.0]) is None
    assert bpm([]) is None
    assert intervals([0.0, 0.5, 0.5, 1.0]) == [0.5, 0.5]  # duplicates are ignored


def test_stability_is_the_coefficient_of_variation() -> None:
    assert stability(grid(0.5, 16)) == pytest.approx(0.0, abs=1e-12)
    assert is_stable(grid(0.5, 16))
    rubato = [0.0, 0.5, 1.1, 1.5, 2.2, 2.6, 3.4, 3.8]
    cv = stability(rubato)
    assert cv is not None and cv > 0.1
    assert not is_stable(rubato)
    assert stability([0.0, 0.5]) is None
    assert not is_stable([0.0, 0.5])


@pytest.mark.parametrize("beats_per_bar", [3, 4])
def test_metre_counts_the_beats_between_downbeats(beats_per_bar: int) -> None:
    beats = grid(0.5, 24)
    found = metre(beats, beats[::beats_per_bar])
    assert found.beats_per_bar == beats_per_bar
    assert found.confidence == 1.0


def test_metre_falls_back_to_four_with_low_confidence() -> None:
    beats = grid(0.5, 30)
    assert metre(beats, beats[::5]).beats_per_bar == 4  # 5/4 isn't supported
    assert metre(beats, beats[::5]).confidence == FALLBACK_METER_CONFIDENCE
    assert metre(beats, [0.0]) == metre([], [])
    assert metre([], []).confidence == FALLBACK_METER_CONFIDENCE


def test_metre_confidence_is_the_share_of_bars_that_agree() -> None:
    beats = grid(0.5, 20)
    downbeats = [beats[0], beats[4], beats[8], beats[11], beats[15], beats[19]]  # one 3-beat bar
    found = metre(beats, downbeats)
    assert found.beats_per_bar == 4
    assert found.confidence == pytest.approx(0.8)


def test_tempo_confidence_wants_steady_beats_and_enough_of_them() -> None:
    assert tempo_confidence(grid(0.5, 32)) == 1.0
    assert tempo_confidence(grid(0.5, 8)) == pytest.approx(0.5)
    assert tempo_confidence([0.0, 0.5, 1.1, 1.5, 2.2, 2.6, 3.4, 3.8, 4.1, 4.9]) < 0.5
    assert tempo_confidence([0.0]) == 0.0


# ---------------------------------------------------------------- bar phase (pure)


def test_bar_phase_finds_the_accented_beat_and_the_bar_length() -> None:
    four = np.array([0.4, 0.4, 1.0, 0.4] * 6)  # accents on the third beat of each four
    assert bar_phase(four) == (4, 2)
    three = np.array([1.0, 0.4, 0.4] * 8)
    assert bar_phase(three) == (3, 0)
    flat = np.ones(12)
    assert bar_phase(flat) == (4, 0)  # nothing to go on: 4/4 from the first beat
    assert bar_phase(np.zeros(0)) == (4, 0)


def test_accents_take_the_strongest_onset_near_each_beat() -> None:
    envelope = np.array([0.0, 0.1, 0.9, 0.1, 0.0, 0.0, 0.2, 0.0, 0.0, 0.0])
    assert accents(envelope, np.array([3, 7], dtype=np.int64)).tolist() == [0.9, 0.2]
    assert accents(np.zeros(0), np.array([1], dtype=np.int64)).tolist() == [0.0]


# ---------------------------------------------------------------- analyse_rhythm


class FakeTracker:
    name = "fake"
    version = "9"

    def __init__(self, beats: list[float], downbeats: list[float]) -> None:
        self.result = TrackedBeats(beats=np.array(beats), downbeats=np.array(downbeats))

    def track(self, samples: np.ndarray, rate: int) -> TrackedBeats:
        return self.result


def test_analyse_rhythm_derives_everything_from_the_tracker() -> None:
    beats = [t + 1e-5 for t in grid(0.6, 16)]  # float noise is rounded to the millisecond
    rhythm = analyse_rhythm(np.zeros(10, dtype=np.float32), RATE, FakeTracker(beats, beats[::4]))
    assert rhythm.bpm == 100.0
    assert rhythm.beats_per_bar == 4
    assert rhythm.beats.tolist() == [round(b, 3) for b in beats]
    assert rhythm.downbeats.tolist() == rhythm.beats[::4].tolist()
    assert rhythm.stable
    assert rhythm.confidence == 1.0
    assert rhythm.tracker == "fake-9"


def test_analyse_rhythm_copes_with_no_beats() -> None:
    rhythm = analyse_rhythm(np.zeros(10, dtype=np.float32), RATE, FakeTracker([], []))
    assert rhythm.bpm == 120.0
    assert rhythm.beats_per_bar == 4
    assert rhythm.confidence == 0.0
    assert not rhythm.stable


# ---------------------------------------------------------------- librosa tracker on click tracks


@pytest.mark.parametrize("tempo", [60, 90, 120, 174])
@pytest.mark.parametrize("beats_per_bar", [3, 4])
def test_tracks_click_tracks_within_two_percent_with_the_right_metre(
    tempo: int, beats_per_bar: int
) -> None:
    audio, clicks = click_track(tempo, beats_per_bar)
    rhythm = analyse_rhythm(audio.astype(np.float32), RATE, LibrosaTracker())
    assert rhythm.bpm == pytest.approx(tempo, rel=0.02)
    assert rhythm.beats_per_bar == beats_per_bar
    assert rhythm.stable
    assert rhythm.confidence > 0.8
    # Every downbeat lands on an accented click.
    accented = clicks[::beats_per_bar]
    for downbeat in rhythm.downbeats.tolist():
        assert min(abs(downbeat - a) for a in accented) < 0.03


def test_flags_a_tempo_ramp_as_unstable() -> None:
    audio, _ = click_track(100, 4, ramp_to=140)
    rhythm = analyse_rhythm(audio.astype(np.float32), RATE, LibrosaTracker())
    assert not rhythm.stable
    assert rhythm.stability > 0.05
    assert rhythm.confidence < 0.8
