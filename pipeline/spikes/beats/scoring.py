"""Beat-tracking metrics, the standard definitions (as in mir_eval), with no extra deps.

- F-measure: a detected beat is a hit within +-70 ms of an unmatched reference beat.
  Beats in the first 5 s are ignored on both sides, as mir_eval does by default.
- Tempo: the median-interval bpm against the expected bpm; within 2% is right, half or
  double within 2% is "octave" (accepted but flagged, as /golden-eval does).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

WINDOW_SEC = 0.07
SKIP_SEC = 5.0
TEMPO_TOLERANCE = 0.02


@dataclass(frozen=True)
class FMeasure:
    f: float
    precision: float
    recall: float


def f_measure(
    reference: Sequence[float],
    detected: Sequence[float],
    window: float = WINDOW_SEC,
    skip: float = SKIP_SEC,
) -> FMeasure:
    ref = sorted(t for t in reference if t >= skip)
    det = sorted(t for t in detected if t >= skip)
    if not ref or not det:
        return FMeasure(0.0, 0.0, 0.0)
    # Greedy matching in time order is exact here: the window is far smaller than any
    # beat interval, so no detection can sit within the window of two reference beats.
    hits = 0
    j = 0
    for r in ref:
        while j < len(det) and det[j] < r - window:
            j += 1
        if j < len(det) and abs(det[j] - r) <= window:
            hits += 1
            j += 1
    precision = hits / len(det)
    recall = hits / len(ref)
    f = 0.0 if hits == 0 else 2 * precision * recall / (precision + recall)
    return FMeasure(round(f, 4), round(precision, 4), round(recall, 4))


def tempo_verdict(found: float | None, expected: float | None) -> str:
    """'right', 'octave' (half or double), 'wrong', or 'n/a' without both values."""
    if found is None or expected is None or expected <= 0:
        return "n/a"
    if abs(found - expected) <= TEMPO_TOLERANCE * expected:
        return "right"
    for factor in (0.5, 2.0, 1 / 3, 3.0):
        target = expected * factor
        if abs(found - target) <= TEMPO_TOLERANCE * target:
            return "octave"
    return "wrong"
