"""What the harmony stage hands on: chord segments on the beat grid."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from isai.theory.chords import QUALITIES, Chord

Vector = np.ndarray[Any, np.dtype[np.float64]]


@dataclass(frozen=True)
class Segment:
    start: float
    end: float
    chord: Chord


@dataclass
class Harmony:
    """Chord segments as arrays, for the cache. `bass` is -1 where there's no slash."""

    start: Vector
    end: Vector
    root: Vector
    quality: Vector
    """Index into `QUALITIES`."""
    bass: Vector
    confidence: float
    recogniser: str

    @staticmethod
    def build(segments: list[Segment], confidence: float, recogniser: str) -> Harmony:
        return Harmony(
            start=np.array([s.start for s in segments], dtype=np.float64),
            end=np.array([s.end for s in segments], dtype=np.float64),
            root=np.array([s.chord.root for s in segments], dtype=np.float64),
            quality=np.array(
                [QUALITIES.index(s.chord.quality) for s in segments], dtype=np.float64
            ),
            bass=np.array(
                [-1 if s.chord.bass is None else s.chord.bass for s in segments], dtype=np.float64
            ),
            confidence=round(confidence, 4),
            recogniser=recogniser,
        )

    def segments(self) -> list[Segment]:
        out: list[Segment] = []
        for start, end, root, quality, bass in zip(
            self.start.tolist(),
            self.end.tolist(),
            self.root.tolist(),
            self.quality.tolist(),
            self.bass.tolist(),
            strict=True,
        ):
            chord = Chord(int(root), QUALITIES[int(quality)], None if bass < 0 else int(bass))
            out.append(Segment(float(start), float(end), chord))
        return out
