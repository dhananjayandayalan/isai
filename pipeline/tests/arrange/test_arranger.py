from hypothesis import given, settings
from hypothesis import strategies as st

from isai.arrange import LEVELS, arrange
from isai.arrange.accompany import bass_note, block_tones, closest_voicing, left_hand, voicings
from isai.arrange.constraints import check
from isai.arrange.melody import (
    cap_rate,
    choose_division,
    phrases,
    place_octave,
    quantise,
    right_hand,
    top_line,
)
from isai.harmony.types import Segment
from isai.theory.chords import QUALITIES, Chord
from isai.transcribe.types import TNote

BEAT = 0.5
BEATS = [i * BEAT for i in range(32)]
DOWNBEATS = BEATS[::4]
SIXTEENTH = BEAT / 4


def n(start: float, end: float, midi: int, velocity: int = 80) -> TNote:
    return TNote(start, end, midi, velocity)


# ------------------------------------------------------------------ right hand


def test_top_line_keeps_the_highest_note_of_each_onset() -> None:
    line = top_line([n(0, 1, 60), n(0, 1, 67), n(0.5, 1, 64)])
    assert [(x.start, x.end, x.midi) for x in line] == [(0, 0.5, 67), (0.5, 1, 64)]


def test_phrases_move_by_whole_octaves_into_c4_c6() -> None:
    low = [n(0, 0.5, 48), n(0.5, 1, 50), n(1, 1.5, 55)]  # C3 D3 G3
    assert [x.midi for x in place_octave(low)] == [60, 62, 67]
    wide = [n(0, 0.5, 58), n(0.5, 1, 86)]  # one note fits either way: a tie goes up
    assert [x.midi for x in place_octave(wide)] == [70, 98]
    assert [x.midi for x in place_octave([n(0, 1, 72)])] == [72]  # already in range


def test_phrases_split_at_rests_of_a_beat() -> None:
    notes = [n(0, 0.5, 60), n(0.5, 1, 62), n(2, 2.5, 64)]
    assert [len(p) for p in phrases(notes, BEAT)] == [2, 1]


def test_the_grid_is_the_coarsest_that_explains_the_onsets() -> None:
    eighths = [n(i * 0.25, i * 0.25 + 0.2, 60 + i) for i in range(8)]
    assert choose_division(eighths, BEATS, BEAT) == 2
    triplets = [n(i * BEAT / 3, i * BEAT / 3 + 0.1, 60 + i) for i in range(9)]
    assert choose_division(triplets, BEATS, BEAT) == 3
    sixteenths = [n(i * 0.125, i * 0.125 + 0.1, 60 + i % 12) for i in range(16)]
    assert choose_division(sixteenths, BEATS, BEAT) == 4
    assert choose_division([], BEATS, BEAT) == 2


def test_quantising_snaps_onsets_and_keeps_one_line() -> None:
    snapped = quantise([n(0.02, 0.48, 60), n(0.27, 0.6, 62), n(0.26, 0.4, 64)], BEATS, BEAT, 2)
    assert [(x.start, x.end, x.midi) for x in snapped] == [(0.0, 0.25, 60), (0.25, 0.5, 62)]


def test_note_rate_caps_by_level() -> None:
    busy = [n(i * 0.125, i * 0.125 + 0.12, 72) for i in range(8)]  # four per beat
    assert len(cap_rate(busy, BEATS, BEAT, 2)) == 4
    assert len(cap_rate(busy, BEATS, BEAT, None)) == 8
    kept = cap_rate(busy, BEATS, BEAT, 1)
    assert [x.start for x in kept] == [0.0, 0.5]  # the on-beat notes


def test_right_hand_drops_grace_notes() -> None:
    melody = [n(0, 0.05, 74), n(0.05, 0.5, 72), n(0.5, 1, 74)]
    assert [x.midi for x in right_hand(melody, BEATS, 120, "full")] == [72, 74]


# ------------------------------------------------------------------ left hand

C, F, G, AM = Chord(0, "maj"), Chord(5, "maj"), Chord(7, "maj"), Chord(9, "min")


def segs(chords: list[Chord], beats_each: int = 4) -> list[Segment]:
    span = beats_each * BEAT
    return [Segment(i * span, (i + 1) * span, c) for i, c in enumerate(chords)]


def test_bass_and_block_tones() -> None:
    assert bass_note(G) == 43 and bass_note(Chord(7, "maj", 11)) == 47
    assert block_tones(Chord(7, "7")) == [7, 11, 5]  # the seventh replaces the fifth
    assert all(v[0] >= 43 and v[-1] <= 60 for v in voicings(AM))


