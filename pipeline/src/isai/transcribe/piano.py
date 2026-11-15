"""Piano transcription behind `PianoTranscriber`; the default is ByteDance's model.

Kong et al. 2021, "High-resolution piano transcription with pedals by regressing onset
and offset times": notes with velocities, plus sustain-pedal spans. The adapter builds
the model itself from the verified checkpoint (the package would otherwise download it
with `wget` on its own) and reuses the package's framing and post-processing.
"""

from __future__ import annotations

import contextlib
import io
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

import numpy as np

from isai.device import Device
from isai.transcribe.piano_post import clean_piano
from isai.transcribe.types import Notes, PedalSpan, TNote

Samples = np.ndarray[Any, np.dtype[np.float32]]

RATE = 16_000
SEGMENT_SAMPLES = 10 * RATE
FRAMES_PER_SECOND = 100
LOWEST_KEY = 21  # A0


@dataclass
class PianoResult:
    notes: list[TNote]
    pedals: list[PedalSpan]
    confidence: float
    """Mean onset strength at the detected notes, 0 to 1."""


class PianoTranscriber(Protocol):
    name: str
    version: str

    def transcribe(self, samples: Samples, rate: int) -> PianoResult: ...


def _resample(samples: Samples, rate: int) -> Samples:
    if rate == RATE:
        return samples
    from math import gcd

    from scipy.signal import resample_poly  # pyright: ignore[reportMissingTypeStubs, reportUnknownVariableType]

    g = gcd(RATE, rate)
    return np.asarray(resample_poly(samples, RATE // g, rate // g), dtype=np.float32)


class ByteDanceTranscriber:
    name = "bytedance"
    version = "note-pedal-1"

    def __init__(self, checkpoint: Path, device: Device = "cpu") -> None:
        self.checkpoint = checkpoint
        self.device = device
        self._model: Any = None

    def _load(self) -> Any:
        if self._model is None:
            import torch
            from piano_transcription_inference.models import (  # pyright: ignore[reportMissingTypeStubs]
                Note_pedal,  # pyright: ignore[reportUnknownVariableType]
            )

            model: Any = Note_pedal(frames_per_second=FRAMES_PER_SECOND, classes_num=88)
            state: Any = torch.load(self.checkpoint, map_location=self.device, weights_only=True)  # pyright: ignore[reportUnknownMemberType]
            model.load_state_dict(state["model"])
            model.to(self.device)
            model.eval()
            self._model = model
        return self._model

    def transcribe(self, samples: Samples, rate: int) -> PianoResult:
        import torch
        from piano_transcription_inference.inference import (  # pyright: ignore[reportMissingTypeStubs]
            PianoTranscription,  # pyright: ignore[reportUnknownVariableType]
        )
        from piano_transcription_inference.pytorch_utils import (  # pyright: ignore[reportMissingTypeStubs]
            forward,  # pyright: ignore[reportUnknownVariableType]
        )
        from piano_transcription_inference.utilities import (  # pyright: ignore[reportMissingTypeStubs]
            RegressionPostProcessor,  # pyright: ignore[reportUnknownVariableType]
        )

        model = self._load()
        audio = _resample(samples, rate).astype(np.float64)[None, :]
        length = audio.shape[1]
        pad = int(np.ceil(length / SEGMENT_SAMPLES)) * SEGMENT_SAMPLES - length
        audio = np.concatenate([audio, np.zeros((1, pad))], axis=1)
        # The package's framing helpers, without its constructor (which downloads).
        framer: Any = PianoTranscription.__new__(PianoTranscription)  # pyright: ignore[reportUnknownMemberType]
        segments = framer.enframe(audio, SEGMENT_SAMPLES)
        torch.manual_seed(0)  # pyright: ignore[reportUnknownMemberType]
        run: Any = forward  # pyright: ignore[reportUnknownVariableType]
        with contextlib.redirect_stdout(io.StringIO()):  # it prints a line per segment
            output: dict[str, Any] = run(model, segments, batch_size=1)
        frames = int(np.ceil(length / RATE * FRAMES_PER_SECOND))
        for key in list(output):
            output[key] = framer.deframe(output[key])[:frames]
        post: Any = RegressionPostProcessor(
            FRAMES_PER_SECOND,
            classes_num=88,
            onset_threshold=0.3,
            offset_threshold=0.3,
            frame_threshold=0.1,
            pedal_offset_threshold=0.2,
        )
        events: tuple[list[dict[str, Any]], list[dict[str, Any]] | None] = (
            post.output_dict_to_midi_events(output)
        )
        note_events, pedal_events = events
        notes = [
            TNote(
                round(float(e["onset_time"]), 3),
                round(float(e["offset_time"]), 3),
                int(e["midi_note"]),
                int(e["velocity"]),
            )
            for e in note_events
        ]
        pedals = [
            PedalSpan(round(float(e["onset_time"]), 3), round(float(e["offset_time"]), 3))
            for e in pedal_events or []
        ]
        onsets = np.asarray(output["reg_onset_output"], dtype=np.float64)
        strengths = [
            float(
                onsets[
                    min(onsets.shape[0] - 1, round(n.start * FRAMES_PER_SECOND)),
                    n.midi - LOWEST_KEY,
                ]
            )
            for n in notes
            if LOWEST_KEY <= n.midi < LOWEST_KEY + 88
        ]
        confidence = float(np.clip(np.mean(strengths), 0, 1)) if strengths else 0.0
        return PianoResult(notes, pedals, round(confidence, 4))


def analyse_piano(samples: Samples, rate: int, transcriber: PianoTranscriber) -> Notes:
    """Transcribe and clean: the piano stage's artifact."""
    result = transcriber.transcribe(samples, rate)
    cleaned = clean_piano(result.notes, result.pedals)
    return Notes.build(cleaned, result.confidence, result.pedals)
