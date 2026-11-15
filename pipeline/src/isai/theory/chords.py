"""Chords: qualities, templates, diatonic sets and labels. Pure music theory.

Qualities use the schema's Harte-style shorthand. Labels use one style everywhere
(`G`, `Em7`, `D/F#`), spelled with flats in flat keys (`Bb` in F major).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from isai.theory.pitch import FLAT_NAMES, SHARP_NAMES

Quality = Literal["maj", "min", "7", "maj7", "min7", "dim", "sus4"]

# The qualities P5 recognises, simplest first (ties go to the earlier one).
QUALITIES: tuple[Quality, ...] = ("maj", "min", "7", "min7", "maj7", "dim", "sus4")

INTERVALS: dict[Quality, tuple[int, ...]] = {
    "maj": (0, 4, 7),
    "min": (0, 3, 7),
    "7": (0, 4, 7, 10),
    "maj7": (0, 4, 7, 11),
    "min7": (0, 3, 7, 10),
    "dim": (0, 3, 6),
    "sus4": (0, 5, 7),
}

SUFFIX: dict[Quality, str] = {
    "maj": "",
    "min": "m",
    "7": "7",
    "maj7": "maj7",
    "min7": "m7",
    "dim": "dim",
    "sus4": "sus4",
}

# Keys whose signatures use flats (major tonic names, and minor tonics).
_FLAT_MAJOR = {"F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"}
_FLAT_MINOR = {"D", "G", "C", "F", "Bb", "Eb", "Ab"}


@dataclass(frozen=True)
class Chord:
    root: int
    quality: Quality
    bass: int | None = None
    """Bass pitch class when it differs from the root (a slash chord)."""

    def tones(self) -> tuple[int, ...]:
        """The chord's pitch classes, root first."""
        return tuple((self.root + i) % 12 for i in INTERVALS[self.quality])


def uses_flats(key: str, mode: str) -> bool:
    """Whether a key's signature is written with flats (F major, D minor, Bb, ...)."""
    return key in (_FLAT_MINOR if mode == "minor" else _FLAT_MAJOR)


def label(chord: Chord, flats: bool = False) -> str:
    """`G`, `Em7`, `Bbmaj7`, `D/F#`."""
    names = FLAT_NAMES if flats else SHARP_NAMES
    text = names[chord.root] + SUFFIX[chord.quality]
    if chord.bass is not None and chord.bass != chord.root:
        text += "/" + names[chord.bass]
    return text


def template(chord: Chord) -> list[float]:
    """A 12-bin chroma template: chord tones on, the root a little stronger, unit length."""
    bins = [0.0] * 12
    for i, pc in enumerate(chord.tones()):
        bins[pc] = 1.2 if i == 0 else 1.0
    norm = sum(b * b for b in bins) ** 0.5
    return [b / norm for b in bins]


def all_chords(qualities: tuple[Quality, ...] = QUALITIES) -> list[Chord]:
    """Every root with every quality, in a stable order."""
    return [Chord(root, q) for q in qualities for root in range(12)]


def diatonic(tonic: int, mode: str) -> set[Chord]:
    """The key's diatonic triads and sevenths (harmonic-minor V and V7 in minor).

    Modal keys are treated as major here; their chords still score on the audio.
    """
    if mode == "minor":
        steps = [
            (0, "min"), (2, "dim"), (3, "maj"), (5, "min"), (7, "min"), (7, "maj"),
            (8, "maj"), (10, "maj"),
            (0, "min7"), (3, "maj7"), (5, "min7"), (7, "7"), (8, "maj7"), (10, "7"),
        ]  # fmt: skip
    else:
        steps = [
            (0, "maj"), (2, "min"), (4, "min"), (5, "maj"), (7, "maj"), (9, "min"),
            (11, "dim"),
            (0, "maj7"), (2, "min7"), (4, "min7"), (5, "maj7"), (7, "7"), (9, "min7"),
            (7, "sus4"), (0, "sus4"),
        ]  # fmt: skip
    return {Chord((tonic + step) % 12, quality) for step, quality in steps}  # pyright: ignore[reportArgumentType]


def primary_triads(tonic: int, mode: str) -> list[Chord]:
    """The triads a simple accompaniment reaches for first: I, IV, V, vi, ii, iii (major),
    or i, iv, V, VI, III, VII (minor)."""
    if mode == "minor":
        steps: list[tuple[int, Quality]] = [
            (0, "min"), (5, "min"), (7, "maj"), (8, "maj"), (3, "maj"), (10, "maj"),
        ]  # fmt: skip
    else:
        steps = [(0, "maj"), (5, "maj"), (7, "maj"), (9, "min"), (2, "min"), (4, "min")]
    return [Chord((tonic + step) % 12, quality) for step, quality in steps]
