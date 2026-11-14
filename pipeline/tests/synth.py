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
