"""Fake models for the fast tests: deterministic, instant, no torch, no weights."""

from __future__ import annotations

from typing import Any

import numpy as np

from isai.pipeline import Models
from isai.separate import STEM_RATE, Stems
from isai.transcribe.piano import PianoResult
from isai.transcribe.types import F0Track, PedalSpan, TNote

Samples = np.ndarray[Any, np.dtype[np.float32]]


class FakeSeparator:
    name = "fake-separator"
    version = "1"

    def __init__(self) -> None:
        self.calls = 0

    def separate(self, samples: Samples, rate: int) -> Stems:
        self.calls += 1
        step = max(1, rate // STEM_RATE)
        low = np.asarray(samples[::step], dtype=np.float32)
        quarter = np.asarray(low / 4, dtype=np.float32)
        return Stems(
            vocals=quarter, drums=quarter, bass=quarter, other=quarter, separator="fake-separator-1"
        )


class FakePiano:
    """A C major arpeggio in the right hand over a low C, every second, with the pedal down."""

    name = "fake-piano"
    version = "1"

    def __init__(self) -> None:
        self.calls = 0

    def transcribe(self, samples: Samples, rate: int) -> PianoResult:
        self.calls += 1
        seconds = samples.size / rate
        notes: list[TNote] = []
        t = 0.0
        while t + 1 <= seconds:
            notes.append(TNote(t, t + 0.9, 36, 70))
            notes += [
                TNote(t + i * 0.25, t + i * 0.25 + 0.2, p, 80)
                for i, p in enumerate((60, 64, 67, 72))
            ]
            t += 1.0
        return PianoResult(notes, [PedalSpan(0.0, 0.5)], 0.75)


class FakePitch:
    """A line stepping up the G major scale, half a second per note, with rests between."""

    name = "fake-pitch"
    version = "1"

    def __init__(self) -> None:
        self.calls = 0

    def track(self, samples: Samples, rate: int) -> F0Track:
        self.calls += 1
        frames = int(samples.size / rate * 100)
        times = np.arange(frames, dtype=np.float64) * 0.01
        scale = (67, 69, 71, 72, 74, 76, 78, 79)
        midi = np.array([scale[int(t // 0.6) % len(scale)] for t in times], dtype=np.float64)
        voiced = (times % 0.6) < 0.5
        hz = np.where(voiced, 440.0 * 2 ** ((midi - 69) / 12), 0.0)
        return F0Track(
            times=times,
            hz=hz,
            confidence=np.where(voiced, 0.9, 0.05),
            rms=np.full(frames, 0.1),
        )


def fake_models() -> tuple[Models, FakeSeparator, FakePiano, FakePitch]:
    separator, piano, pitch = FakeSeparator(), FakePiano(), FakePitch()
    models = Models(
        separator=lambda: separator,
        separator_id="fake-separator-1",
        piano=lambda: piano,
        piano_id="fake-piano-1",
        pitch=lambda: pitch,
        pitch_id="fake-pitch-1",
    )
    return models, separator, piano, pitch
