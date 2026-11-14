"""Tonality: tuning offset, a beat-weighted chroma of the harmonic part, and the key."""

from __future__ import annotations

import itertools
from dataclasses import dataclass
from typing import Any

import numpy as np

from isai.theory.keyfinding import KeyMode, find_key, key_name, modal_scale
from isai.theory.scales import scale

TONALITY_VERSION = "1"

Samples = np.ndarray[Any, np.dtype[np.float32]]
Vector = np.ndarray[Any, np.dtype[np.float64]]

HOP = 512
# Below this peak level there is nothing to measure a tuning from.
SILENT = 1e-6


@dataclass
class Tonality:
    tonic: int
    key: str
    """The tonic as the Song writes it ("G", "Bb")."""
    mode: KeyMode
    scale: list[int]
    confidence: float
    """`confidence.key` in the Song."""
    tuning_cents: float
    """How far the recording sits from A440, in cents."""
    chroma: Vector
    """The 12-bin profile the key was read from (C first)."""


def tuning_offset(harmonic: Samples, rate: int) -> float:
    """Cents from A440 (-50 to +50), from a pitch histogram of the harmonic part (0 if silent)."""
    import librosa  # pyright: ignore[reportMissingTypeStubs]

    if harmonic.size == 0 or float(np.max(np.abs(harmonic))) < SILENT:
        return 0.0

    fraction = float(librosa.estimate_tuning(y=harmonic, sr=rate, bins_per_octave=12))  # pyright: ignore[reportUnknownMemberType, reportUnknownArgumentType]
    return round(100.0 * fraction, 1)


def weighted_chroma(
    harmonic: Samples, rate: int, tuning_cents: float, beats: list[float]
) -> Vector:
    """A CQT chroma, averaged per beat and weighted by each beat's energy, summed to one profile.

    With fewer than two beats, every frame counts with its own energy.
    """
    import librosa  # pyright: ignore[reportMissingTypeStubs]

    chroma = np.asarray(
        librosa.feature.chroma_cqt(
            y=harmonic, sr=rate, hop_length=HOP, tuning=tuning_cents / 100.0
        ),  # pyright: ignore[reportUnknownMemberType]
        dtype=np.float64,
    )
    energy = np.asarray(librosa.feature.rms(y=harmonic, hop_length=HOP)[0], dtype=np.float64)  # pyright: ignore[reportUnknownMemberType]
    frames = min(chroma.shape[1], energy.size)
    chroma, energy = chroma[:, :frames], energy[:frames]
    if len(beats) >= 2:
        edges = np.unique(
            np.clip(np.round(np.asarray(beats) * rate / HOP).astype(np.int64), 0, frames)
        )
        edges = (
            np.concatenate(([0], edges[edges > 0], [frames]))
            if edges.size
            else np.array([0, frames])
        )
        profile = np.zeros(12)
        for start, end in itertools.pairwise(edges.tolist()):
            if end > start:
                profile += chroma[:, start:end].mean(axis=1) * energy[start:end].mean()
        return profile
    return chroma @ energy


def analyse_tonality(samples: Samples, rate: int, beats: list[float]) -> Tonality:
    """Key, mode, scale and tuning of `samples` (beats in seconds on the same audio)."""
    import librosa  # pyright: ignore[reportMissingTypeStubs]

    harmonic = np.asarray(librosa.effects.harmonic(samples), dtype=np.float32)  # pyright: ignore[reportUnknownMemberType]
    cents = tuning_offset(harmonic, rate)
    profile = weighted_chroma(harmonic, rate, cents, beats)
    estimate = find_key([float(x) for x in profile]) if profile.max() > 0 else None
    if estimate is None:
        # No pitched content to read a key from (drums only, noise): C major, no confidence.
        return Tonality(0, "C", "major", scale(0, "major"), 0.0, cents, profile)
    mode: KeyMode = estimate.mode
    notes = (
        modal_scale(profile.tolist(), estimate.tonic)[1]
        if mode == "modal"
        else scale(estimate.tonic, mode)
    )
    return Tonality(
        tonic=estimate.tonic,
        key=key_name(estimate.tonic, mode),
        mode=mode,
        scale=notes,
        confidence=estimate.confidence,
        tuning_cents=cents,
        chroma=np.round(profile / (profile.max() or 1.0), 6),
    )
