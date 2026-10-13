"""Scales as pitch classes from a tonic and a mode."""

from __future__ import annotations

from typing import Literal, get_args

from isai.theory.pitch import name_to_pitch_class

ScaleMode = Literal[
    "major",
    "minor",
    "ionian",
    "dorian",
    "phrygian",
    "lydian",
    "mixolydian",
    "aeolian",
    "locrian",
    "harmonic-minor",
    "melodic-minor",
]

SCALE_MODES: tuple[ScaleMode, ...] = get_args(ScaleMode)

_MAJOR = (0, 2, 4, 5, 7, 9, 11)
_NATURAL_MINOR = (0, 2, 3, 5, 7, 8, 10)

INTERVALS: dict[ScaleMode, tuple[int, ...]] = {
    "major": _MAJOR,
    "minor": _NATURAL_MINOR,
    "ionian": _MAJOR,
    "dorian": (0, 2, 3, 5, 7, 9, 10),
    "phrygian": (0, 1, 3, 5, 7, 8, 10),
    "lydian": (0, 2, 4, 6, 7, 9, 11),
    "mixolydian": (0, 2, 4, 5, 7, 9, 10),
    "aeolian": _NATURAL_MINOR,
    "locrian": (0, 1, 3, 5, 6, 8, 10),
    "harmonic-minor": (0, 2, 3, 5, 7, 8, 11),
    "melodic-minor": (0, 2, 3, 5, 7, 9, 11),
}


def scale(tonic: int | str, mode: ScaleMode) -> list[int]:
    """Pitch classes of `mode` on `tonic`, in scale order: scale("G", "major") -> [7, 9, 11, ...].

    `tonic` is a pitch class (0-11) or a note name such as "F#" or "Bb".
    """
    if isinstance(tonic, str):
        tonic_pc = name_to_pitch_class(tonic)
    else:
        if not 0 <= tonic <= 11:
            raise ValueError(f"tonic pitch class must be 0-11, got {tonic}")
        tonic_pc = tonic
    intervals = INTERVALS.get(mode)
    if intervals is None:
        raise ValueError(f"unknown mode {mode!r}; expected one of {', '.join(SCALE_MODES)}")
    return [(tonic_pc + step) % 12 for step in intervals]
