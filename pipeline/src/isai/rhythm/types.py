"""What the rhythm stage hands on."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

Times = np.ndarray[Any, np.dtype[np.float64]]


@dataclass
class Rhythm:
    """Beats and bars, in seconds on the ingested (trimmed) audio."""

    beats: Times
    downbeats: Times
    bpm: float
    beats_per_bar: int
    metre_confidence: float
    stability: float
    """Coefficient of variation of the beat intervals."""
    stable: bool
    confidence: float
    """`confidence.tempo` in the Song."""
    tracker: str
