"""Decoding any common audio format with the system ffmpeg (>= 6), through a pipe.

No temporary audio files are written. ffmpeg downmixes to mono and resamples; the output
is raw 32-bit float PCM read straight into numpy.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from isai.errors import DecodeError

MIN_FFMPEG_MAJOR = 6
FFMPEG_ENV = "ISAI_FFMPEG"
FFPROBE_ENV = "ISAI_FFPROBE"


@dataclass(frozen=True)
class Tools:
    ffmpeg: str
    ffprobe: str
    version: str


def _locate(name: str, env: str) -> str:
    override = os.environ.get(env)
    found = override or shutil.which(name)
    if not found:
        raise DecodeError(
            f"{name} was not found. Install ffmpeg 6 or newer and put it on PATH "
            f"(or set {env} to the {name} executable)."
        )
    return found


def find_tools() -> Tools:
    """ffmpeg and ffprobe, checked to be version 6 or newer."""
    ffmpeg = _locate("ffmpeg", FFMPEG_ENV)
    ffprobe = _locate("ffprobe", FFPROBE_ENV)
    try:
        banner = subprocess.run(
            [ffmpeg, "-hide_banner", "-version"],
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        ).stdout
    except (OSError, subprocess.SubprocessError) as e:
        raise DecodeError(f"ffmpeg at {ffmpeg} could not be run: {e}") from e
    match = re.search(r"ffmpeg version n?(\d+)\.(\d+)", banner)
    if not match:
        raise DecodeError(f"could not read the ffmpeg version from: {banner.splitlines()[:1]}")
    if int(match.group(1)) < MIN_FFMPEG_MAJOR:
        raise DecodeError(
            f"ffmpeg {match.group(1)}.{match.group(2)} is too old; Isai needs 6 or newer"
        )
    return Tools(ffmpeg=ffmpeg, ffprobe=ffprobe, version=f"{match.group(1)}.{match.group(2)}")


def probe_duration(tools: Tools, path: Path) -> float | None:
    """The file's duration in seconds from its container, or None if ffprobe can't tell."""
    result = subprocess.run(
        [
            tools.ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if result.returncode != 0:
        raise DecodeError(
            f"{path.name} is not an audio file ffmpeg can read: {_last_line(result.stderr)}"
        )
    try:
        info: dict[str, Any] = json.loads(result.stdout)
        return float(info["format"]["duration"])
    except (ValueError, KeyError, TypeError):
        return None


def decode(
    tools: Tools, path: Path, rate: int, max_seconds: float
) -> np.ndarray[Any, np.dtype[np.float32]]:
    """Mono float32 samples at `rate`. Stops reading after `max_seconds` plus a second."""
    command = [
        tools.ffmpeg,
        "-nostdin",
        "-v",
        "error",
        "-i",
        str(path),
        "-t",
        f"{max_seconds + 1:.3f}",
        "-vn",
        "-ac",
        "1",
        "-ar",
        str(rate),
        "-f",
        "f32le",
        "-",
    ]
    result = subprocess.run(command, capture_output=True, timeout=600)
    if result.returncode != 0:
        message = result.stderr.decode("utf-8", errors="replace")
        raise DecodeError(f"ffmpeg could not decode {path.name}: {_last_line(message)}")
    samples = np.frombuffer(result.stdout, dtype="<f4").astype(np.float32)
    if samples.size == 0:
        raise DecodeError(f"{path.name} has no audio stream")
    return samples


def _last_line(text: str) -> str:
    lines = [line.strip() for line in text.strip().splitlines() if line.strip()]
    return lines[-1] if lines else "no details"
