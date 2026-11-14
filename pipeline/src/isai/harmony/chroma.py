"""Chroma per beat: from audio (CQT) and from notes. The grid includes the time before the
first beat and after the last, so chords cover the whole song."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import numpy as np

from isai.transcribe.types import TNote

Matrix = np.ndarray[Any, np.dtype[np.float64]]
Vector = np.ndarray[Any, np.dtype[np.float64]]
Samples = np.ndarray[Any, np.dtype[np.float32]]

HOP = 512
BASS_BELOW = 55  # notes under G3 count as bass


def beat_edges(beats: Sequence[float], duration: float) -> list[float]:
    """Interval boundaries: 0, every beat inside the song, and the end."""
    inner = sorted({round(b, 3) for b in beats if 0 < b < duration})
    return [0.0, *inner, round(duration, 3)]


def audio_chroma(
    samples: Samples, rate: int, edges: Sequence[float], tuning_cents: float = 0.0
) -> tuple[Matrix, Vector]:
    """Mean CQT chroma and RMS energy per interval."""
    import librosa  # pyright: ignore[reportMissingTypeStubs]

    intervals = len(edges) - 1
    if samples.size < HOP * 2 or intervals <= 0:
        return np.zeros((max(0, intervals), 12)), np.zeros(max(0, intervals))
    chroma = np.asarray(
        librosa.feature.chroma_cqt(  # pyright: ignore[reportUnknownMemberType]
            y=samples, sr=rate, hop_length=HOP, tuning=tuning_cents / 100.0
        ),
        dtype=np.float64,
    )
    energy = np.asarray(librosa.feature.rms(y=samples, hop_length=HOP)[0], dtype=np.float64)  # pyright: ignore[reportUnknownMemberType]
    frames = min(chroma.shape[1], energy.size)
    out = np.zeros((intervals, 12))
    loud = np.zeros(intervals)
    for i in range(intervals):
        a = min(frames - 1, int(edges[i] * rate / HOP))
        b = max(a + 1, min(frames, int(np.ceil(edges[i + 1] * rate / HOP))))
        out[i] = chroma[:, a:b].mean(axis=1)
        loud[i] = energy[a:b].mean()
    return out, loud


def _overlaps(note: TNote, start: float, end: float) -> float:
    return max(0.0, min(note.end, end) - max(note.start, start))


def notes_chroma(notes: Sequence[TNote], edges: Sequence[float]) -> tuple[Matrix, Vector]:
    """Sounding seconds per pitch class per interval, and the total as energy."""
    intervals = len(edges) - 1
    out = np.zeros((max(0, intervals), 12))
    ordered = sorted(notes, key=lambda n: n.start)
    for i in range(max(0, intervals)):
        a, b = edges[i], edges[i + 1]
        for note in ordered:
            if note.start >= b:
                break
            overlap = _overlaps(note, a, b)
            if overlap > 0:
                out[i, note.midi % 12] += overlap * (note.velocity / 127)
    return out, out.sum(axis=1)


def bass_per_beat(notes: Sequence[TNote], edges: Sequence[float]) -> list[int | None]:
    """The pitch class sounding longest below `BASS_BELOW` in each interval, if any."""
    low = [n for n in notes if n.midi < BASS_BELOW]
    out: list[int | None] = []
    for i in range(len(edges) - 1):
        time = np.zeros(12)
        for note in low:
            time[note.midi % 12] += _overlaps(note, edges[i], edges[i + 1])
        out.append(int(np.argmax(time)) if time.max() > 0 else None)
    return out


def blend(a: Matrix, b: Matrix, weight: float) -> Matrix:
    """Row-normalised profiles mixed: `(1 - weight) * a + weight * b`."""

    def unit(m: Matrix) -> Matrix:
        sums = m.sum(axis=1, keepdims=True)
        return np.divide(m, sums, out=np.zeros_like(m), where=sums > 0)

    return (1 - weight) * unit(a) + weight * unit(b)
