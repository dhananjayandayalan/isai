"""Rule-based two-hand arranger (rule 7): deterministic, explainable, unit-tested.

`arrange` puts the melody in the right hand and chord patterns in the left, then makes
the result playable with `constraints.fix`, and checks it again: anything left is a bug
in the arranger, never a property of the song, so it raises.
"""

from __future__ import annotations

from collections.abc import Sequence

from isai.arrange.accompany import left_hand
from isai.arrange.constraints import ANote, check, fix
from isai.arrange.melody import Level, beat_length, right_hand
from isai.harmony.types import Segment
from isai.transcribe.types import TNote

ARRANGE_VERSION = "1"
LEVELS: tuple[Level, ...] = ("easy", "medium", "full")
MELODY_VELOCITY_FLOOR = 50


class ArrangementError(RuntimeError):
    """The fixer left a constraint broken: an arranger bug."""


def arrange(
    melody: Sequence[TNote],
    segments: Sequence[Segment],
    beats: Sequence[float],
    downbeats: Sequence[float],
    beats_per_bar: int,
    bpm: float,
    level: Level,
    end: float,
) -> list[ANote]:
    """A two-hand arrangement, sorted by time, pitch and hand."""
    right = right_hand(melody, beats, bpm, level)
    left = left_hand(segments, beats, downbeats, beats_per_bar, level, end)
    notes = [
        ANote(n.start, n.end, n.midi, max(MELODY_VELOCITY_FLOOR, n.velocity), "right")
        for n in right
    ] + [ANote(n.start, n.end, n.midi, n.velocity, "left") for n in left]
    sixteenth = beat_length(beats, bpm) / 4
    fixed = fix([n for n in notes if n.start < end], sixteenth)
    clipped = [ANote(n.start, min(n.end, end), n.midi, n.velocity, n.hand) for n in fixed]
    playable = [n for n in clipped if n.end - n.start >= sixteenth - 1e-6]
    problems = check(playable, sixteenth)
    if problems:
        raise ArrangementError(f"{len(problems)} constraint(s) left after fixing: {problems[:3]}")
    return playable
