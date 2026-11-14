"""The candidates, each behind the pipeline's BeatTracker protocol.

A candidate whose package isn't installed reports why instead of failing the run. Each
returns beats and downbeats in seconds on the audio it was given.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from isai.rhythm.tracker import BeatTracker, LibrosaTracker, Samples, TrackedBeats


class BeatThisTracker:
    """Beat This! (Foscarin, Schlüter, Widmer, ISMIR 2024): a transformer, no DBN by default."""

    name = "beat-this"
    version = "final0"

    def __init__(self, dbn: bool = False) -> None:
        from beat_this.inference import Audio2Beats  # pyright: ignore

        self.dbn = dbn
        if dbn:
            self.name = "beat-this-dbn"
        self._model: Any = Audio2Beats(checkpoint_path="final0", device="cpu", dbn=dbn)

    def track(self, samples: Samples, rate: int) -> TrackedBeats:
        beats, downbeats = self._model(samples, rate)
        return TrackedBeats(
            beats=np.asarray(beats, dtype=np.float64),
            downbeats=np.asarray(downbeats, dtype=np.float64),
        )


class MadmomTracker:
    """madmom's RNN beat and downbeat activations decoded with its DBN (3/4 or 4/4)."""

    name = "madmom"
    version = "rnn-dbn"

    def __init__(self) -> None:
        from madmom.features.downbeats import (  # pyright: ignore
            DBNDownBeatTrackingProcessor,
            RNNDownBBeatProcessor,
        )

        self._activations: Any = RNNDownBBeatProcessor()
        self._decode: Any = DBNDownBeatTrackingProcessor(beats_per_bar=[3, 4], fps=100)

    def track(self, samples: Samples, rate: int) -> TrackedBeats:
        from madmom.audio.signal import Signal  # pyright: ignore

        signal = Signal(samples, sample_rate=rate, num_channels=1)
        result = np.asarray(self._decode(self._activations(signal)), dtype=np.float64)
        if result.size == 0:
            return TrackedBeats(beats=np.zeros(0), downbeats=np.zeros(0))
        beats = result[:, 0]
        return TrackedBeats(beats=beats, downbeats=beats[result[:, 1] == 1].copy())


def candidates() -> tuple[list[tuple[BeatTracker, bool]], dict[str, str]]:
    """The trackers that load, each with whether it wants low-rate audio, and the reasons
    the others don't."""
    loaded: list[tuple[BeatTracker, bool]] = [(LibrosaTracker(), True)]
    missing: dict[str, str] = {}
    for name, make in (
        ("beat-this", lambda: BeatThisTracker()),
        ("beat-this-dbn", lambda: BeatThisTracker(dbn=True)),
        ("madmom", lambda: MadmomTracker()),
    ):
        try:
            loaded.append((make(), False))
        except Exception as e:  # an import or a model download failing: report and go on
            missing[name] = f"{type(e).__name__}: {e}"
    return loaded, missing
