"""The baseline chord recogniser: chroma per beat, template scores, Viterbi. Pure numpy.

Each beat's chroma is scored against every chord template (cosine similarity), plus a
"no chord" state for silence. A Viterbi pass picks the best sequence:
- staying on a chord is free, changing costs `CHANGE_COST`;
- a non-diatonic chord costs `CHROMATIC_COST` more;
- sevenths, sus4 and dim pay a small complexity cost, so plain triads win ties;
- a bass pitch class that matches a chord's root adds `BASS_BONUS`.
Consecutive beats on one chord become a segment. A segment whose usual bass note is
another chord tone becomes a slash chord (an inversion).
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from typing import Any

import numpy as np

from isai.harmony.types import Segment
from isai.theory.chords import Chord, Quality, all_chords, diatonic, template

Matrix = np.ndarray[Any, np.dtype[np.float64]]
Vector = np.ndarray[Any, np.dtype[np.float64]]

CHANGE_COST = 0.15
CHROMATIC_COST = 0.1
COMPLEXITY: dict[Quality, float] = {
    "maj": 0.0,
    "min": 0.0,
    "7": 0.04,
    "min7": 0.04,
    "maj7": 0.05,
    "dim": 0.06,
    "sus4": 0.06,
}
BASS_BONUS = 0.06
NO_CHORD_SCORE = 0.3
QUIET = 0.1
"""Beats below this share of the median beat energy count as silence."""
CONFIDENT_MARGIN = 0.2


def _unit_rows(matrix: Matrix) -> Matrix:
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    return np.divide(matrix, norms, out=np.zeros_like(matrix), where=norms > 0)


def emissions(
    chroma: Matrix,
    energy: Vector,
    chords: Sequence[Chord],
    bass: Sequence[int | None],
) -> Matrix:
    """Per beat, a score per chord state, with the last column for "no chord"."""
    templates = np.array([template(c) for c in chords])
    scores = _unit_rows(chroma) @ templates.T
    scores -= np.array([COMPLEXITY[c.quality] for c in chords])[None, :]
    roots = np.array([c.root for c in chords])
    for i, pc in enumerate(bass):
        if pc is not None:
            scores[i, roots == pc] += BASS_BONUS
    median = float(np.median(energy)) if energy.size else 0.0
    quiet = energy <= QUIET * median if median > 0 else np.ones(energy.shape, dtype=bool)
    no_chord = np.where(quiet, 1.0, NO_CHORD_SCORE)
    scores[quiet] = 0.0
    return np.concatenate([scores, no_chord[:, None]], axis=1)


def viterbi(scores: Matrix, chords: Sequence[Chord], key: set[Chord]) -> list[int]:
    """The best state per beat (an index into `chords`, or len(chords) for no chord)."""
    beats, states = scores.shape
    if beats == 0:
        return []
    target_cost = np.array([0.0 if c in key else CHROMATIC_COST for c in chords] + [0.0])
    # transition[a, b]: the cost of moving from a to b.
    transition = np.full((states, states), CHANGE_COST) + target_cost[None, :]
    np.fill_diagonal(transition, 0.0)
    best = scores[0] - target_cost
    back = np.zeros((beats, states), dtype=np.int64)
    for i in range(1, beats):
        candidates = best[:, None] - transition  # from each a to each b
        back[i] = np.argmax(candidates, axis=0)  # ties go to the lower index: stable
        best = candidates[back[i], np.arange(states)] + scores[i]
    path = [int(np.argmax(best))]
    for i in range(beats - 1, 0, -1):
        path.append(int(back[i, path[-1]]))
    path.reverse()
    return path


def _slash(chord: Chord, basses: list[int]) -> Chord:
    if not basses:
        return chord
    common, count = Counter(basses).most_common(1)[0]
    if common != chord.root and common in chord.tones() and count * 2 > len(basses):
        return Chord(chord.root, chord.quality, common)
    return chord


def recognise(
    chroma: Matrix,
    energy: Vector,
    edges: Sequence[float],
    tonic: int,
    mode: str,
    bass: Sequence[int | None] | None = None,
) -> tuple[list[Segment], float]:
    """Chord segments over the beats (`edges` has one more entry than `chroma` has rows),
    and a confidence from 0 to 1."""
    beats = chroma.shape[0]
    if beats == 0 or len(edges) != beats + 1:
        return [], 0.0
    bass_list = list(bass) if bass is not None else [None] * beats
    chords = all_chords()
    scores = emissions(chroma, energy, chords, bass_list)
    path = viterbi(scores, chords, diatonic(tonic, mode))

    segments: list[Segment] = []
    margins: list[float] = []
    i = 0
    while i < beats:
        j = i
        while j + 1 < beats and path[j + 1] == path[i]:
            j += 1
        state = path[i]
        if state < len(chords):
            chord = chords[state]
            basses = [b for b in bass_list[i : j + 1] if b is not None]
            segments.append(
                Segment(round(edges[i], 3), round(edges[j + 1], 3), _slash(chord, basses))
            )
            for k in range(i, j + 1):
                others = [s for n, s in enumerate(scores[k, :-1]) if chords[n].root != chord.root]
                margins.append(float(scores[k, state] - max(others)))
        i = j + 1
    confidence = float(np.clip(np.mean(margins) / CONFIDENT_MARGIN, 0.0, 1.0)) if margins else 0.0
    return segments, confidence
