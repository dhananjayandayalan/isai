"""Melody: a pitch tracker (behind `PitchTracker`) and segmentation into notes.

Trackers work on 16 kHz mono with a 10 ms hop and return f0, voicing confidence and RMS
per frame. pYIN (librosa) needs nothing extra; torchcrepe needs torch.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

import numpy as np

from isai.device import Device
from isai.transcribe.segment import SegmentOptions, hysteresis, segment, tuning_from_f0
from isai.transcribe.types import F0Track, TNote, Vector

Samples = np.ndarray[Any, np.dtype[np.float32]]

RATE = 16_000
HOP = 160  # 10 ms
FMIN = 65.0  # C2: low enough for a bass line
FMAX = 1100.0  # about C#6: above any sung melody
_DECIMALS = 3


class PitchTracker(Protocol):
    name: str
    version: str

    def track(self, samples: Samples, rate: int) -> F0Track: ...


def _resample(samples: Samples, rate: int) -> Samples:
    if rate == RATE:
        return samples
    from math import gcd

    from scipy.signal import resample_poly  # pyright: ignore[reportMissingTypeStubs, reportUnknownVariableType]

    g = gcd(RATE, rate)
    return np.asarray(resample_poly(samples, RATE // g, rate // g), dtype=np.float32)


def frame_rms(samples: Samples, frames: int) -> Vector:
    """RMS over 25 ms windows centred on each 10 ms frame."""
    half = 200
    padded = np.pad(samples.astype(np.float64), (half, half + HOP * frames))
    out = np.empty(frames)
    for i in range(frames):
        window = padded[i * HOP : i * HOP + 2 * half]
        out[i] = float(np.sqrt(np.mean(window * window))) if window.size else 0.0
    return out


class PyinTracker:
    """librosa's probabilistic YIN: no model, slower, weaker on noisy stems."""

    name = "pyin"
    version = "1"

    def track(self, samples: Samples, rate: int) -> F0Track:
        import librosa  # pyright: ignore[reportMissingTypeStubs]

        audio = _resample(samples, rate)
        f0, _, probability = librosa.pyin(  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
            audio, fmin=FMIN, fmax=FMAX, sr=RATE, frame_length=1024, hop_length=HOP
        )
        hz = np.nan_to_num(np.asarray(f0, dtype=np.float64), nan=0.0)
        frames = hz.size
        return F0Track(
            times=np.arange(frames, dtype=np.float64) * HOP / RATE,
            hz=hz,
            confidence=np.asarray(probability, dtype=np.float64),
            rms=frame_rms(audio, frames),
        )


class CrepeTracker:
    """torchcrepe's "full" CREPE model with Viterbi decoding; periodicity as confidence."""

    name = "torchcrepe"
    version = "full-1"

    def __init__(self, device: Device = "cpu", batch_size: int = 512) -> None:
        self.device = device
        self.batch_size = batch_size

    def track(self, samples: Samples, rate: int) -> F0Track:
        import torch
        import torchcrepe  # pyright: ignore[reportMissingTypeStubs]

        audio = _resample(samples, rate)
        torch.manual_seed(0)  # pyright: ignore[reportUnknownMemberType]
        with torch.inference_mode():
            pitch, periodicity = torchcrepe.predict(  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
                torch.from_numpy(audio)[None, :],  # pyright: ignore[reportUnknownMemberType]
                RATE,
                hop_length=HOP,
                fmin=FMIN,
                fmax=FMAX,
                model="full",
                decoder=torchcrepe.decode.viterbi,  # pyright: ignore[reportUnknownMemberType]
                return_periodicity=True,
                batch_size=self.batch_size,
                device=self.device,
                pad=True,
            )
            periodicity = torchcrepe.filter.median(periodicity, 3)  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        hz = np.asarray(pitch.squeeze(0).cpu().numpy(), dtype=np.float64)  # pyright: ignore[reportUnknownMemberType]
        conf = np.asarray(periodicity.squeeze(0).cpu().numpy(), dtype=np.float64)  # pyright: ignore[reportUnknownMemberType]
        # GPU kernels may differ in the last bits; round so the Song is repeatable.
        hz, conf = np.round(hz, 2), np.round(conf, 3)
        frames = hz.size
        return F0Track(
            times=np.arange(frames, dtype=np.float64) * HOP / RATE,
            hz=hz,
            confidence=conf,
            rms=frame_rms(audio, frames),
        )


@dataclass
class Melody:
    """A tracked line (melody or bass): the pitch track and the notes cut from it."""

    times: Vector
    hz: Vector
    confidence: Vector
    rms: Vector
    note_start: Vector
    note_end: Vector
    note_midi: Vector
    note_velocity: Vector
    tuning_cents: float
    notes_confidence: float
    """Mean voicing confidence over the voiced frames: `meta.confidence.notes`."""
    tracker: str

    def notes(self) -> list[TNote]:
        return [
            TNote(float(s), float(e), int(m), int(v))
            for s, e, m, v in zip(
                self.note_start.tolist(),
                self.note_end.tolist(),
                self.note_midi.tolist(),
                self.note_velocity.tolist(),
                strict=True,
            )
        ]

    def track(self) -> F0Track:
        return F0Track(self.times, self.hz, self.confidence, self.rms)


def analyse_melody(
    samples: Samples,
    rate: int,
    tracker: PitchTracker,
    options: SegmentOptions | None = None,
) -> Melody:
    """Track the pitch, measure its tuning, and segment it into notes."""
    opts = options or SegmentOptions()
    track = tracker.track(samples, rate)
    voiced = hysteresis(track.confidence, opts.voice_on, opts.voice_off) & (track.hz > 0)
    tuning = tuning_from_f0(track.hz, voiced)
    notes = segment(track, tuning, opts)
    confidence = float(track.confidence[voiced].mean()) if voiced.any() else 0.0
    return Melody(
        times=track.times,
        hz=track.hz,
        confidence=track.confidence,
        rms=track.rms,
        note_start=np.array([n.start for n in notes], dtype=np.float64),
        note_end=np.array([n.end for n in notes], dtype=np.float64),
        note_midi=np.array([n.midi for n in notes], dtype=np.float64),
        note_velocity=np.array([n.velocity for n in notes], dtype=np.float64),
        tuning_cents=tuning,
        notes_confidence=round(confidence, 4),
        tracker=f"{tracker.name}-{tracker.version}",
    )
