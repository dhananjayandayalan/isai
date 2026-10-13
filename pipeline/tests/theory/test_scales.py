from typing import Any

import pytest

from isai.theory.scales import INTERVALS, MODES, Mode, scale


@pytest.mark.parametrize(
    ("tonic", "mode", "expected"),
    [
        ("C", "major", [0, 2, 4, 5, 7, 9, 11]),
        ("G", "major", [7, 9, 11, 0, 2, 4, 6]),
        ("F", "major", [5, 7, 9, 10, 0, 2, 4]),
        ("A", "minor", [9, 11, 0, 2, 4, 5, 7]),
        ("D", "dorian", [2, 4, 5, 7, 9, 11, 0]),
        ("E", "phrygian", [4, 5, 7, 9, 11, 0, 2]),
        ("F", "lydian", [5, 7, 9, 11, 0, 2, 4]),
        ("G", "mixolydian", [7, 9, 11, 0, 2, 4, 5]),
        ("B", "locrian", [11, 0, 2, 4, 5, 7, 9]),
        ("A", "harmonic-minor", [9, 11, 0, 2, 4, 5, 8]),
        ("A", "melodic-minor", [9, 11, 0, 2, 4, 6, 8]),
        ("Bb", "major", [10, 0, 2, 3, 5, 7, 9]),
        ("F#", "minor", [6, 8, 9, 11, 1, 2, 4]),
    ],
)
def test_scale(tonic: str, mode: Any, expected: list[int]) -> None:
    assert scale(tonic, mode) == expected


def test_scale_accepts_pitch_class_tonic() -> None:
    assert scale(7, "major") == scale("G", "major")


def test_aliases_match() -> None:
    assert scale("C", "ionian") == scale("C", "major")
    assert scale("A", "aeolian") == scale("A", "minor")


def test_modes_of_c_major_share_pitch_classes() -> None:
    c_major = set(scale("C", "major"))
    rotations: list[tuple[str, Mode]] = [
        ("D", "dorian"),
        ("E", "phrygian"),
        ("F", "lydian"),
        ("G", "mixolydian"),
        ("A", "aeolian"),
        ("B", "locrian"),
    ]
    for tonic, mode in rotations:
        assert set(scale(tonic, mode)) == c_major


def test_every_mode_has_intervals_starting_on_tonic() -> None:
    assert set(MODES) == set(INTERVALS)
    for mode in MODES:
        steps = INTERVALS[mode]
        assert steps[0] == 0
        assert len(set(steps)) == len(steps) == 7
        assert list(steps) == sorted(steps)


@pytest.mark.parametrize("tonic", [-1, 12])
def test_scale_rejects_bad_tonic(tonic: int) -> None:
    with pytest.raises(ValueError, match="0-11"):
        scale(tonic, "major")


def test_scale_rejects_bad_name() -> None:
    with pytest.raises(ValueError, match="not a note name"):
        scale("H", "major")


def test_scale_rejects_unknown_mode() -> None:
    bad: Any = "bebop"
    with pytest.raises(ValueError, match="unknown mode 'bebop'"):
        scale("C", bad)
