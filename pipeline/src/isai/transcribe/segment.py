"""Note segmentation: a pitch track (f0 + voicing per frame) to notes. Pure: no audio.

Steps, in order:
1. Voicing with hysteresis: a frame turns voiced above `voice_on` and stays voiced until
   it drops below `voice_off`, so a wobbly confidence doesn't chop notes.
2. A median filter on the voiced f0, to remove octave blips.
3. Cents relative to the song's tuning, so a choir at A=446 still lands on semitones.
4. Semitone quantising with hysteresis and a stability window: the pitch changes only
   when the f0 moves more than `switch_semitones` away and stays there for
   `stable_sec`, so vibrato and slides don't split a note.
5. Notes from runs of one pitch; same-pitch notes across gaps under `merge_gap_sec` are
   merged; notes under `min_note_sec` are dropped.
6. Velocity from the frames' RMS, relative to the loud end of the track.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import numpy as np

from isai.transcribe.types import F0Track, TNote

Vector = np.ndarray[Any, np.dtype[np.float64]]
Mask = np.ndarray[Any, np.dtype[np.bool_]]

A4_HZ = 440.0
A4_MIDI = 69


@dataclass(frozen=True)
class SegmentOptions:
    voice_on: float = 0.5
    voice_off: float = 0.3
    median_sec: float = 0.05
    switch_semitones: float = 0.7
    """How far (in semitones) the f0 must move from the current note to start a new one."""
    stable_sec: float = 0.06
    """How long a new pitch must hold before it counts."""
    min_note_sec: float = 0.08
    merge_gap_sec: float = 0.06
    midi_range: tuple[int, int] = (21, 108)


def hz_to_semitones(hz: Vector, tuning_cents: float = 0.0) -> Vector:
    """Fractional MIDI numbers, corrected by the tuning offset (NaN where hz <= 0)."""
    out = np.full(hz.shape, np.nan)
    voiced = hz > 0
    out[voiced] = A4_MIDI + 12 * np.log2(hz[voiced] / A4_HZ) - tuning_cents / 100
    return out


def tuning_from_f0(hz: Vector, voiced: Mask) -> float:
    """The track's tuning offset in cents (-50 to 50): the circular mean of the deviations."""
    semis = hz_to_semitones(hz[voiced & (hz > 0)])
    if semis.size == 0:
        return 0.0
    angles = 2 * np.pi * (semis - np.round(semis))
    mean = math.atan2(float(np.sin(angles).mean()), float(np.cos(angles).mean()))
    return round(100 * mean / (2 * np.pi), 1)


def hysteresis(confidence: Vector, on: float, off: float) -> Mask:
    """Voiced frames: on above `on`, off again below `off`."""
    out = np.zeros(confidence.shape, dtype=bool)
    state = False
    for i, c in enumerate(confidence.tolist()):
        state = c >= on if not state else c >= off
        out[i] = state
    return out


def median_voiced(values: Vector, voiced: Mask, width: int) -> Vector:
    """A running median over voiced frames only (each voiced run filtered on its own)."""
    out = values.copy()
    if width <= 1:
        return out
    half = width // 2
    for start, end in _runs(voiced):
        run = values[start:end]
        for i in range(run.size):
            low, high = max(0, i - half), min(run.size, i + half + 1)
            out[start + i] = float(np.median(run[low:high]))
    return out


def _runs(mask: Mask) -> list[tuple[int, int]]:
    """[start, end) index pairs of the True runs."""
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for i, value in enumerate(mask.tolist()):
        if value and start is None:
            start = i
        elif not value and start is not None:
            runs.append((start, i))
            start = None
    if start is not None:
        runs.append((start, mask.size))
    return runs


def quantise(semis: Vector, voiced: Mask, switch: float, stable: int) -> list[int | None]:
    """A semitone per frame (None when unvoiced), held through vibrato and slides."""
    labels: list[int | None] = [None] * semis.size
    for start, end in _runs(voiced):
        current = round(float(np.median(semis[start : min(end, start + stable)])))
        pending: int | None = None
        pending_since = 0
        for i in range(start, end):
            value = float(semis[i])
            candidate = round(value)
            if abs(value - current) <= switch:
                pending = None
            elif candidate != pending:
                pending, pending_since = candidate, i
            elif i - pending_since + 1 >= stable:
                current, pending = candidate, None
                for j in range(pending_since, i + 1):  # the new note starts where it began
                    labels[j] = current
            labels[i] = current
    return labels


def _velocity(rms: Vector) -> Vector:
    """1-127 from RMS in dB, relative to the track's loud end (95th percentile = 100)."""
    db = 20 * np.log10(np.maximum(rms, 1e-9))
    loud = float(np.percentile(db, 95)) if db.size else 0.0
    return np.clip(np.round(100 + 2.0 * (db - loud)), 20, 127)


def segment(
    track: F0Track, tuning_cents: float = 0.0, options: SegmentOptions | None = None
) -> list[TNote]:
    """Notes from a pitch track, in seconds on the track's timeline."""
    opts = options or SegmentOptions()
    if track.times.size == 0:
        return []
    hop = float(np.median(np.diff(track.times))) if track.times.size > 1 else 0.01
    voiced = hysteresis(track.confidence, opts.voice_on, opts.voice_off) & (track.hz > 0)
    semis = hz_to_semitones(track.hz, tuning_cents)
    semis = median_voiced(semis, voiced, max(1, round(opts.median_sec / hop)) | 1)
    labels = quantise(semis, voiced, opts.switch_semitones, max(1, round(opts.stable_sec / hop)))
    velocity = _velocity(track.rms)

    raw: list[TNote] = []
    i = 0
    while i < len(labels):
        label = labels[i]
        if label is None:
            i += 1
            continue
        j = i
        while j + 1 < len(labels) and labels[j + 1] == label:
            j += 1
        start = float(track.times[i]) - hop / 2
        end = float(track.times[j]) + hop / 2
        vel = int(np.median(velocity[i : j + 1]))
        raw.append(TNote(round(max(0.0, start), 3), round(end, 3), label, vel))
        i = j + 1

    merged: list[TNote] = []
    for note in raw:
        last = merged[-1] if merged else None
        if last and last.midi == note.midi and note.start - last.end < opts.merge_gap_sec:
            merged[-1] = TNote(last.start, note.end, last.midi, max(last.velocity, note.velocity))
        else:
            merged.append(note)
    low, high = opts.midi_range
    return [
        n for n in merged if n.end - n.start >= opts.min_note_sec - 1e-9 and low <= n.midi <= high
    ]
