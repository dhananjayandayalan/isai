from isai.harmony.from_melody import chords_from_melody
from isai.harmony.types import Segment
from isai.theory.chords import label
from isai.transcribe.types import TNote

BPM = 120.0
BEAT = 0.5


def grid(bars: int, per_bar: int = 4) -> tuple[list[float], list[float]]:
    beats = [i * BEAT for i in range(bars * per_bar)]
    return beats, beats[::per_bar]


def melody(bars: list[list[int]], per_bar: int = 4) -> list[TNote]:
    """One note per beat; a bar is a list of MIDI notes (or 0 for a rest)."""
    notes: list[TNote] = []
    for b, bar in enumerate(bars):
        for i, midi in enumerate(bar):
            if midi:
                start = (b * per_bar + i) * BEAT
                notes.append(TNote(start, start + BEAT * 0.95, midi, 80))
    return notes


def names(segments: list[Segment]) -> list[str]:
    return [label(s.chord) for s in segments]


def test_a_melody_outlining_i_iv_v_i_gets_those_chords() -> None:
    bars = [[60, 64, 67, 64], [65, 69, 72, 69], [67, 71, 74, 71], [72, 67, 64, 60]]
    beats, downbeats = grid(4)
    segments = chords_from_melody(melody(bars), beats, downbeats, 4, BPM, 0, "major", 8.0)
    assert names(segments) == ["C", "F", "G", "C"]
    assert [(s.start, s.end) for s in segments] == [(0.0, 2.0), (2.0, 4.0), (4.0, 6.0), (6.0, 8.0)]


def test_phrase_ends_get_a_cadence() -> None:
    # Bar 2 sounds like vi (A, C, E), but the phrase ends there: forced to I with V before.
    bars = [[67, 71, 74, 71], [69, 72, 76, 0]]
    beats, downbeats = grid(2)
    segments = chords_from_melody(melody(bars), beats, downbeats, 4, BPM, 0, "major", 4.0)
    assert names(segments) == ["G", "C"]


def test_a_rest_of_a_beat_ends_a_phrase() -> None:
    bars = [[64, 64, 65, 0], [0, 64, 62, 60], [65, 69, 72, 0], [0, 71, 74, 72]]
    beats, downbeats = grid(4)
    segments = chords_from_melody(melody(bars), beats, downbeats, 4, BPM, 0, "major", 8.0)
    by_bar = {s.start: label(s.chord) for s in segments}
    # Bars 0 and 2 end before a two-beat rest: both close a phrase on I, and bar 1, just
    # before bar 2's cadence, gets its V or IV.
    assert by_bar[0.0] == "C"
    assert by_bar[2.0] in ("G", "F")
    assert by_bar[4.0] == "C"
    assert names(segments)[-1] == "C"


def test_at_most_one_chord_per_bar_and_merged_repeats() -> None:
    bars = [[60, 62, 64, 65]] * 3 + [[67, 65, 64, 60]]
    beats, downbeats = grid(4)
    segments = chords_from_melody(melody(bars), beats, downbeats, 4, BPM, 0, "major", 8.0)
    for s in segments:
        assert s.start in downbeats or s.start == 0.0
    assert len({(s.start, s.end) for s in segments}) == len(segments)


def test_waltz_bars_in_minor() -> None:
    bars = [[69, 72, 76], [74, 77, 81], [76, 80, 83], [81, 76, 69]]  # Am Dm E Am
    beats, downbeats = grid(4, per_bar=3)
    segments = chords_from_melody(
        melody(bars, per_bar=3), beats, downbeats, 3, BPM, 9, "minor", 6.0
    )
    assert names(segments) == ["Am", "Dm", "E", "Am"]


def test_slow_songs_change_on_half_bars() -> None:
    bars = [[60, 64, 65, 69], [67, 71, 72, 67]]  # C then F, G then C, within bars
    beats = [i * 1.0 for i in range(8)]
    notes = [
        TNote(i * 1.0, i * 1.0 + 0.95, m, 80) for i, m in enumerate(m for bar in bars for m in bar)
    ]
    segments = chords_from_melody(notes, beats, beats[::4], 4, 60.0, 0, "major", 8.0)
    assert [s.start for s in segments] == [0.0, 2.0, 4.0, 6.0]
    assert names(segments) == ["C", "F", "G", "C"]


def test_no_melody_no_chords() -> None:
    assert chords_from_melody([], [0.0], [0.0], 4, BPM, 0, "major", 4.0) == []
    notes = [TNote(0, 1, 60, 80)]
    assert chords_from_melody(notes, [], [], 4, BPM, 0, "major", 2.0) == [
        chords_from_melody(notes, [], [], 4, BPM, 0, "major", 2.0)[0]
    ]


def test_coverage_is_the_share_of_melody_on_chord_tones() -> None:
    from isai.harmony.from_melody import coverage
    from isai.theory.chords import Chord

    notes = [TNote(0, 1, 60, 80), TNote(1, 2, 62, 80)]  # C then D over C major
    assert coverage(notes, [Segment(0, 2, Chord(0, "maj"))]) == 0.5
    assert coverage(notes, []) == 0.0
