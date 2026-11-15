"""Key finding from a 12-bin pitch-class profile (a chroma vector). Pure, no audio.

Three published key profiles are correlated with the chroma for all 24 major and minor
keys, and their correlations averaged:

- Krumhansl and Kessler (1982): listener ratings of how well each pitch fits a key.
- Temperley (1999): a revised profile from music-theoretic reasoning.
- Albrecht and Shanahan (2013): pitch-class distributions counted in a corpus.

The best key wins. Confidence comes from how far it is ahead of the runner-up. When the
best major and best minor keys are close and neither fits well, the mode is `modal`.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from isai.theory.scales import ScaleMode, scale

KeyMode = Literal["major", "minor", "modal"]

PROFILES: dict[str, tuple[tuple[float, ...], tuple[float, ...]]] = {
    "krumhansl-kessler": (
        (6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88),
        (6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17),
    ),
    "temperley": (
        (5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0),
        (5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0),
    ),
    "albrecht-shanahan": (
        (0.238, 0.006, 0.111, 0.006, 0.137, 0.094, 0.016, 0.214, 0.009, 0.080, 0.008, 0.081),
        (0.220, 0.006, 0.104, 0.123, 0.019, 0.103, 0.012, 0.214, 0.062, 0.022, 0.061, 0.052),
    ),
}

# Confidence reaches 1 when the best key leads the runner-up by this much correlation (about
# what a key's own profile leads its nearest rival by).
CONFIDENT_LEAD = 0.3
# `modal`: the best major and minor keys are this close, and neither correlates this well.
# Set on synthesised material (whole-tone and chromatic lines read as modal; Dorian and
# pentatonic melodies don't); to be revisited on the golden set.
MODAL_CLOSENESS = 0.08
MODAL_POOR_FIT = 0.6

# Each tonic as its usual key signature spells it (Db and F# major; C#, Eb and G# minor).
_MAJOR_NAMES = ("C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B")
_MINOR_NAMES = ("C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B")


@dataclass(frozen=True)
class KeyScore:
    tonic: int
    mode: Literal["major", "minor"]
    score: float


@dataclass(frozen=True)
class KeyEstimate:
    tonic: int
    """Pitch class of the tonic, 0 = C."""
    mode: KeyMode
    confidence: float
    """0 to 1."""
    scores: tuple[KeyScore, ...]
    """All 24 keys, best first."""


def _pearson(xs: Sequence[float], ys: Sequence[float]) -> float | None:
    n = len(xs)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    dx = [x - mean_x for x in xs]
    dy = [y - mean_y for y in ys]
    norm = math.sqrt(sum(d * d for d in dx) * sum(d * d for d in dy))
    if norm == 0:
        return None
    return sum(a * b for a, b in zip(dx, dy, strict=True)) / norm


def key_scores(chroma: Sequence[float]) -> list[KeyScore] | None:
    """Every key's mean correlation with `chroma`, best first; None for a flat or empty chroma."""
    if len(chroma) != 12:
        raise ValueError(f"a chroma has 12 bins, got {len(chroma)}")
    if any(not math.isfinite(c) or c < 0 for c in chroma):
        raise ValueError("chroma bins must be finite and non-negative")
    scores: list[KeyScore] = []
    for tonic in range(12):
        # The chroma rotated so the candidate tonic is bin 0.
        rotated = [chroma[(tonic + i) % 12] for i in range(12)]
        for index, mode in enumerate(("major", "minor")):
            correlations = [_pearson(rotated, profiles[index]) for profiles in PROFILES.values()]
            if any(r is None for r in correlations):
                return None
            mean = sum(r for r in correlations if r is not None) / len(correlations)
            scores.append(KeyScore(tonic=tonic, mode=mode, score=mean))
    # Best first; ties go to the lower pitch class and to major, so the result is stable.
    scores.sort(key=lambda s: (-s.score, s.tonic, s.mode))
    return scores


def find_key(chroma: Sequence[float]) -> KeyEstimate | None:
    """The key of `chroma`, or None when it carries no pitch information."""
    scores = key_scores(chroma)
    if scores is None:
        return None
    best, runner_up = scores[0], scores[1]
    lead = best.score - runner_up.score
    confidence = max(0.0, min(1.0, lead / CONFIDENT_LEAD)) * max(0.0, min(1.0, best.score))
    best_major = next(s for s in scores if s.mode == "major")
    best_minor = next(s for s in scores if s.mode == "minor")
    mode: KeyMode = best.mode
    close = abs(best_major.score - best_minor.score) < MODAL_CLOSENESS
    if close and max(best_major.score, best_minor.score) < MODAL_POOR_FIT:
        mode = "modal"
    return KeyEstimate(
        tonic=best.tonic, mode=mode, confidence=round(confidence, 4), scores=tuple(scores)
    )


def key_name(tonic: int, mode: KeyMode) -> str:
    """The tonic as the Song writes it, spelled as its key signature does (Bb, F#, Eb minor)."""
    if not 0 <= tonic <= 11:
        raise ValueError(f"tonic pitch class must be 0-11, got {tonic}")
    return (_MINOR_NAMES if mode == "minor" else _MAJOR_NAMES)[tonic]


# Scales a modal key may take, tried in this order (ties go to the earlier one).
MODAL_CANDIDATES: tuple[ScaleMode, ...] = (
    "dorian",
    "mixolydian",
    "phrygian",
    "lydian",
    "aeolian",
    "ionian",
    "locrian",
)


def modal_scale(chroma: Sequence[float], tonic: int) -> tuple[ScaleMode, list[int]]:
    """The church mode on `tonic` whose seven notes hold the most of the chroma."""
    best_name = MODAL_CANDIDATES[0]
    best_notes = scale(tonic, best_name)
    best_mass = -1.0
    for name in MODAL_CANDIDATES:
        notes = scale(tonic, name)
        mass = sum(chroma[pc] for pc in notes)
        if mass > best_mass + 1e-12:
            best_name, best_notes, best_mass = name, notes, mass
    return best_name, best_notes
