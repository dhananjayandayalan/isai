import pytest

from isai.theory.chords import (
    QUALITIES,
    Chord,
    all_chords,
    diatonic,
    label,
    primary_triads,
    template,
    uses_flats,
)


@pytest.mark.parametrize(
    ("chord", "flats", "text"),
    [
        (Chord(7, "maj"), False, "G"),
        (Chord(4, "min7"), False, "Em7"),
        (Chord(2, "maj", bass=6), False, "D/F#"),
        (Chord(10, "maj"), True, "Bb"),
        (Chord(10, "maj"), False, "A#"),
        (Chord(1, "dim"), True, "Dbdim"),
        (Chord(0, "maj7"), False, "Cmaj7"),
        (Chord(7, "7"), False, "G7"),
        (Chord(2, "sus4"), False, "Dsus4"),
        (Chord(0, "maj", bass=0), False, "C"),  # a bass equal to the root is no slash
    ],
)
def test_labels_use_one_style_spelled_to_the_key(chord: Chord, flats: bool, text: str) -> None:
    assert label(chord, flats) == text


@pytest.mark.parametrize(
    ("key", "mode", "flats"),
    [("F", "major", True), ("Bb", "major", True), ("G", "major", False), ("D", "minor", True),
     ("E", "minor", False), ("C", "major", False), ("C", "minor", True)],
)  # fmt: skip
def test_flat_keys(key: str, mode: str, flats: bool) -> None:
    assert uses_flats(key, mode) is flats


def test_tones_start_at_the_root() -> None:
    assert Chord(9, "min7").tones() == (9, 0, 4, 7)
    assert Chord(11, "dim").tones() == (11, 2, 5)


def test_templates_are_unit_length_with_a_stronger_root() -> None:
    t = template(Chord(7, "maj"))
    assert sum(x * x for x in t) == pytest.approx(1.0)
    assert t[7] > t[11] == t[2] > 0
    assert t[0] == 0


def test_all_chords_covers_every_root_and_quality() -> None:
    chords = all_chords()
    assert len(chords) == 12 * len(QUALITIES)
    assert len(set(chords)) == len(chords)


def test_diatonic_sets() -> None:
    c_major = diatonic(0, "major")
    assert {Chord(0, "maj"), Chord(5, "maj"), Chord(7, "7"), Chord(9, "min")} <= c_major
    assert Chord(1, "maj") not in c_major
    a_minor = diatonic(9, "minor")
    assert {Chord(9, "min"), Chord(4, "maj"), Chord(4, "7"), Chord(5, "maj")} <= a_minor


def test_primary_triads_come_in_order_of_preference() -> None:
    assert primary_triads(7, "major")[:3] == [Chord(7, "maj"), Chord(0, "maj"), Chord(2, "maj")]
    assert primary_triads(9, "minor")[:3] == [Chord(9, "min"), Chord(2, "min"), Chord(4, "maj")]
