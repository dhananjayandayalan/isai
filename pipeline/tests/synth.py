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
