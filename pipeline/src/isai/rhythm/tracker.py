"""Beat trackers behind one protocol, so the spike can swap them and tests can fake them."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

import numpy as np

Samples = np.ndarray[Any, np.dtype[np.float32]]
Times = np.ndarray[Any, np.dtype[np.float64]]


@dataclass
class TrackedBeats:
    beats: Times
    """Beat times in seconds, ascending."""
    downbeats: Times
    """The beats that start a bar (a subset of `beats`)."""


class BeatTracker(Protocol):
    name: str
    version: str

    def track(self, samples: Samples, rate: int) -> TrackedBeats: ...


# How much stronger one bar length's accents must be to beat 4/4 (the common case).
METER_MARGIN = 1.05
# 256 samples at 22.05 kHz is 11.6 ms: fine enough that frame rounding doesn't bias the
# median beat interval (at 512, a 120 BPM click read as 117.6 BPM).
HOP = 256
# Accents are read as the strongest onset within this many frames of each beat.
ACCENT_WINDOW = 2


def bar_phase(strengths: Times, meters: tuple[int, ...] = (4, 3)) -> tuple[int, int]:
    """The bar length and the beat that starts the first bar, from accent strength per beat.

    For each bar length and phase, the mean strength of the beats that would be downbeats
    is compared with the mean of all beats; the strongest contrast wins, and 4 wins ties
    within `METER_MARGIN`.
    """
    if strengths.size == 0:
        return 4, 0
    mean = float(strengths.mean()) or 1.0
    best: tuple[float, int, int] | None = None
    for meter in meters:
        for phase in range(min(meter, strengths.size)):
            contrast = float(strengths[phase::meter].mean()) / mean
            if meter != 4:
                contrast /= METER_MARGIN
            if best is None or contrast > best[0]:
                best = (contrast, meter, phase)
    assert best is not None
    return best[1], best[2]


def accents(envelope: Times, beat_frames: np.ndarray[Any, np.dtype[np.int64]]) -> Times:
    """Each beat's accent: the strongest onset within `ACCENT_WINDOW` frames of it."""
    if envelope.size == 0 or beat_frames.size == 0:
        return np.zeros(beat_frames.size)
    out = np.empty(beat_frames.size)
    for i, frame in enumerate(beat_frames.tolist()):
        low = max(0, frame - ACCENT_WINDOW)
        high = min(envelope.size, frame + ACCENT_WINDOW + 1)
        out[i] = envelope[low:high].max() if high > low else 0.0
    return out


class LibrosaTracker:
    """librosa's dynamic-programming beat tracker, with downbeats from where accents fall."""

    name = "librosa"
    version = "1"

    def track(self, samples: Samples, rate: int) -> TrackedBeats:
        import librosa  # pyright: ignore[reportMissingTypeStubs]  # heavy import, only when tracking

        onset = librosa.onset.onset_strength(y=samples, sr=rate, hop_length=HOP)  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        _, frames = librosa.beat.beat_track(onset_envelope=onset, sr=rate, hop_length=HOP)  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        beat_frames = np.asarray(frames, dtype=np.int64)
        beats = np.asarray(
            librosa.frames_to_time(beat_frames, sr=rate, hop_length=HOP), dtype=np.float64
        )  # pyright: ignore[reportUnknownMemberType]
        envelope = np.asarray(onset, dtype=np.float64)
        strengths = accents(envelope, beat_frames)
        meter, phase = bar_phase(strengths)
        return TrackedBeats(beats=beats, downbeats=beats[phase::meter].copy())
