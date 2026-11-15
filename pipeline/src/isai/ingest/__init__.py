"""Ingest: any common audio file to normalised mono PCM (ffmpeg decode, loudness, trim)."""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
from scipy.signal import resample_poly  # pyright: ignore[reportMissingTypeStubs, reportUnknownVariableType]  # untyped scipy

from isai.errors import SilentAudioError, TooLongError
from isai.ingest.decode import Tools, decode, find_tools, probe_duration
from isai.ingest.loudness import TARGET_LUFS, integrated_loudness, normalise
from isai.ingest.trim import sound_span
from isai.ingest.types import LOW_RATE, RATE, Ingested, IngestLimits

INGEST_VERSION = "1"

__all__ = ["INGEST_VERSION", "IngestLimits", "Ingested", "ingest"]


def _minutes(seconds: float) -> str:
    return f"{seconds / 60:.1f} minutes"


def ingest(path: Path, limits: IngestLimits | None = None, tools: Tools | None = None) -> Ingested:
    """Decode `path`, measure and normalise its loudness, and trim the silence at both ends.

    Raises `DecodeError` (exit 4), `TooLongError` (exit 5) or `SilentAudioError` (exit 6).
    """
    limits = limits or IngestLimits()
    size = path.stat().st_size
    if size > limits.max_bytes:
        raise TooLongError(
            f"{path.name} is {size / 1e6:.0f} MB; the limit is {limits.max_bytes / 1e6:.0f} MB"
        )
    tools = tools or find_tools()
    declared = probe_duration(tools, path)
    if declared is not None and declared > limits.max_seconds:
        raise TooLongError(
            f"{path.name} is {_minutes(declared)} long; the limit is {_minutes(limits.max_seconds)}"
        )

    decoded = decode(tools, path, RATE, limits.max_seconds)
    duration = decoded.size / RATE
    if duration > limits.max_seconds:
        raise TooLongError(f"{path.name} is longer than {_minutes(limits.max_seconds)}")
    audio_hash = hashlib.sha256(decoded.astype("<f4").tobytes()).hexdigest()

    loudness = integrated_loudness(decoded, RATE)
    if loudness is None:
        raise SilentAudioError(f"{path.name} is silent")
    normalised = normalise(decoded, loudness, TARGET_LUFS)
    span = sound_span(normalised, RATE)
    if span is None:
        raise SilentAudioError(f"{path.name} is silent")
    start, end = span
    samples = np.ascontiguousarray(normalised[start:end])
    low = np.asarray(resample_poly(samples, LOW_RATE, RATE), dtype=np.float32)
    return Ingested(
        samples=samples,
        samples_low=low,
        offset_sec=start / RATE,
        duration_sec=duration,
        loudness_lufs=loudness,
        audio_hash=audio_hash,
    )
