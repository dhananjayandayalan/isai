import numpy as np
import pytest

from isai.transcribe.segment import (
    SegmentOptions,
    hysteresis,
    hz_to_semitones,
    median_voiced,
    segment,
    tuning_from_f0,
)
from isai.transcribe.types import F0Track, TNote

HOP = 0.01


def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def track(parts: list[tuple[float | None, float]], rms: float = 0.1) -> F0Track:
    """Pieces of (midi or None for unvoiced, seconds), on a 10 ms hop."""
    f0: list[float] = []
    conf: list[float] = []
    for midi, seconds in parts:
        frames = round(seconds / HOP)
        f0 += [hz(midi) if midi is not None else 0.0] * frames
        conf += [0.9 if midi is not None else 0.05] * frames
    n = len(f0)
    return F0Track(
        times=np.asarray(np.arange(n) * HOP + HOP / 2, dtype=np.float64),
        hz=np.array(f0),
        confidence=np.array(conf),
        rms=np.full(n, rms),
    )


def pitches(notes: list[TNote]) -> list[int]:
    return [n.midi for n in notes]


def test_steady_notes_become_notes_with_their_times() -> None:
    notes = segment(track([(60, 0.5), (None, 0.2), (64, 0.3)]))
    assert pitches(notes) == [60, 64]
    assert notes[0].start == pytest.approx(0.0, abs=0.011)
    assert notes[0].end == pytest.approx(0.5, abs=0.011)
    assert notes[1].start == pytest.approx(0.7, abs=0.011)
    assert notes[1].end == pytest.approx(1.0, abs=0.011)


def test_vibrato_stays_one_note() -> None:
    t = np.arange(150) * HOP
    semis = 67 + 0.5 * np.sin(2 * np.pi * 6 * t)  # +-50 cents at 6 Hz
    f = F0Track(
        times=np.asarray(t + HOP / 2, dtype=np.float64),
        hz=440 * 2 ** ((semis - 69) / 12),
        confidence=np.full(t.size, 0.9),
        rms=np.full(t.size, 0.1),
    )
    assert pitches(segment(f)) == [67]


def test_a_slide_gives_the_two_end_notes_not_the_ones_passed_through() -> None:
    slide = np.linspace(60, 64, 8)  # 80 ms glide through 61-63
    t = np.arange(40 + 8 + 40) * HOP
    semis = np.concatenate([np.full(40, 60.0), slide, np.full(40, 64.0)])
    f = F0Track(
        times=np.asarray(t + HOP / 2, dtype=np.float64),
        hz=440 * 2 ** ((semis - 69) / 12),
        confidence=np.full(t.size, 0.9),
        rms=np.full(t.size, 0.1),
    )
    assert pitches(segment(f)) == [60, 64]


def test_a_short_gap_between_the_same_pitch_merges() -> None:
    assert pitches(segment(track([(62, 0.3), (None, 0.04), (62, 0.3)]))) == [62]
    # A longer gap is a repeated note.
    assert pitches(segment(track([(62, 0.3), (None, 0.1), (62, 0.3)]))) == [62, 62]


def test_blips_under_80_ms_are_dropped() -> None:
    notes = segment(track([(60, 0.4), (None, 0.2), (72, 0.05), (None, 0.2), (65, 0.3)]))
    assert pitches(notes) == [60, 65]


def test_a_detuned_singer_lands_on_semitones_with_the_tuning() -> None:
    sharp = [(m + 0.3, 0.3) for m in (60, 62, 64)]  # 30 cents sharp throughout
    f = track([*sharp])
    voiced = f.confidence > 0.5
    tuning = tuning_from_f0(f.hz, voiced)
    assert tuning == pytest.approx(30, abs=1)
    assert pitches(segment(f, tuning)) == [60, 62, 64]


def test_silence_and_an_empty_track_give_no_notes() -> None:
    assert segment(track([(None, 1.0)])) == []
    empty = F0Track(np.zeros(0), np.zeros(0), np.zeros(0), np.zeros(0))
    assert segment(empty) == []
    assert tuning_from_f0(np.zeros(5), np.zeros(5, dtype=bool)) == 0.0


def test_voicing_hysteresis_holds_through_a_dip() -> None:
    conf = np.array([0.1, 0.6, 0.4, 0.35, 0.6, 0.2, 0.4])
    assert hysteresis(conf, 0.5, 0.3).tolist() == [False, True, True, True, True, False, False]


def test_median_filter_removes_an_octave_blip() -> None:
    values = np.array([60.0, 60.0, 72.0, 60.0, 60.0])
    voiced = np.ones(5, dtype=bool)
    assert median_voiced(values, voiced, 3).tolist() == [60.0] * 5
    assert median_voiced(values, voiced, 1).tolist() == values.tolist()


def test_out_of_range_pitches_are_dropped() -> None:
    options = SegmentOptions(midi_range=(40, 80))
    assert pitches(segment(track([(30, 0.3), (None, 0.2), (60, 0.3)]), 0.0, options)) == [60]


def test_velocity_follows_loudness() -> None:
    quiet = track([(60, 0.3)], rms=0.01)
    loud = track([(62, 0.3)], rms=0.2)
    both = F0Track(
        times=np.concatenate([quiet.times, loud.times + 0.5]),
        hz=np.concatenate([quiet.hz, loud.hz]),
        confidence=np.concatenate([quiet.confidence, loud.confidence]),
        rms=np.concatenate([quiet.rms, loud.rms]),
    )
    soft, strong = segment(both)
    assert 1 <= soft.velocity < strong.velocity <= 127


def test_semitones_are_nan_where_unvoiced() -> None:
    out = hz_to_semitones(np.array([440.0, 0.0]))
    assert out[0] == pytest.approx(69)
    assert np.isnan(out[1])


def test_segmentation_is_deterministic() -> None:
    f = track([(60, 0.3), (None, 0.1), (67, 0.4), (65, 0.2)])
    assert segment(f) == segment(f)
