"""The left hand: chord patterns by level and time signature. Pure.

| Level  | 4/4                                            | 3/4                       |
|--------|------------------------------------------------|---------------------------|
| easy   | the bass note at each chord change and bar, held | the bass note on beat 1 |
| medium | a block chord on beats 1 and 3 (and on changes) | bass on 1, chord on 2, 3  |
| full   | broken chord 1-5-8-5 in eighths, passing bass  | arpeggio 1-5-8            |

The bass note is the chord's bass (or root) in C2-B2. Block chords keep at most three
tones (a seventh replaces the fifth) in close position under C4, each inversion chosen
for the least movement from the last one.
"""

from __future__ import annotations

import itertools
from bisect import bisect_right
from collections.abc import Sequence

from isai.arrange.melody import Level
from isai.harmony.types import Segment
from isai.theory.chords import INTERVALS, Chord
from isai.transcribe.types import TNote

BASS_LOW = 36  # C2
BLOCK_LOW, BLOCK_HIGH = 43, 60  # G2 to C4
BASS_VELOCITY = 70
CHORD_VELOCITY = 60


def bass_note(chord: Chord) -> int:
    pc = chord.bass if chord.bass is not None else chord.root
    return BASS_LOW + pc % 12


def block_tones(chord: Chord) -> list[int]:
    """Up to three pitch classes: root, third and fifth, or root, third and seventh."""
    steps = INTERVALS[chord.quality]
    picked = (steps[0], steps[1], steps[3]) if len(steps) == 4 else steps[:3]
    return [(chord.root + s) % 12 for s in picked]


def voicings(chord: Chord) -> list[tuple[int, ...]]:
    """Every close-position voicing of the chord's block tones between G2 and C4."""
    tones = block_tones(chord)
    out: list[tuple[int, ...]] = []
    for rotation in range(len(tones)):
        order = tones[rotation:] + tones[:rotation]
        for octave in range(2, 6):
            notes = [12 * octave + order[0]]
            for pc in order[1:]:
                nxt = notes[-1] + (pc - notes[-1]) % 12 or notes[-1] + 12
                notes.append(nxt)
            if notes[0] >= BLOCK_LOW and notes[-1] <= BLOCK_HIGH and notes[-1] - notes[0] <= 12:
                out.append(tuple(notes))
    return sorted(set(out))


def closest_voicing(chord: Chord, previous: tuple[int, ...] | None) -> tuple[int, ...]:
    """The voicing that moves least from `previous` (or sits nearest E3 at the start)."""
    options = voicings(chord)
    if not options:
        return tuple(sorted(BASS_LOW + 12 + pc for pc in block_tones(chord)))

    def cost(v: tuple[int, ...]) -> tuple[float, tuple[int, ...]]:
        if previous is None:
            return abs(sum(v) / len(v) - 52), v
        moves = sum(min(abs(a - b) for b in previous) for a in v)
        return moves, v

    return min(options, key=cost)


def _chord_at(segments: Sequence[Segment], t: float) -> Chord | None:
    starts = [s.start for s in segments]
    i = bisect_right(starts, t + 1e-6) - 1
    if i >= 0 and segments[i].start - 1e-6 <= t < segments[i].end - 1e-6:
        return segments[i].chord
    return None


def _grid(beats: Sequence[float], end: float) -> list[float]:
    """The beats, plus one more at the end so the last beat has a length."""
    grid = [b for b in beats if b < end]
    if len(grid) >= 2:
        grid.append(min(end, grid[-1] + (grid[-1] - grid[-2])))
    return grid


def left_hand(
    segments: Sequence[Segment],
    beats: Sequence[float],
    downbeats: Sequence[float],
    beats_per_bar: int,
    level: Level,
    end: float,
) -> list[TNote]:
    """The accompaniment for the chord segments, on the beat grid."""
    grid = _grid(beats, end)
    if len(grid) < 2 or not segments:
        return []
    bar_starts = {round(d, 3) for d in downbeats}
    first_bar = next((i for i, b in enumerate(grid) if round(b, 3) in bar_starts), 0)
    notes: list[TNote] = []
    previous: tuple[int, ...] | None = None
    last_chord: Chord | None = None
    for i, (t, nxt) in enumerate(itertools.pairwise(grid)):
        chord = _chord_at(segments, t)
        if chord is None:
            last_chord = None
            continue
        position = (i - first_bar) % beats_per_bar
        changed = chord != last_chord
        last_chord = chord
        length = nxt - t
        bass = bass_note(chord)
        hold_end = _hold_until(segments, grid, i, beats_per_bar, first_bar)

        if level == "easy":
            if changed or position == 0:
                notes.append(TNote(t, hold_end, bass, BASS_VELOCITY))
            continue
        if level == "medium":
            if beats_per_bar == 3:
                if position == 0:
                    notes.append(TNote(t, nxt, bass, BASS_VELOCITY))
                else:
                    previous = closest_voicing(chord, previous)
                    notes += [TNote(t, nxt, m, CHORD_VELOCITY) for m in previous]
            elif position in (0, 2) or changed:
                previous = closest_voicing(chord, previous)
                stop = min(hold_end, t + 2 * length)
                notes += [TNote(t, stop, m, CHORD_VELOCITY) for m in previous]
            continue
        # full
        fifth = bass + (chord.root + INTERVALS[chord.quality][2] - bass) % 12
        if fifth - bass < 5:
            fifth += 12
        if beats_per_bar == 3:
            pattern = [bass, fifth, bass + 12]
            notes.append(TNote(t, nxt, pattern[position % 3], BASS_VELOCITY))
            continue
        half = length / 2
        steps = [bass, fifth] if position % 2 == 0 else [bass + 12, fifth]
        upcoming = _chord_at(segments, nxt) if i + 2 < len(grid) else None
        if upcoming is not None and upcoming != chord:
            steps[1] = _passing(bass_note(upcoming))
        notes.append(TNote(t, t + half, steps[0], BASS_VELOCITY))
        notes.append(TNote(t + half, nxt, steps[1], CHORD_VELOCITY))
    return [TNote(round(n.start, 3), round(n.end, 3), n.midi, n.velocity) for n in notes]


def _hold_until(
    segments: Sequence[Segment], grid: Sequence[float], i: int, beats_per_bar: int, first_bar: int
) -> float:
    """The next chord change or bar line after beat `i`."""
    chord = _chord_at(segments, grid[i])
    for j in range(i + 1, len(grid)):
        if (j - first_bar) % beats_per_bar == 0 or _chord_at(segments, grid[j]) != chord:
            return grid[j]
    return grid[-1]


def _passing(target_bass: int) -> int:
    """A note a whole step below the next bass note (or a half step at the bottom)."""
    return target_bass - 2 if target_bass - 2 >= BASS_LOW - 2 else target_bass - 1
