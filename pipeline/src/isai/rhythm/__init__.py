"""Rhythm: beats, downbeats, tempo, metre and stability."""

from __future__ import annotations

import numpy as np

from isai.rhythm.derive import bpm, is_stable, metre, stability, tempo_confidence
from isai.rhythm.tracker import BeatTracker, LibrosaTracker, Samples, TrackedBeats
from isai.rhythm.types import Rhythm

RHYTHM_VERSION = "1"

__all__ = [
    "RHYTHM_VERSION",
    "BeatTracker",
    "LibrosaTracker",
    "Rhythm",
    "TrackedBeats",
    "analyse_rhythm",
]

# Times are rounded to the millisecond, so the Song doesn't change with float noise.
_DECIMALS = 3


def analyse_rhythm(samples: Samples, rate: int, tracker: BeatTracker) -> Rhythm:
    """Track the beats and derive tempo, metre and stability from them."""
    tracked = tracker.track(samples, rate)
    beats = np.round(np.asarray(tracked.beats, dtype=np.float64), _DECIMALS)
    downbeats = np.round(np.asarray(tracked.downbeats, dtype=np.float64), _DECIMALS)
    beat_list = beats.tolist()
    tempo = bpm(beat_list)
    found = metre(beat_list, downbeats.tolist())
    cv = stability(beat_list)
    return Rhythm(
        beats=beats,
        downbeats=downbeats,
        bpm=round(tempo, 2) if tempo is not None else 120.0,
        beats_per_bar=found.beats_per_bar,
        metre_confidence=found.confidence,
        stability=round(cv, 4) if cv is not None else 0.0,
        stable=is_stable(beat_list),
        confidence=tempo_confidence(beat_list),
        tracker=f"{tracker.name}-{tracker.version}",
    )
