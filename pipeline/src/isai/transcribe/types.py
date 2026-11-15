"""What the transcription stages hand on: notes, pedal spans and pitch tracks."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

Vector = np.ndarray[Any, np.dtype[np.float64]]


@dataclass(frozen=True)
class TNote:
    """One transcribed note, in seconds on the ingested (trimmed) audio."""

    start: float
    end: float
    midi: int
    velocity: int


@dataclass(frozen=True)
class PedalSpan:
    """The sustain pedal held from `start` to `end` (seconds)."""

    start: float
    end: float


@dataclass
class F0Track:
    """A pitch track on a fixed hop: f0 in Hz (0 where unvoiced) and voicing confidence."""

    times: Vector
    """Frame centres in seconds."""
    hz: Vector
    confidence: Vector
    """0 to 1: how sure the tracker is that the frame is voiced."""
    rms: Vector
    """Frame loudness (linear RMS), for velocities."""


@dataclass
class Notes:
    """A stage's note output, cached as arrays (one row per note)."""

    start: Vector
    end: Vector
    midi: Vector
    velocity: Vector
    confidence: float
    """0 to 1, `meta.confidence.notes` in the Song."""
    pedal_start: Vector
    pedal_end: Vector

    @staticmethod
    def build(
        notes: list[TNote], confidence: float, pedals: list[PedalSpan] | None = None
    ) -> Notes:
        ordered = sorted(notes, key=lambda n: (n.start, n.midi, n.end))
        spans = pedals or []
        return Notes(
            start=np.array([n.start for n in ordered], dtype=np.float64),
            end=np.array([n.end for n in ordered], dtype=np.float64),
            midi=np.array([n.midi for n in ordered], dtype=np.float64),
            velocity=np.array([n.velocity for n in ordered], dtype=np.float64),
            confidence=confidence,
            pedal_start=np.array([p.start for p in spans], dtype=np.float64),
            pedal_end=np.array([p.end for p in spans], dtype=np.float64),
        )

    def list(self) -> list[TNote]:
        return [
            TNote(float(s), float(e), int(m), int(v))
            for s, e, m, v in zip(
                self.start.tolist(),
                self.end.tolist(),
                self.midi.tolist(),
                self.velocity.tolist(),
                strict=True,
            )
        ]
