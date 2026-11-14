"""Synthesised test pieces with known beats, to smoke-test the harness before real audio.

They are easy for every tracker; real songs decide the ADR. Each piece returns mono audio
at 44.1 kHz and its beat times, with the downbeats marked.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

RATE = 44_100
Audio = np.ndarray[Any, np.dtype[np.float64]]


@dataclass
class Piece:
    id: str
    audio: Audio
    beats: list[float]
    downbeats: list[float]
    bpm: float
    beats_per_bar: int


def _burst(freq: float, seconds: float, decay: float) -> Audio:
    t = np.arange(round(seconds * RATE)) / RATE
    return np.sin(2 * np.pi * freq * t) * np.exp(-t / decay)


def _noise(seconds: float, decay: float, seed: int) -> Audio:
    rng = np.random.default_rng(seed)
    t = np.arange(round(seconds * RATE)) / RATE
    return rng.standard_normal(t.size) * np.exp(-t / decay)


def _place(total: Audio, sound: Audio, at: float, gain: float) -> None:
    start = round(at * RATE)
    end = min(total.size, start + sound.size)
    if start < total.size:
        total[start:end] += gain * sound[: end - start]


def _beat_times(bpm: float, seconds: float, start: float, wobble: float = 0.0) -> list[float]:
    """Beats from `start`; `wobble` bends the tempo by up to that fraction, slowly."""
    times: list[float] = []
    t = start
    while t < seconds - 0.5:
        times.append(round(t, 4))
        bend = 1 + wobble * np.sin(2 * np.pi * t / 8.0)
        t += 60.0 / (bpm * bend)
    return times


def clicks(bpm: float, beats_per_bar: int, seconds: float = 30.0) -> Piece:
    beats = _beat_times(bpm, seconds, 0.5)
    audio = np.zeros(round(seconds * RATE))
    for i, b in enumerate(beats):
        down = i % beats_per_bar == 0
        _place(audio, _burst(1500 if down else 1000, 0.05, 0.01), b, 0.9 if down else 0.5)
    name = f"clicks-{bpm:g}-{beats_per_bar}"
    return Piece(name, audio, beats, beats[::beats_per_bar], bpm, beats_per_bar)


def drums(bpm: float, seconds: float = 30.0, wobble: float = 0.0) -> Piece:
    """Kick on 1 and 3, snare on 2 and 4, hi-hat on the eighths, a bass note per bar."""
    beats = _beat_times(bpm, seconds, 0.5, wobble)
    audio = np.zeros(round(seconds * RATE))
    for i, b in enumerate(beats):
        position = i % 4
        if position in (0, 2):
            _place(audio, _burst(55, 0.25, 0.08), b, 1.0)
        else:
            _place(audio, _noise(0.15, 0.04, seed=i), b, 0.4)
        _place(audio, _noise(0.04, 0.01, seed=10_000 + i), b, 0.15)
        if i + 1 < len(beats):
            _place(audio, _noise(0.04, 0.01, seed=20_000 + i), (b + beats[i + 1]) / 2, 0.1)
        if position == 0:
            _place(audio, _burst(110 * 2 ** ((i // 4 % 4) * 5 / 12), 1.5, 0.6), b, 0.3)
    name = f"drums-{bpm:g}" + ("-rubato" if wobble else "")
    return Piece(name, audio, beats, beats[::4], bpm, 4)


def pieces() -> list[Piece]:
    return [
        clicks(60, 4),
        clicks(90, 3),
        clicks(120, 4),
        clicks(174, 4),
        clicks(150, 3),
        drums(100),
        drums(132),
        drums(96, wobble=0.06),
    ]
