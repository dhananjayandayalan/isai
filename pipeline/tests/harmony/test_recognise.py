import numpy as np
import pytest

from isai.harmony.chroma import audio_chroma, bass_per_beat, beat_edges, blend, notes_chroma
from isai.harmony.recognise import recognise
from isai.harmony.types import Harmony, Segment
from isai.theory.chords import Chord, label, template
from isai.transcribe.types import TNote
from tests.synth import harmonic_note

RATE = 22_050


def progression(chords: list[Chord], beats_each: int = 2, noise: float = 0.05) -> np.ndarray:
    rng = np.random.default_rng(0)
    rows = [template(c) for c in chords for _ in range(beats_each)]
    return np.abs(np.array(rows) + noise * rng.standard_normal((len(rows), 12)))


def labels(segments: list[Segment]) -> list[str]:
    return [label(s.chord) for s in segments]


def run(chords: list[Chord], tonic: int = 0, mode: str = "major", **kw: object):
    chroma = progression(chords)
    edges = [float(i) for i in range(chroma.shape[0] + 1)]
    return recognise(chroma, np.ones(chroma.shape[0]), edges, tonic, mode, **kw)  # type: ignore[arg-type]


def wcsr(found: list[Segment], expected: list[Segment]) -> float:
    total = sum(e.end - e.start for e in expected)
    right = 0.0
    for e in expected:
        for f in found:
            if (f.chord.root, f.chord.quality) == (e.chord.root, e.chord.quality):
                right += max(0.0, min(e.end, f.end) - max(e.start, f.start))
    return right / total


def test_a_pop_progression_is_read_chord_for_chord() -> None:
    chords = [Chord(0, "maj"), Chord(7, "maj"), Chord(9, "min"), Chord(5, "maj")] * 2
    segments, confidence = run(chords)
    assert labels(segments) == ["C", "G", "Am", "F"] * 2
    assert segments[0].start == 0.0 and segments[0].end == 2.0
    assert confidence > 0.5
    expected = [Segment(2.0 * i, 2.0 * i + 2, c) for i, c in enumerate(chords)]
    assert wcsr(segments, expected) >= 0.9


def test_sevenths_are_recognised_in_a_ii_v_i() -> None:
    segments, _ = run([Chord(2, "min7"), Chord(7, "7"), Chord(0, "maj7")])
    assert labels(segments) == ["Dm7", "G7", "Cmaj7"]


def test_staying_is_cheaper_than_flickering() -> None:
    # One noisy beat in a run of C doesn't become its own chord.
    chroma = progression([Chord(0, "maj")] * 6, beats_each=1)
    chroma[3] = 0.6 * np.array(template(Chord(0, "maj"))) + 0.4 * np.array(
        template(Chord(4, "min"))
    )
    segments, _ = recognise(chroma, np.ones(6), [float(i) for i in range(7)], 0, "major")
    assert labels(segments) == ["C"]


def test_the_key_prior_prefers_diatonic_chords_when_the_audio_is_ambiguous() -> None:
    # Equal evidence for E major and E minor: in C major, Em is diatonic.
    mixed = (np.array(template(Chord(4, "maj"))) + np.array(template(Chord(4, "min")))) / 2
    chroma = np.tile(mixed, (4, 1))
    segments, _ = recognise(chroma, np.ones(4), [0.0, 1, 2, 3, 4], 0, "major")
    assert labels(segments) == ["Em"]


def test_a_bass_walk_gives_slash_chords() -> None:
    chords = [Chord(0, "maj")] * 2 + [Chord(7, "maj")] * 2
    segments, _ = run(chords, bass=[0, 0, 0, 0, 11, 11, 11, 11])
    assert labels(segments) == ["C", "G/B"]


def test_silence_has_no_chord() -> None:
    chroma = progression([Chord(0, "maj"), Chord(7, "maj")], beats_each=2)
    chroma = np.vstack([chroma[:2], np.zeros((2, 12)), chroma[2:]])
    energy = np.array([1, 1, 0.0, 0.0, 1, 1])
    segments, _ = recognise(chroma, energy, [float(i) for i in range(7)], 0, "major")
    assert [(label(s.chord), s.start, s.end) for s in segments] == [
        ("C", 0.0, 2.0),
        ("G", 4.0, 6.0),
    ]


def test_nothing_in_nothing_out() -> None:
    assert recognise(np.zeros((0, 12)), np.zeros(0), [0.0], 0, "major") == ([], 0.0)
    assert recognise(np.zeros((2, 12)), np.zeros(2), [0.0, 1.0], 0, "major") == ([], 0.0)


def test_harmony_round_trips_through_arrays() -> None:
    segments = [Segment(0.0, 2.0, Chord(0, "maj")), Segment(2.0, 4.0, Chord(7, "7", 11))]
    harmony = Harmony.build(segments, 0.81234, "templates-1")
    assert harmony.segments() == segments
    assert harmony.confidence == 0.8123


def test_notes_chroma_and_bass_per_beat() -> None:
    notes = [TNote(0.0, 2.0, 36, 127), TNote(0.0, 1.0, 64, 127), TNote(1.0, 2.0, 67, 127)]
    edges = [0.0, 1.0, 2.0]
    chroma, energy = notes_chroma(notes, edges)
    assert chroma[0, 0] == pytest.approx(1.0) and chroma[0, 4] == pytest.approx(1.0)
    assert chroma[1, 7] == pytest.approx(1.0) and chroma[1, 4] == 0
    assert energy.tolist() == pytest.approx([2.0, 2.0])
    assert bass_per_beat(notes, edges) == [0, 0]
    assert bass_per_beat([TNote(0, 1, 72, 80)], [0.0, 1.0]) == [None]


def test_beat_edges_cover_the_song() -> None:
    assert beat_edges([0.5, 1.0, 1.5, 9.0], 2.0) == [0.0, 0.5, 1.0, 1.5, 2.0]
    assert beat_edges([], 3.0) == [0.0, 3.0]


def test_blend_mixes_row_normalised_profiles() -> None:
    a = np.array([[2.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]])
    b = np.array([[0, 0, 0, 0, 0, 0, 0, 4.0, 0, 0, 0, 0]])
    mixed = blend(a, b, 0.25)
    assert mixed[0, 0] == pytest.approx(0.75) and mixed[0, 7] == pytest.approx(0.25)


def test_chords_from_synthesised_audio() -> None:
    chords = [(0, 4, 7), (7, 11, 14), (9, 12, 16), (5, 9, 12)]  # C G Am F
    audio = np.concatenate(
        [sum(harmonic_note(60 + p, 1.0, RATE) for p in chord) for chord in chords for _ in (0, 1)]
    ).astype(np.float32)
    edges = [float(i) for i in range(9)]
    chroma, energy = audio_chroma(audio, RATE, edges)
    segments, _ = recognise(chroma, energy, edges, 0, "major")
    assert labels(segments) == ["C", "G", "Am", "F"]
    assert audio_chroma(np.zeros(10, dtype=np.float32), RATE, edges)[0].shape == (8, 12)
