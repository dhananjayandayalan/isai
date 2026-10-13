import pytest

from isai.theory.pitch import (
    midi_to_name,
    name_to_midi,
    name_to_pitch_class,
    pitch_class_to_name,
)


@pytest.mark.parametrize(
    ("pc", "sharp", "flat"),
    [(0, "C", "C"), (1, "C#", "Db"), (3, "D#", "Eb"), (4, "E", "E"), (10, "A#", "Bb")],
)
def test_pitch_class_to_name(pc: int, sharp: str, flat: str) -> None:
    assert pitch_class_to_name(pc) == sharp
    assert pitch_class_to_name(pc, prefer="sharp") == sharp
    assert pitch_class_to_name(pc, prefer="flat") == flat


@pytest.mark.parametrize("pc", [-1, 12])
def test_pitch_class_to_name_out_of_range(pc: int) -> None:
    with pytest.raises(ValueError, match="0-11"):
        pitch_class_to_name(pc)


@pytest.mark.parametrize(
    ("name", "pc"),
    [
        ("C", 0),
        ("C#", 1),
        ("Db", 1),
        ("E♭", 3),
        ("F♯", 6),
        ("B#", 0),
        ("Cb", 11),
        ("Fb", 4),
        ("E#", 5),
        ("C##", 2),
        ("Dbb", 0),
        ("g", 7),
        ("bb", 10),
        (" A ", 9),
    ],
)
def test_name_to_pitch_class(name: str, pc: int) -> None:
    assert name_to_pitch_class(name) == pc


@pytest.mark.parametrize("name", ["", "H", "C#b", "C###", "C4", "Do", "#"])
def test_name_to_pitch_class_rejects(name: str) -> None:
    with pytest.raises(ValueError, match="not a note name"):
        name_to_pitch_class(name)


def test_round_trip_every_pitch_class() -> None:
    for pc in range(12):
        assert name_to_pitch_class(pitch_class_to_name(pc, "sharp")) == pc
        assert name_to_pitch_class(pitch_class_to_name(pc, "flat")) == pc


@pytest.mark.parametrize(
    ("midi", "sharp", "flat"),
    [
        (60, "C4", "C4"),
        (61, "C#4", "Db4"),
        (69, "A4", "A4"),
        (21, "A0", "A0"),
        (108, "C8", "C8"),
        (0, "C-1", "C-1"),
        (127, "G9", "G9"),
    ],
)
def test_midi_to_name(midi: int, sharp: str, flat: str) -> None:
    assert midi_to_name(midi) == sharp
    assert midi_to_name(midi, prefer="flat") == flat


@pytest.mark.parametrize("midi", [-1, 128])
def test_midi_to_name_out_of_range(midi: int) -> None:
    with pytest.raises(ValueError, match="0-127"):
        midi_to_name(midi)


@pytest.mark.parametrize(
    ("name", "midi"),
    [
        ("C4", 60),
        ("Cb4", 59),
        ("B#3", 60),
        ("A4", 69),
        ("Bb3", 58),
        ("E♭5", 75),
        ("C-1", 0),
        ("G9", 127),
        ("A0", 21),
    ],
)
def test_name_to_midi(name: str, midi: int) -> None:
    assert name_to_midi(name) == midi


@pytest.mark.parametrize("name", ["C", "H4", "C#b4", "4", "C4.5"])
def test_name_to_midi_rejects_bad_names(name: str) -> None:
    with pytest.raises(ValueError, match="not a note name with octave"):
        name_to_midi(name)


@pytest.mark.parametrize("name", ["Cb-1", "G#9", "C10"])
def test_name_to_midi_out_of_range(name: str) -> None:
    with pytest.raises(ValueError, match="0-127"):
        name_to_midi(name)


def test_midi_round_trip() -> None:
    for midi in range(128):
        assert name_to_midi(midi_to_name(midi, "sharp")) == midi
        assert name_to_midi(midi_to_name(midi, "flat")) == midi
