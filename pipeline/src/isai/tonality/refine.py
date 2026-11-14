"""Tonality refined with transcribed notes, and the singer's tonic in Hz. Pure: no audio.

The key score blends the audio chroma (P3) with a duration-weighted pitch-class histogram
of the notes, each normalised to sum to one: `(1 - w) * chroma + w * notes`. The weight
starts at `NOTE_WEIGHT` and is to be tuned on the golden set.
"""

from __future__ import annotations

import dataclasses
from collections import Counter
from collections.abc import Sequence
from typing import Any

import numpy as np

from isai.theory.keyfinding import KeyMode, find_key, key_name, modal_scale
from isai.theory.scales import scale
from isai.tonality import Tonality
from isai.transcribe.types import TNote

Vector = np.ndarray[Any, np.dtype[np.float64]]

NOTE_WEIGHT = 0.5


def pitch_class_histogram(notes: Sequence[TNote]) -> Vector:
    """Seconds of sounding time per pitch class (C first)."""
    out = np.zeros(12)
    for note in notes:
        out[note.midi % 12] += max(0.0, note.end - note.start)
    return out


def _unit(values: Vector) -> Vector:
    total = float(values.sum())
    return values / total if total > 0 else values


def blend(chroma: Vector, histogram: Vector, weight: float = NOTE_WEIGHT) -> Vector:
    """The two profiles normalised and mixed; either alone when the other is empty."""
    c, h = _unit(chroma), _unit(histogram)
    if not h.any():
        return c
    if not c.any():
        return h
    return (1 - weight) * c + weight * h


def refine(tonality: Tonality, notes: Sequence[TNote], weight: float = NOTE_WEIGHT) -> Tonality:
    """The key re-read from the chroma and the notes together; unchanged without notes."""
    histogram = pitch_class_histogram(notes)
    if not histogram.any():
        return tonality
    profile = blend(tonality.chroma, histogram, weight)
    estimate = find_key([float(x) for x in profile])
    if estimate is None:
        return tonality
    mode: KeyMode = estimate.mode
    notes_of_scale = (
        modal_scale(profile.tolist(), estimate.tonic)[1]
        if mode == "modal"
        else scale(estimate.tonic, mode)
    )
    return dataclasses.replace(
        tonality,
        tonic=estimate.tonic,
        key=key_name(estimate.tonic, mode),
        mode=mode,
        scale=list(notes_of_scale),
        confidence=estimate.confidence,
        chroma=np.round(profile / (profile.max() or 1.0), 6),
    )


def tonic_hz(hz: Vector, voiced: Any, tonic: int, tuning_cents: float = 0.0) -> float | None:
    """The tonic's mean frequency in the octave the singer uses it most, or None.

    Frames count when their pitch, corrected by the tuning, rounds to the tonic's pitch
    class; the frequencies themselves are the measured ones, so the answer is the
    singer's own shruti, tuning included.
    """
    mask = np.asarray(voiced, dtype=bool) & (hz > 0)
    if not mask.any():
        return None
    measured = hz[mask]
    semis = 69 + 12 * np.log2(measured / 440.0) - tuning_cents / 100
    nearest = np.round(semis).astype(np.int64)
    on_tonic = nearest % 12 == tonic
    if not on_tonic.any():
        return None
    used: list[int] = [int(o) for o in (nearest[on_tonic] // 12)]
    octaves = Counter(used)
    octave = min(octaves, key=lambda o: (-octaves[o], o))
    chosen = measured[on_tonic & (nearest // 12 == octave)]
    return round(float(np.mean(chosen)), 2)
