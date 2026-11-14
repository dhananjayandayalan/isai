import numpy as np
import pytest

from isai.theory.scales import scale
from isai.tonality import Tonality
from isai.tonality.refine import blend, pitch_class_histogram, refine, tonic_hz
from isai.transcribe.types import TNote


def tonality(chroma: list[float]) -> Tonality:
    return Tonality(
        tonic=0,
        key="C",
        mode="major",
        scale=scale(0, "major"),
        confidence=0.1,
        tuning_cents=0.0,
        chroma=np.array(chroma, dtype=np.float64),
    )


def cadence_notes(tonic: int, minor: bool = False) -> list[TNote]:
    """I-IV-V-I (or i-iv-V-i) as block chords, one second each."""
    third = 3 if minor else 4
    chords = [(0, third, 7), (5, 5 + third, 12), (7, 11, 14), (0, third, 7)]
    notes: list[TNote] = []
    for i, chord in enumerate(chords):
        notes += [TNote(float(i), i + 1.0, 60 + tonic + step, 80) for step in chord]
    return notes


def test_the_histogram_counts_sounding_seconds_per_pitch_class() -> None:
    hist = pitch_class_histogram([TNote(0, 2, 60, 80), TNote(0, 1, 72, 80), TNote(0, 0.5, 67, 80)])
    assert hist[0] == pytest.approx(3.0)
    assert hist[7] == pytest.approx(0.5)
    assert hist.sum() == pytest.approx(3.5)


def test_blend_uses_either_profile_alone_when_the_other_is_empty() -> None:
    chroma = np.arange(12, dtype=np.float64)
    empty = np.zeros(12)
    assert np.allclose(blend(chroma, empty), chroma / chroma.sum())
    assert np.allclose(blend(empty, chroma), chroma / chroma.sum())
    mixed = blend(np.eye(12)[0] * 4, np.eye(12)[7] * 2, weight=0.25)
    assert mixed[0] == pytest.approx(0.75) and mixed[7] == pytest.approx(0.25)


@pytest.mark.parametrize(
    ("tonic", "minor", "name"), [(7, False, "G"), (9, True, "A"), (3, False, "Eb")]
)
def test_notes_alone_find_the_key_of_a_cadence(tonic: int, minor: bool, name: str) -> None:
    flat = tonality([0.0] * 12)  # the audio said nothing
    refined = refine(flat, cadence_notes(tonic, minor))
    assert (refined.key, refined.mode) == (name, "minor" if minor else "major")
    assert refined.scale == scale(tonic, "minor" if minor else "major")
    assert refined.confidence > 0.1


def test_notes_outvote_a_weak_relative_minor_reading() -> None:
    # A chroma that leans A minor a little, and notes that are clearly C major.
    chroma = [1.0, 0.1, 0.6, 0.1, 0.9, 0.5, 0.1, 0.6, 0.1, 1.0, 0.1, 0.4]
    refined = refine(tonality(chroma), cadence_notes(0))
    assert (refined.key, refined.mode) == ("C", "major")


def test_without_notes_the_tonality_is_unchanged() -> None:
    original = tonality([1.0] * 12)
    assert refine(original, []) is original
    assert refine(original, [TNote(1.0, 1.0, 60, 80)]) is original  # zero-length only


def test_tonic_hz_is_the_singers_own_tonic_frequency() -> None:
    # A singer on D at 146.83 Hz (D3), mostly, with a few higher Ds and other notes.
    d3 = 146.83 * 2 ** (10 / 1200)  # 10 cents sharp
    hz = np.array([d3] * 50 + [d3 * 2] * 10 + [220.0] * 30 + [0.0] * 10)
    voiced = hz > 0
    assert tonic_hz(hz, voiced, tonic=2, tuning_cents=10) == pytest.approx(d3, abs=0.01)


def test_tonic_hz_is_none_without_the_tonic_or_without_voice() -> None:
    hz = np.array([220.0] * 10)
    assert tonic_hz(hz, hz > 0, tonic=2) is None
    assert tonic_hz(np.zeros(5), np.zeros(5, dtype=bool), tonic=2) is None
