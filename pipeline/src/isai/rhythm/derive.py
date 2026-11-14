"""Tempo, metre and stability from beat and downbeat times. Pure: no audio."""

from __future__ import annotations

import itertools
import statistics
from collections.abc import Sequence
from dataclasses import dataclass

# Coefficient of variation of the beat intervals below which the tempo counts as steady.
STABLE_CV = 0.05
# Fewer beats than this is not enough to trust a tempo.
MIN_BEATS = 8
SUPPORTED_METERS = (3, 4)
# When the bar length can't be read, 4/4 is assumed with this confidence.
FALLBACK_METER_CONFIDENCE = 0.2


@dataclass(frozen=True)
class Metre:
    beats_per_bar: int
    confidence: float


def intervals(beats: Sequence[float]) -> list[float]:
    return [b - a for a, b in itertools.pairwise(beats) if b > a]


def bpm(beats: Sequence[float]) -> float | None:
    """Tempo from the median beat interval, or None with fewer than two beats."""
    gaps = intervals(beats)
    if not gaps:
        return None
    return 60.0 / statistics.median(gaps)


def stability(beats: Sequence[float]) -> float | None:
    """Coefficient of variation of the beat intervals: 0 for a click track, larger for rubato."""
    gaps = intervals(beats)
    if len(gaps) < 2:
        return None
    return statistics.pstdev(gaps) / statistics.fmean(gaps)


def is_stable(beats: Sequence[float]) -> bool:
    cv = stability(beats)
    return cv is not None and cv < STABLE_CV


def metre(beats: Sequence[float], downbeats: Sequence[float]) -> Metre:
    """Beats per bar from how many beats fall between consecutive downbeats.

    3 or 4 when the bars mostly agree (confidence is the share that do); otherwise 4/4
    with low confidence.
    """
    if len(downbeats) < 2 or len(beats) < 2:
        return Metre(4, FALLBACK_METER_CONFIDENCE)
    tolerance = 0.5 * min(intervals(beats) or [0.0])
    counts: list[int] = []
    for start, end in itertools.pairwise(downbeats):
        counts.append(sum(1 for b in beats if start - tolerance <= b < end - tolerance))
    common = statistics.mode(counts)
    share = counts.count(common) / len(counts)
    if common not in SUPPORTED_METERS:
        return Metre(4, FALLBACK_METER_CONFIDENCE)
    return Metre(common, round(share, 4))


def tempo_confidence(beats: Sequence[float]) -> float:
    """0 to 1: steady beats and enough of them give confidence; rubato and short clips lower it."""
    cv = stability(beats)
    if cv is None:
        return 0.0
    steadiness = max(0.0, 1.0 - cv / (4 * STABLE_CV))
    amount = min(1.0, len(beats) / (2 * MIN_BEATS))
    return round(steadiness * amount, 4)
