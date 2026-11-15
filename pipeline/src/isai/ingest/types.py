"""What ingest hands to the rest of the pipeline."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

Samples = np.ndarray[Any, np.dtype[np.float32]]

RATE = 44_100
LOW_RATE = 22_050


@dataclass(frozen=True)
class IngestLimits:
    max_seconds: float = 12 * 60
    max_bytes: int = 100 * 1024 * 1024


@dataclass
class Ingested:
    """Loudness-normalised mono audio with the silence trimmed off both ends.

    Stage times are on the trimmed audio; add `offset_sec` to get times in the original
    file (the Song's timeline).
    """

    samples: Samples
    """Mono float32 at 44.1 kHz, normalised to -23 LUFS."""
    samples_low: Samples
    """The same at 22.05 kHz, for stages that want less data."""
    offset_sec: float
    """Seconds of silence trimmed from the start."""
    duration_sec: float
    """Length of the original decoded audio, before trimming."""
    loudness_lufs: float
    """Integrated loudness before normalising."""
    audio_hash: str
    """SHA-256 of the decoded PCM: the cache key. Never stored in the Song."""
