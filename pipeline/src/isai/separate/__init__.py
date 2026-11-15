"""Source separation for full mixes: vocals, drums, bass and other, behind `Separator`.

The default is Hybrid Demucs (torchaudio's `HDEMUCS_HIGH_MUSDB_PLUS` weights). Stems are
audio, so they stay in the stage cache (rule 8); `--keep-stems` writes them out locally.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

import numpy as np

from isai.device import Device

Samples = np.ndarray[Any, np.dtype[np.float32]]

SEPARATE_VERSION = "1"
STEM_RATE = 22_050
STEM_NAMES = ("vocals", "drums", "bass", "other")


@dataclass
class Stems:
    """Mono stems at `STEM_RATE`, aligned with the ingested audio."""

    vocals: Samples
    drums: Samples
    bass: Samples
    other: Samples
    separator: str

    def harmonic(self) -> Samples:
        """Everything but drums and vocals: what the key and chords are read from."""
        return np.asarray(self.bass + self.other, dtype=np.float32)


class Separator(Protocol):
    name: str
    version: str

    def separate(self, samples: Samples, rate: int) -> Stems: ...


def write_stems(stems: Stems, folder: Path) -> list[Path]:
    """`--keep-stems`: one WAV per stem. Never called by the worker (rule 8)."""
    import soundfile as sf  # pyright: ignore[reportMissingTypeStubs]

    folder.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for name in STEM_NAMES:
        path = folder / f"{name}.wav"
        sf.write(path, getattr(stems, name), STEM_RATE)  # pyright: ignore[reportUnknownMemberType]
        paths.append(path)
    return paths


class HDemucsSeparator:
    """Hybrid Demucs, run in 10 s segments overlapping by 1 s with linear crossfades.

    No random shifts, so the output is deterministic (up to GPU rounding, removed by
    rounding the stems to 16-bit precision).
    """

    name = "hdemucs"
    version = "high-musdb-plus-1"
    segment_sec = 10.0
    overlap_sec = 1.0
    model_rate = 44_100

    def __init__(self, checkpoint: Path, device: Device = "cpu") -> None:
        self.checkpoint = checkpoint
        self.device = device
        self._model: Any = None

    def _load(self) -> Any:
        if self._model is None:
            import torch
            from torchaudio.models import hdemucs_high  # pyright: ignore[reportMissingTypeStubs]

            model: Any = hdemucs_high(sources=["drums", "bass", "other", "vocals"])
            state: Any = torch.load(self.checkpoint, map_location="cpu", weights_only=True)  # pyright: ignore[reportUnknownMemberType]
            model.load_state_dict(state)
            model.to(self.device)
            model.eval()
            self._model = model
        return self._model

    def separate(self, samples: Samples, rate: int) -> Stems:
        import torch

        if rate != self.model_rate:
            raise ValueError(f"HDemucs wants {self.model_rate} Hz audio, got {rate}")
        model = self._load()
        mix = torch.from_numpy(np.stack([samples, samples]).astype(np.float32))  # pyright: ignore[reportUnknownMemberType]
        mean, std = float(mix.mean()), float(mix.std()) or 1.0
        mix = ((mix - mean) / std)[None]  # (1, 2, T)
        length = mix.shape[-1]
        segment = int(self.segment_sec * rate)
        overlap = int(self.overlap_sec * rate)
        out = torch.zeros(4, length)
        weight = torch.zeros(length)
        torch.manual_seed(0)  # pyright: ignore[reportUnknownMemberType]
        start = 0
        with torch.inference_mode():
            while start < length:
                end = min(length, start + segment)
                chunk = mix[..., start:end].to(self.device)
                pred: Any = model(chunk)  # (1, 4 sources, 2 channels, n)
                piece = pred[0].mean(dim=1).cpu()  # mono per source
                n = end - start
                ramp = torch.ones(n)
                if start > 0:
                    fade = min(overlap, n)
                    ramp[:fade] = torch.linspace(0, 1, fade)
                if end < length:
                    fade = min(overlap, n)
                    ramp[n - fade :] = torch.minimum(ramp[n - fade :], torch.linspace(1, 0, fade))
                out[:, start:end] += piece * ramp
                weight[start:end] += ramp
                if end == length:
                    break
                start = end - overlap
        stems = (out / weight.clamp(min=1e-6)) * std + mean
        array = np.asarray(stems.numpy(), dtype=np.float32)  # pyright: ignore[reportUnknownMemberType]
        return self._finish(array, rate)

    def _finish(self, sources: np.ndarray[Any, Any], rate: int) -> Stems:
        from math import gcd

        from scipy.signal import resample_poly  # pyright: ignore[reportMissingTypeStubs, reportUnknownVariableType]

        g = gcd(STEM_RATE, rate)

        def mono(index: int) -> Samples:
            resampled: Any = resample_poly(sources[index], STEM_RATE // g, rate // g)  # pyright: ignore[reportUnknownVariableType]
            low = np.asarray(resampled, dtype=np.float64)
            return np.asarray(np.round(low * 32768) / 32768, dtype=np.float32)

        drums, bass, other, vocals = (mono(i) for i in range(4))
        return Stems(
            vocals=vocals,
            drums=drums,
            bass=bass,
            other=other,
            separator=f"{self.name}-{self.version}",
        )
