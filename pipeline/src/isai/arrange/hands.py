"""Hand assignment for a transcribed piano part: which notes the left hand plays.

Rule-based and deterministic (rule 7). The music is cut into beats; for each beat a split
point is chosen (notes at or above it go right). A dynamic-programming pass picks the
sequence of split points with the least total cost:

- **Span:** each hand's notes in a beat should fit within a 10th (16 semitones); every
  semitone beyond costs `SPAN_COST`.
- **Crowding:** more than five notes in one hand at one beat costs `CROWD_COST` each.
- **Movement:** moving the split between beats costs `MOVE_COST` per semitone, so it
  follows the music smoothly instead of jumping.
- **Home:** distance from middle C costs `HOME_COST` per semitone, so with nothing else to
  go on the split sits at middle C.

Because one split point applies to every note of a beat, the hands never cross within an
onset group: every left-hand note is below every right-hand note.
"""

from __future__ import annotations

from bisect import bisect_right
from collections.abc import Sequence
from typing import Literal

from isai.transcribe.types import TNote

Hand = Literal["left", "right"]

MIDDLE_C = 60
SPLITS = range(36, 85)  # C2 to C6: where a split point may sit
SPAN_LIMIT = 16  # a major 10th
SPAN_COST = 1.0
CROWD_LIMIT = 5
CROWD_COST = 2.0
MOVE_COST = 0.1
HOME_COST = 0.02
# Without a beat grid, the music is cut into windows of this length instead.
FALLBACK_WINDOW_SEC = 0.5


def _windows(notes: Sequence[TNote], beats: Sequence[float]) -> list[int]:
    """The beat (window) index of each note, by its onset."""
    if len(beats) >= 2:
        return [max(0, bisect_right(beats, n.start) - 1) for n in notes]
    return [int(n.start // FALLBACK_WINDOW_SEC) for n in notes]


def _span_cost(pitches: list[int]) -> float:
    if not pitches:
        return 0.0
    over = max(0, max(pitches) - min(pitches) - SPAN_LIMIT)
    crowd = max(0, len(pitches) - CROWD_LIMIT)
    return SPAN_COST * over + CROWD_COST * crowd


def _beat_cost(pitches: list[int], split: int) -> float:
    left = [p for p in pitches if p < split]
    right = [p for p in pitches if p >= split]
    return _span_cost(left) + _span_cost(right) + HOME_COST * abs(split - MIDDLE_C)


def split_points(notes: Sequence[TNote], beats: Sequence[float]) -> dict[int, int]:
    """The chosen split point for every beat that has notes."""
    if not notes:
        return {}
    windows = _windows(notes, beats)
    by_window: dict[int, list[int]] = {}
    for note, window in zip(notes, windows, strict=True):
        by_window.setdefault(window, []).append(note.midi)
    order = sorted(by_window)
    splits = list(SPLITS)

    # cost[i][k]: best total cost up to window order[i] with split splits[k].
    previous = [_beat_cost(by_window[order[0]], s) for s in splits]
    back: list[list[int]] = []
    for window in order[1:]:
        pitches = by_window[window]
        here: list[float] = []
        pointers: list[int] = []
        for s in splits:
            best_k = min(
                range(len(splits)),
                key=lambda k: (previous[k] + MOVE_COST * abs(splits[k] - s), k),
            )
            pointers.append(best_k)
            here.append(
                previous[best_k] + MOVE_COST * abs(splits[best_k] - s) + _beat_cost(pitches, s)
            )
        back.append(pointers)
        previous = here

    k = min(range(len(splits)), key=lambda i: (previous[i], i))
    chosen = [k]
    for pointers in reversed(back):
        k = pointers[k]
        chosen.append(k)
    chosen.reverse()
    return {window: splits[i] for window, i in zip(order, chosen, strict=True)}


def assign_hands(
    notes: Sequence[TNote], beats: Sequence[float], melody_only: bool = False
) -> list[Hand]:
    """A hand for each note, in the order given. Melody-only parts all go right."""
    if melody_only:
        return ["right"] * len(notes)
    splits = split_points(notes, beats)
    windows = _windows(notes, beats)
    return ["right" if n.midi >= splits[w] else "left" for n, w in zip(notes, windows, strict=True)]
