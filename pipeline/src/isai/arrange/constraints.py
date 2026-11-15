"""Playability constraints for a two-hand arrangement: a checker and a fixer. Pure.

The rules (spec P5):
- each hand spans at most a 9th (14 semitones) at any instant, with at most 4 notes;
- the hands never overlap: at any instant the right hand's lowest note is at least 2
  semitones above the left hand's highest;
- no two notes on one key overlap, and no note is shorter than a 1/16 at the song's tempo;
- every note is a piano key, A0 to C8.

The fixer works in the spec's order: notes out of range move by octaves, short notes
lengthen (or go, if the key is struck again too soon), same-key overlaps are cut, a
colliding left hand drops an octave, else the right hand moves up an octave, else the
left hand's colliding notes go; crowded or wide hands lose their inner notes. The
pipeline checks again afterwards and treats anything left as a bug.
"""

from __future__ import annotations

import itertools
from collections.abc import Sequence
from dataclasses import dataclass, replace
from typing import Literal

Hand = Literal["left", "right"]

A0, C8 = 21, 108
MAX_SPAN = 14  # a major 9th
MAX_NOTES = 4
MIN_GAP = 2
LEFT_FLOOR = 24  # the left hand drops no lower than C1
_EPS = 1e-6
_MAX_PASSES = 20


@dataclass(frozen=True)
class ANote:
    start: float
    end: float
    midi: int
    velocity: int
    hand: Hand


@dataclass(frozen=True)
class Violation:
    rule: Literal["range", "short", "same-key", "span", "crowd", "overlap"]
    time: float
    detail: str


def _sounding(notes: Sequence[ANote], t: float) -> list[ANote]:
    return [n for n in notes if n.start <= t + _EPS and n.end > t + _EPS]


def _instants(notes: Sequence[ANote]) -> list[float]:
    return sorted({n.start for n in notes})


def check(notes: Sequence[ANote], sixteenth: float) -> list[Violation]:
    """Every rule broken, in time order."""
    out: list[Violation] = []
    for n in notes:
        if not A0 <= n.midi <= C8:
            out.append(Violation("range", n.start, f"MIDI {n.midi}"))
        if n.end - n.start < sixteenth - _EPS:
            out.append(Violation("short", n.start, f"MIDI {n.midi} lasts {n.end - n.start:.3f} s"))
    by_key: dict[int, list[ANote]] = {}
    for n in notes:
        by_key.setdefault(n.midi, []).append(n)
    for key, group in by_key.items():
        group.sort(key=lambda n: n.start)
        for a, b in itertools.pairwise(group):
            if b.start < a.end - _EPS:
                out.append(Violation("same-key", b.start, f"MIDI {key}"))
    for t in _instants(notes):
        now = _sounding(notes, t)
        left = [n.midi for n in now if n.hand == "left"]
        right = [n.midi for n in now if n.hand == "right"]
        for hand, keys in (("left", left), ("right", right)):
            if keys and max(keys) - min(keys) > MAX_SPAN:
                out.append(Violation("span", t, f"{hand} hand spans {max(keys) - min(keys)}"))
            if len(keys) > MAX_NOTES:
                out.append(Violation("crowd", t, f"{hand} hand plays {len(keys)} notes"))
        if left and right and min(right) - max(left) < MIN_GAP:
            out.append(Violation("overlap", t, f"left {max(left)} vs right {min(right)}"))
    out.sort(key=lambda v: (v.time, v.rule, v.detail))
    return out


def _into_range(n: ANote) -> ANote:
    midi = n.midi
    while midi < A0:
        midi += 12
    while midi > C8:
        midi -= 12
    return replace(n, midi=midi)


def _keys_and_lengths(notes: list[ANote], sixteenth: float) -> list[ANote]:
    """Lengthen short notes, cut same-key overlaps, drop what can't be kept."""
    by_key: dict[int, list[ANote]] = {}
    for n in notes:
        by_key.setdefault(n.midi, []).append(n)
    out: list[ANote] = []
    for group in by_key.values():
        group.sort(key=lambda n: (n.start, -n.velocity))
        kept: list[ANote] = []
        for n in group:
            if kept and n.start < kept[-1].start + sixteenth - _EPS:
                continue  # struck again within a 1/16: one note
            if kept and kept[-1].end > n.start:
                kept[-1] = replace(kept[-1], end=n.start)
            kept.append(replace(n, end=max(n.end, n.start + sixteenth)))
        for i, n in enumerate(kept):
            if i + 1 < len(kept) and n.end > kept[i + 1].start:
                n = replace(n, end=kept[i + 1].start)
            out.append(n)
    return out


def _thin(notes: list[ANote], t: float) -> list[ANote]:
    """Drop inner notes of a crowded or too-wide hand at instant `t`."""
    now = _sounding(notes, t)
    drop: set[ANote] = set()
    for hand in ("left", "right"):
        keys = sorted((n for n in now if n.hand == hand), key=lambda n: (n.midi, n.start))
        while len(keys) > MAX_NOTES or (keys and keys[-1].midi - keys[0].midi > MAX_SPAN):
            if len(keys) > 2 and keys[-1].midi - keys[0].midi <= MAX_SPAN:
                victim = keys[len(keys) // 2]  # crowded: an inner note
            elif hand == "left":
                victim = keys[-1]  # too wide: keep the bass
            else:
                victim = keys[0]  # too wide: keep the melody on top
            drop.add(victim)
            keys.remove(victim)
    return [n for n in notes if n not in drop]


def _separate(notes: list[ANote], t: float) -> list[ANote]:
    """Resolve a hand collision at `t`: left down, else right up, else drop left notes."""
    now = _sounding(notes, t)
    left = [n for n in now if n.hand == "left"]
    right = [n for n in now if n.hand == "right"]
    if min(n.midi for n in left) - 12 >= LEFT_FLOOR:
        moved = {n: replace(n, midi=n.midi - 12) for n in left}
    elif max(n.midi for n in right) + 12 <= C8:
        moved = {n: replace(n, midi=n.midi + 12) for n in right}
    else:
        lowest_right = min(n.midi for n in right)
        doomed = {n for n in left if lowest_right - n.midi < MIN_GAP}
        return [n for n in notes if n not in doomed]
    return [moved.get(n, n) for n in notes]


def fix(notes: Sequence[ANote], sixteenth: float) -> list[ANote]:
    """The notes made playable, sorted by time, pitch and hand."""
    current = [_into_range(n) for n in notes]
    for _ in range(_MAX_PASSES):
        current = _keys_and_lengths(current, sixteenth)
        problems = [v for v in check(current, sixteenth) if v.rule in ("overlap", "span", "crowd")]
        if not problems:
            break
        first = problems[0]
        if first.rule == "overlap":
            current = _separate(current, first.time)
        else:
            current = _thin(current, first.time)
        current = [_into_range(n) for n in current]
    return sorted(current, key=lambda n: (n.start, n.midi, n.hand))
