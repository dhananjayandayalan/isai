import itertools

from isai.arrange.hands import Hand, assign_hands, split_points
from isai.transcribe.types import TNote

BEATS = [i * 0.5 for i in range(64)]


def n(start: float, midi: int, length: float = 0.4) -> TNote:
    return TNote(start, start + length, midi, 80)


def hands_by_pitch(notes: list[TNote], hands: list[Hand]) -> dict[int, Hand]:
    return {note.midi: hand for note, hand in zip(notes, hands, strict=True)}


def test_an_empty_part_has_no_hands() -> None:
    assert assign_hands([], BEATS) == []
    assert split_points([], BEATS) == {}


def test_melody_only_goes_to_the_right_hand() -> None:
    notes = [n(0, 40), n(0.5, 50), n(1, 70)]
    assert assign_hands(notes, BEATS, melody_only=True) == ["right"] * 3


def test_a_scale_crossing_middle_c_splits_once_near_it() -> None:
    scale = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72]
    notes = [n(i * 0.5, m) for i, m in enumerate(scale)]
    hands = assign_hands(notes, BEATS)
    # One change from left to right, at or just below middle C.
    changes = sum(1 for a, b in itertools.pairwise(hands) if a != b)
    assert changes == 1
    first_right = scale[hands.index("right")]
    assert 55 <= first_right <= 60
    assert hands[0] == "left" and hands[-1] == "right"


def test_a_wide_left_hand_arpeggio_stays_left_under_a_melody() -> None:
    notes: list[TNote] = []
    for bar in range(4):
        t = bar * 2.0
        notes += [n(t, 36), n(t + 0.5, 43), n(t + 1.0, 48), n(t + 1.5, 52)]  # C2 G2 C3 E3
        notes += [n(t, 76, 1.9)]  # a held melody note on E5
    by_pitch = hands_by_pitch(notes, assign_hands(notes, BEATS))
    assert {by_pitch[p] for p in (36, 43, 48, 52)} == {"left"}
    assert by_pitch[76] == "right"


def test_a_chord_on_the_split_is_shared_without_crossing() -> None:
    # A wide chord at one onset: low notes left, high notes right, never interleaved.
    chord = [n(0, p) for p in (41, 48, 57, 64, 72)]
    hands = assign_hands(chord, BEATS)
    pairs = sorted(zip((c.midi for c in chord), hands, strict=True))
    seen_right = False
    for _, hand in pairs:
        if hand == "right":
            seen_right = True
        assert not (seen_right and hand == "left"), "a left note above a right note"
    assert "left" in hands and "right" in hands


def test_the_split_follows_a_melody_dipping_below_middle_c() -> None:
    notes: list[TNote] = []
    melody = [67, 65, 62, 58, 57, 58, 62, 65]  # dips to Bb3 and A3
    for i, m in enumerate(melody):
        t = i * 0.5
        notes += [n(t, m), n(t, 36 + (i % 2) * 7)]  # a low C2/G2 bass under it
    by_note = dict(zip(notes, assign_hands(notes, BEATS), strict=True))
    for note, hand in by_note.items():
        assert hand == ("left" if note.midi < 48 else "right"), note


def test_without_beats_it_uses_half_second_windows() -> None:
    notes = [n(0.0, 40), n(0.1, 72), n(0.6, 41), n(0.7, 74)]
    assert assign_hands(notes, []) == ["left", "right", "left", "right"]


def test_it_is_deterministic() -> None:
    notes = [n(i * 0.25, 40 + (i * 7) % 40) for i in range(40)]
    assert assign_hands(notes, BEATS) == assign_hands(notes, BEATS)