def test_voice_leading_picks_the_closest_inversion() -> None:
    c = closest_voicing(C, None)
    f = closest_voicing(F, c)
    assert sum(min(abs(a - b) for b in c) for a in f) <= 3  # C to F: common tone, steps


def test_easy_plays_the_bass_at_changes_and_bars() -> None:
    notes = left_hand(segs([C, C, G]), BEATS, DOWNBEATS, 4, "easy", 6.0)
    assert [(x.start, x.end, x.midi) for x in notes] == [
        (0.0, 2.0, 36),
        (2.0, 4.0, 36),
        (4.0, 6.0, 43),
    ]


def test_medium_plays_block_chords_on_1_and_3() -> None:
    notes = left_hand(segs([C]), BEATS, DOWNBEATS, 4, "medium", 2.0)
    assert sorted({x.start for x in notes}) == [0.0, 1.0]
    assert len([x for x in notes if x.start == 0.0]) == 3


def test_medium_waltz_is_bass_then_chords() -> None:
    beats = [i * BEAT for i in range(12)]
    notes = left_hand(segs([C], beats_each=3), beats, beats[::3], 3, "medium", 1.5)
    starts = sorted({x.start for x in notes})
    assert starts == [0.0, 0.5, 1.0]
    assert [x.midi for x in notes if x.start == 0.0] == [36]


def test_full_plays_broken_chords_with_a_passing_bass() -> None:
    notes = left_hand(segs([C, G]), BEATS, DOWNBEATS, 4, "full", 4.0)
    assert [x.midi for x in notes[:4]] == [36, 43, 48, 43]  # 1 5 8 5
    before_change = [x for x in notes if 1.74 < x.start < 2.0]
    assert before_change and before_change[0].midi == 41  # a step below G2


def test_full_waltz_arpeggio() -> None:
    beats = [i * BEAT for i in range(6)]
    notes = left_hand(segs([C], beats_each=3), beats, beats[::3], 3, "full", 1.5)
    assert [x.midi for x in notes] == [36, 43, 48]


def test_no_chords_no_left_hand() -> None:
    assert left_hand([], BEATS, DOWNBEATS, 4, "medium", 4.0) == []
    assert left_hand(segs([C]), [0.0], [0.0], 4, "medium", 4.0) == []


# ------------------------------------------------------------------ the whole arranger


def test_an_arrangement_is_playable_at_every_level() -> None:
    melody = [
        n(i * BEAT, i * BEAT + 0.45, m) for i, m in enumerate([64, 62, 60, 62, 64, 64, 64, 0])
    ]
    melody = [x for x in melody if x.midi]
    for level in LEVELS:
        notes = arrange(melody, segs([C, G]), BEATS, DOWNBEATS, 4, 120, level, 4.0)
        assert check(notes, SIXTEENTH) == []
        assert {x.hand for x in notes} == {"left", "right"}


chords = st.builds(Chord, st.integers(0, 11), st.sampled_from(QUALITIES))
melody_notes = st.lists(
    st.tuples(st.integers(0, 63), st.integers(1, 8), st.integers(36, 96), st.integers(1, 127)),
    max_size=40,
)


@settings(max_examples=60, deadline=None)
@given(
    progression=st.lists(chords, min_size=1, max_size=8),
    raw=melody_notes,
    level=st.sampled_from(LEVELS),
    waltz=st.booleans(),
)
def test_any_input_gives_a_playable_identical_arrangement(
    progression: list[Chord], raw: list[tuple[int, int, int, int]], level: str, waltz: bool
) -> None:
    per_bar = 3 if waltz else 4
    beats = [i * BEAT for i in range(32)]
    end = 16.0
    melody = [n(s * 0.25, s * 0.25 + d * 0.125, m, v) for s, d, m, v in raw]
    segments = [Segment(i * 2.0, (i + 1) * 2.0, c) for i, c in enumerate(progression)]
    first = arrange(melody, segments, beats, beats[::per_bar], per_bar, 120, level, end)  # type: ignore[arg-type]
    again = arrange(melody, segments, beats, beats[::per_bar], per_bar, 120, level, end)  # type: ignore[arg-type]
    assert check(first, SIXTEENTH) == []
    assert first == again
    assert all(0 <= x.start < x.end <= end for x in first)


def test_left_hand_bars_follow_the_detected_bar_starts_after_a_missed_beat() -> None:
    # A 3-beat bar (a missed beat) at the start: the next bar still begins on its downbeat.
    beats = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]
    downbeats = [0.0, 1.5]
    notes = left_hand(segs([C], beats_each=8), beats, downbeats, 4, "medium", 4.0)
    starts = sorted({x.start for x in notes})
    assert 1.5 in starts and 2.5 in starts  # beats 1 and 3 of the bar starting at 1.5
