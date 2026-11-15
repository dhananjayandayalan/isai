"""Trimming leading and trailing silence, keeping the offset so Song times match the original."""

from __future__ import annotations

from typing import Any

import numpy as np

SILENCE_DBFS = -60.0
FRAME_SEC = 0.05
# A little room around the sound, so a soft attack or a reverb tail isn't clipped.
PAD_SEC = 0.05


def sound_span(
    samples: np.ndarray[Any, Any], rate: int, threshold_dbfs: float = SILENCE_DBFS
) -> tuple[int, int] | None:
    """First and one-past-last sample with sound above the threshold, or None for silence.

    RMS is measured over non-overlapping 50 ms frames; the span is padded by 50 ms each side.
    """
    frame = max(1, round(FRAME_SEC * rate))
    count = samples.size // frame
    if count == 0:
        return None
    frames = np.asarray(samples[: count * frame], dtype=np.float64).reshape(count, frame)
    rms = np.sqrt(np.mean(frames * frames, axis=1))
    loud = np.flatnonzero(rms > 10 ** (threshold_dbfs / 20))
    if loud.size == 0:
        return None
    pad = round(PAD_SEC * rate)
    start = max(0, int(loud[0]) * frame - pad)
    end = min(samples.size, (int(loud[-1]) + 1) * frame + pad)
    return start, end
