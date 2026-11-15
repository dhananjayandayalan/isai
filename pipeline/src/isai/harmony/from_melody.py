"""Chords suggested from a melody alone (a-cappella), by rules. Pure.

Per span (a bar, or half a bar below `SLOW_BPM`), each of the key's primary triads is
scored by how much melody time its tones cover, with notes that start on strong beats
counting double; notes outside the chord count against it. Ties go to I, IV, V, vi, ii,
iii in that order. A phrase ends at a rest of a beat or more, or every `PHRASE_BARS` bars;
its last span is forced to the tonic, and the one before it to V or IV, whichever fits
the melody better (a cadence). One chord per span means at most one change per bar at
normal tempi.
"""

from __future__ import annotations

import itertools
from collections.abc import Sequence

from isai.harmony.types import Segment
from isai.theory.chords import Chord, primary_triads
from isai.transcribe.types import TNote

SLOW_BPM = 70.0
PHRASE_BARS = 4
STRONG_WEIGHT = 2.0
OUTSIDE_WEIGHT = 0.5
STRONG_WINDOW = 0.08  # seconds from a strong beat


def _spans(
    downbeats: Sequence[float], beats: Sequence[float], beats_per_bar: int, bpm: float, end: float
) -> list[tuple[float, float]]:
    bars = sorted({b for b in downbeats if b < end})
    if not bars:
        bars = [beats[i] for i in range(0, len(beats), beats_per_bar)] if beats else [0.0]
    edges = [*bars, end]
    spans = [(a, b) for a, b in itertools.pairwise(edges) if b > a]
    if bpm >= SLOW_BPM:
        return spans
    halves: list[tuple[float, float]] = []
    for a, b in spans:
        middle = (a + b) / 2
        halves += [(a, middle), (middle, b)]
    return halves


def _strong(start: float, strong_beats: Sequence[float]) -> bool:
    return any(abs(start - s) <= STRONG_WINDOW for s in strong_beats)


def _scores(
    notes: Sequence[TNote],
    span: tuple[float, float],
    candidates: list[Chord],
    strong_beats: Sequence[float],
) -> list[float]:
    a, b = span
    weights = [0.0] * 12
    for n in notes:
        overlap = max(0.0, min(n.end, b) - max(n.start, a))
        if overlap > 0:
            weights[n.midi % 12] += overlap * (
                STRONG_WEIGHT if _strong(n.start, strong_beats) else 1.0
            )
    total = sum(weights)
    out: list[float] = []
    for chord in candidates:
        inside = sum(weights[pc] for pc in chord.tones())
        out.append(inside - OUTSIDE_WEIGHT * (total - inside))
    return out


def _best(scores: list[float]) -> int:
    top = max(scores)
    return scores.index(top)  # the earliest (most primary) chord wins ties


def _phrase_ends(
    notes: Sequence[TNote], spans: list[tuple[float, float]], beat_sec: float, spans_per_bar: int
) -> set[int]:
    ends: set[int] = set()
    ordered = sorted(notes, key=lambda n: n.start)
    for i, (_, b) in enumerate(spans):
        following = [n for n in ordered if n.start >= b - 1e-6]
        sounding_at_end = any(n.start < b <= n.end + 1e-6 for n in ordered)
        rest = following[0].start - b if following else float("inf")
        before = [n for n in ordered if n.end <= b + 1e-6]
        gap = (following[0].start - before[-1].end) if following and before else rest
        if not sounding_at_end and gap >= beat_sec - 1e-6:
            ends.add(i)
        if (i + 1) % (PHRASE_BARS * spans_per_bar) == 0:
            ends.add(i)
    if spans:
        ends.add(len(spans) - 1)
    return ends


def chords_from_melody(
    notes: Sequence[TNote],
    beats: Sequence[float],
    downbeats: Sequence[float],
    beats_per_bar: int,
    bpm: float,
    tonic: int,
    mode: str,
    end: float,
) -> list[Segment]:
    """Chord segments for a melody, one per span, with cadences at phrase ends."""
    if not notes or end <= 0:
        return []
    spans = _spans(downbeats, beats, beats_per_bar, bpm, end)
    spans_per_bar = 2 if bpm < SLOW_BPM else 1
    candidates = primary_triads(tonic, mode)
    tonic_chord, subdominant, dominant = candidates[0], candidates[1], candidates[2]
    strong = [beats[i] for i in range(0, len(beats), max(1, beats_per_bar // 2))] if beats else []
    beat_sec = 60.0 / bpm if bpm > 0 else 0.5

    chosen: list[Chord] = []
    span_scores: list[list[float]] = []
    for span in spans:
        scores = _scores(notes, span, candidates, strong)
        span_scores.append(scores)
        chosen.append(candidates[_best(scores)])
    ends = _phrase_ends(notes, spans, beat_sec, spans_per_bar)
    for i in sorted(ends):
        chosen[i] = tonic_chord
        if i >= 1 and i - 1 not in ends:
            scores = span_scores[i - 1]
            chosen[i - 1] = dominant if scores[2] >= scores[1] else subdominant

    segments: list[Segment] = []
    for (a, b), chord in zip(spans, chosen, strict=True):
        if segments and segments[-1].chord == chord:
            segments[-1] = Segment(segments[-1].start, round(b, 3), chord)
        else:
            segments.append(Segment(round(a, 3), round(b, 3), chord))
    return segments


def coverage(notes: Sequence[TNote], segments: Sequence[Segment]) -> float:
    """The share of melody time whose pitch is a tone of the chord under it (0 to 1):
    `confidence.chords` for chords suggested from a melody."""
    total = covered = 0.0
    for n in notes:
        for s in segments:
            overlap = max(0.0, min(n.end, s.end) - max(n.start, s.start))
            if overlap > 0:
                total += overlap
                if n.midi % 12 in s.chord.tones():
                    covered += overlap
    return round(covered / total, 4) if total > 0 else 0.0
