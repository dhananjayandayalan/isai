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


# A gap longer than this many beat lengths is a hole in the grid (a missed beat, a
# free-time intro, an outro the tracker gave up on).
GAP_BEATS = 1.5


def filled_grid(beats: Sequence[float], end: float) -> list[float]:
    """The beats with holes filled and the ends extended to cover 0..`end`.

    Missing beats are spread evenly across each gap; before the first and after the last
    beat the median beat length carries on. For laying out chords and patterns only: the
    Song keeps the beats that were actually detected.
    """
    detected = sorted(b for b in beats if 0 <= b < end)
    gaps = intervals(detected)
    if not gaps:
        return detected
    beat = statistics.median(gaps)
    out = [detected[0]]
    for nxt in detected[1:]:
        gap = nxt - out[-1]
        if gap > GAP_BEATS * beat:
            steps = round(gap / beat)
            out += [out[-1] + gap * k / steps for k in range(1, steps)]
        out.append(nxt)
    while out[0] - beat >= 0:
        out.insert(0, out[0] - beat)
    while out[-1] + beat < end:
        out.append(out[-1] + beat)
    return [round(b, 3) for b in out]


def filled_downbeats(
    grid: Sequence[float], downbeats: Sequence[float], beats_per_bar: int
) -> list[float]:
    """Bar starts on a filled grid: the detected ones, carried on every `beats_per_bar`
    grid beats before the first and after the last (or from the grid's start if none)."""
    if not grid:
        return []
    tolerance = 0.07
    on_grid = [i for i, b in enumerate(grid) if any(abs(b - d) <= tolerance for d in downbeats)]
    if not on_grid:
        return list(grid[::beats_per_bar])
    marks = set(on_grid)
    marks |= set(range(on_grid[0], -1, -beats_per_bar))
    marks |= set(range(on_grid[-1], len(grid), beats_per_bar))
    return [grid[i] for i in sorted(marks)]
