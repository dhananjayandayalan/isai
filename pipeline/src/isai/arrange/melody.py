"""The right hand: a melody made playable. Pure.

1. One line: where notes overlap, the higher one is the melody (the top voice).
2. Grace notes shorter than a 1/16 at the song's tempo go.
3. Phrases (split at rests of a beat or more) move by whole octaves, never single notes,
   so most of the melody sits in C4-C6.
4. Onsets snap to a grid chosen per song: 1/8, triplets or 1/16, the coarsest that
   explains most onsets within 30 ms.
5. Each beat keeps at most a level's number of notes (easy 2, medium 4, full no cap),
   on-beat and longer notes first.
"""

from __future__ import annotations

import itertools
from bisect import bisect_right
from collections.abc import Sequence
from typing import Literal

from isai.transcribe.types import TNote

Level = Literal["easy", "medium", "full"]

LOW, HIGH = 60, 84  # C4 to C6
GRID_TOLERANCE = 0.03
GRID_SHARE = 0.8
RATE_CAP: dict[str, int | None] = {"easy": 2, "medium": 4, "full": None}


def beat_length(beats: Sequence[float], bpm: float) -> float:
    if len(beats) >= 2:
        gaps = sorted(b - a for a, b in itertools.pairwise(beats) if b > a)
        return gaps[len(gaps) // 2]
    return 60.0 / bpm if bpm > 0 else 0.5


def top_line(notes: Sequence[TNote]) -> list[TNote]:
    """A monophonic line: at each onset the highest note; each note ends by the next."""
    by_onset: dict[float, TNote] = {}
    for n in sorted(notes, key=lambda n: (n.start, -n.midi)):
        key = round(n.start, 2)
        if key not in by_onset:
            by_onset[key] = n
    line = sorted(by_onset.values(), key=lambda n: n.start)
    out: list[TNote] = []
    for i, n in enumerate(line):
        end = min(n.end, line[i + 1].start) if i + 1 < len(line) else n.end
        if end > n.start:
            out.append(TNote(n.start, end, n.midi, n.velocity))
    return out


def phrases(notes: Sequence[TNote], gap: float) -> list[list[TNote]]:
    out: list[list[TNote]] = []
    for n in notes:
        if out and n.start - out[-1][-1].end < gap:
            out[-1].append(n)
        else:
            out.append([n])
    return out


def place_octave(phrase: Sequence[TNote]) -> list[TNote]:
    """The phrase moved by the octave that puts the most notes in C4-C6 (least move wins)."""

    centre = (LOW + HIGH) / 2

    def fits(shift: int) -> tuple[int, int, float, int]:
        # Most notes inside, then the smallest move, then nearest C5, then upwards.
        inside = sum(1 for n in phrase if LOW <= n.midi + shift <= HIGH)
        mean = sum(n.midi + shift for n in phrase) / len(phrase)
        return inside, -abs(shift), -abs(mean - centre), shift

    shifts = [12 * k for k in range(-4, 5) if all(21 <= n.midi + 12 * k <= 108 for n in phrase)]
    if not shifts:
        return list(phrase)
    best = max(shifts, key=fits)
    return [TNote(n.start, n.end, n.midi + best, n.velocity) for n in phrase]


def grid_points(beats: Sequence[float], division: int, beat: float, end: float) -> list[float]:
    """Every 1/`division` of a beat, following the beat grid (extended past its ends)."""
    anchors = list(beats) if len(beats) >= 2 else [0.0]
    while anchors[0] > 0:
        anchors.insert(0, anchors[0] - beat)
    while anchors[-1] < end + beat:
        anchors.append(anchors[-1] + beat)
    points: list[float] = []
    for a, b in itertools.pairwise(anchors):
        points += [a + (b - a) * k / division for k in range(division)]
    points.append(anchors[-1])
    return points


def _nearest(points: Sequence[float], t: float) -> float:
    i = bisect_right(points, t)
    candidates = points[max(0, i - 1) : i + 1]
    return min(candidates, key=lambda p: (abs(p - t), p))


def choose_division(notes: Sequence[TNote], beats: Sequence[float], beat: float) -> int:
    """2 (eighths), 3 (triplets) or 4 (sixteenths): the coarsest that explains the onsets."""
    if not notes:
        return 2
    end = max(n.end for n in notes)
    shares: dict[int, float] = {}
    for division in (2, 3, 4):
        points = grid_points(beats, division, beat, end)
        near = sum(1 for n in notes if abs(_nearest(points, n.start) - n.start) <= GRID_TOLERANCE)
        shares[division] = near / len(notes)
    if shares[2] >= GRID_SHARE:
        return 2
    if shares[3] >= GRID_SHARE and shares[3] > shares[4]:
        return 3
    return 4


def quantise(
    notes: Sequence[TNote], beats: Sequence[float], beat: float, division: int
) -> list[TNote]:
    if not notes:
        return []
    end = max(n.end for n in notes)
    points = grid_points(beats, division, beat, end)
    step = beat / division
    out: list[TNote] = []
    for n in notes:
        start = round(_nearest(points, n.start), 3)
        stop = round(max(_nearest(points, n.end), start + step), 3)
        if out and abs(out[-1].start - start) < 1e-6:
            continue  # two notes on one grid point: keep the first
        out.append(TNote(start, stop, n.midi, n.velocity))
    for i in range(len(out) - 1):
        if out[i].end > out[i + 1].start:
            a = out[i]
            out[i] = TNote(a.start, out[i + 1].start, a.midi, a.velocity)
    return out


def cap_rate(
    notes: Sequence[TNote], beats: Sequence[float], beat: float, limit: int | None
) -> list[TNote]:
    """At most `limit` notes per beat: those nearest the beat, then the longest."""
    if limit is None or not notes:
        return list(notes)
    anchors = list(beats) if len(beats) >= 2 else [0.0]
    groups: dict[int, list[TNote]] = {}
    for n in notes:
        if n.start >= anchors[0]:
            index = bisect_right(anchors, n.start + 1e-6) - 1
        else:
            index = -1 - int((anchors[0] - n.start) // beat)
        groups.setdefault(index, []).append(n)
    kept: list[TNote] = []
    for index, group in groups.items():
        anchor = anchors[index] if 0 <= index < len(anchors) else group[0].start
        ranked = sorted(group, key=lambda n: (abs(n.start - anchor), -(n.end - n.start), n.start))
        kept += ranked[:limit]
    kept.sort(key=lambda n: n.start)
    out: list[TNote] = []
    for i, n in enumerate(kept):  # a kept note rings on to the next one
        end = kept[i + 1].start if i + 1 < len(kept) and kept[i + 1].start < n.end + beat else n.end
        out.append(TNote(n.start, max(n.end, min(end, n.start + 2 * beat)), n.midi, n.velocity))
    return out


def right_hand(
    notes: Sequence[TNote], beats: Sequence[float], bpm: float, level: Level
) -> list[TNote]:
    """The melody arranged for the right hand."""
    beat = beat_length(beats, bpm)
    sixteenth = beat / 4
    line = [n for n in top_line(notes) if n.end - n.start >= sixteenth - 1e-6]
    placed = [n for phrase in phrases(line, beat) for n in place_octave(phrase)]
    division = choose_division(placed, beats, beat)
    snapped = quantise(placed, beats, beat, division)
    return cap_rate(snapped, beats, beat, RATE_CAP[level])
