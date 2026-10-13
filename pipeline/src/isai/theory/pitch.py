"""Pitch classes, note names and MIDI numbers.

Pitch class 0 is C. MIDI 60 is C4 (scientific pitch notation, middle C).
"""

from __future__ import annotations

import re
from typing import Literal

Prefer = Literal["sharp", "flat"]

SHARP_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
FLAT_NAMES = ("C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B")

LETTER_PCS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_ACCIDENTAL_OFFSET = {"#": 1, "♯": 1, "b": -1, "♭": -1}

MIDI_MIN = 0
MIDI_MAX = 127

_NAME_RE = re.compile(r"^([A-Ga-g])(#{1,2}|♯{1,2}|b{1,2}|♭{1,2})?$")
_NOTE_RE = re.compile(r"^([A-Ga-g])(#{1,2}|♯{1,2}|b{1,2}|♭{1,2})?(-?\d+)$")


def _check_pitch_class(pc: int) -> None:
    if not 0 <= pc <= 11:
        raise ValueError(f"pitch class must be 0-11, got {pc}")


def _check_midi(midi: int) -> None:
    if not MIDI_MIN <= midi <= MIDI_MAX:
        raise ValueError(f"MIDI note must be {MIDI_MIN}-{MIDI_MAX}, got {midi}")


def _offset(letter: str, accidentals: str | None) -> int:
    """Semitones from C for a letter plus accidentals, not wrapped (Cb -> -1, B# -> 12)."""
    acc = accidentals or ""
    return LETTER_PCS[letter.upper()] + sum(_ACCIDENTAL_OFFSET[a] for a in acc)


def pitch_class_to_name(pc: int, prefer: Prefer = "sharp") -> str:
    """Name a pitch class, spelling black keys with sharps or flats: 1 -> "C#" or "Db"."""
    _check_pitch_class(pc)
    return (SHARP_NAMES if prefer == "sharp" else FLAT_NAMES)[pc]


def name_to_pitch_class(name: str) -> int:
    """Pitch class of a note name without octave: "C#", "Db", "E♭", "B#" (0), "Cb" (11)."""
    match = _NAME_RE.match(name.strip())
    if not match:
        raise ValueError(f"not a note name: {name!r}")
    return _offset(match.group(1), match.group(2)) % 12


def midi_to_name(midi: int, prefer: Prefer = "sharp") -> str:
    """Name a MIDI note with octave: 60 -> "C4", 61 -> "C#4" or "Db4"."""
    _check_midi(midi)
    octave = midi // 12 - 1
    return f"{pitch_class_to_name(midi % 12, prefer)}{octave}"


def name_to_midi(name: str) -> int:
    """MIDI number of a note name with octave: "C4" -> 60, "Cb4" -> 59, "B#3" -> 60.

    The octave belongs to the letter, so accidentals can cross an octave boundary.
    """
    match = _NOTE_RE.match(name.strip())
    if not match:
        raise ValueError(f"not a note name with octave: {name!r}")
    midi = (int(match.group(3)) + 1) * 12 + _offset(match.group(1), match.group(2))
    _check_midi(midi)
    return midi
