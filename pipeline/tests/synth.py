"""Test audio, synthesised at test time (no real songs in the repo, rule 8)."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

Audio = np.ndarray[Any, np.dtype[np.float64]]


def tone(freq: float, seconds: float, rate: int = 44_100, amplitude: float = 1.0) -> Audio:
    t = np.arange(round(seconds * rate)) / rate
    return amplitude * np.sin(2 * np.pi * freq * t)


def silence(seconds: float, rate: int = 44_100) -> Audio:
    return np.zeros(round(seconds * rate))


def write_wav(path: Path, samples: Audio, rate: int = 44_100) -> Path:
    sf.write(str(path), samples, rate, subtype="FLOAT")  # pyright: ignore[reportUnknownMemberType]
    return path


def ffmpeg() -> str | None:
    return shutil.which("ffmpeg")


def encode(wav: Path, suffix: str) -> Path:
    """Re-encode a WAV with ffmpeg (MP3, FLAC, M4A)."""
    exe = ffmpeg()
    assert exe, "ffmpeg is needed to encode test files"
    out = wav.with_suffix(suffix)
    subprocess.run([exe, "-v", "error", "-y", "-i", str(wav), str(out)], check=True)
    return out


def click_track(
    bpm: float,
    beats_per_bar: int,
    seconds: float = 20.0,
    rate: int = 22_050,
    ramp_to: float | None = None,
    start: float = 0.5,
) -> tuple[Audio, list[float]]:
    """Clicks on every beat, louder and higher on each downbeat; returns audio and click times.

    With `ramp_to`, the tempo moves linearly from `bpm` to `ramp_to` over the track.
    """
    out = np.zeros(round(seconds * rate))
    length = round(0.03 * rate)
    n = np.arange(length)
    envelope = np.exp(-n / (0.006 * rate))
    times: list[float] = []
    t, i = start, 0
    while t < seconds - 0.1:
        downbeat = i % beats_per_bar == 0
        burst = (
            (1.0 if downbeat else 0.45)
            * envelope
            * np.sin(2 * np.pi * (1500 if downbeat else 1000) * n / rate)
        )
        at = round(t * rate)
        out[at : at + length] += burst[: out[at : at + length].size]
        times.append(t)
        tempo = bpm if ramp_to is None else bpm + (ramp_to - bpm) * t / seconds
        t += 60 / tempo
        i += 1
    return out, times


def harmonic_note(midi: float, seconds: float, rate: int = 22_050, cents: float = 0.0) -> Audio:
    """A plucked tone with four decaying partials, `cents` away from equal temperament at A440."""
    freq = 440 * 2 ** ((midi - 69) / 12) * 2 ** (cents / 1200)
    t = np.arange(round(seconds * rate)) / rate
    envelope = np.minimum(1, t / 0.02) * np.exp(-t * 1.5)
    partials = sum((0.6**k) * np.sin(2 * np.pi * freq * (k + 1) * t) for k in range(4))
    return np.asarray(partials * envelope, dtype=np.float64)


def cadence(
    tonic: int, mode: str, cents: float = 0.0, cycles: int = 2, rate: int = 22_050
) -> Audio:
    """I-IV-V-I in major, or i-iv-V-i in minor (raised leading tone in V), a chord a second.

    Each chord is the root an octave down plus a root-position triad around C3-B3 + tonic.
    """
    third = 4 if mode == "major" else 3
    chords = [(0, third, 7), (5, 5 + third, 12), (7, 11, 14), (0, third, 7)]
    base = 48 + tonic
    parts: list[Audio] = []
    for _ in range(cycles):
        for root, middle, top in chords:
            pitches = (base + root - 12, base + root, base + middle, base + top)
            parts.append(sum((harmonic_note(p, 1.0, rate, cents) for p in pitches), np.zeros(rate)))
    return np.concatenate(parts) * 0.1
