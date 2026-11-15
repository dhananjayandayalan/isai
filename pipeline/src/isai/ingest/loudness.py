"""Integrated loudness (ITU-R BS.1770-4, EBU R128) of a mono signal, and normalising to a target.

K-weighting is a high shelf (about +4 dB above 1.7 kHz) followed by a high pass at about
38 Hz, designed for any sample rate. Loudness is measured over 400 ms blocks with 75%
overlap, gated absolutely at -70 LUFS and then relatively at 10 LU below the mean of the
blocks that passed. Pure numpy and scipy; no audio files.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from scipy.signal import lfilter  # pyright: ignore[reportMissingTypeStubs, reportUnknownVariableType]  # untyped scipy

TARGET_LUFS = -23.0
ABSOLUTE_GATE_LUFS = -70.0
RELATIVE_GATE_LU = -10.0
BLOCK_SEC = 0.4
OVERLAP = 0.75

# The K-weighting filter stages by their analogue parameters, designed with the bilinear
# transform as libebur128 does, so the filter matches BS.1770's 48 kHz coefficients
# exactly and is right at any other sample rate.
_SHELF_FC = 1681.974450955533
_SHELF_GAIN_DB = 3.999843853973347
_SHELF_Q = 0.7071752369554196
_SHELF_VB_EXPONENT = 0.4996667741545416
_HIGHPASS_FC = 38.13547087602444
_HIGHPASS_Q = 0.5003270373238773

Signal = np.ndarray[Any, np.dtype[np.floating[Any]]]


def _high_shelf(rate: int) -> tuple[list[float], list[float]]:
    k = math.tan(math.pi * _SHELF_FC / rate)
    vh = 10 ** (_SHELF_GAIN_DB / 20)
    vb = vh**_SHELF_VB_EXPONENT
    a0 = 1 + k / _SHELF_Q + k * k
    b = [
        (vh + vb * k / _SHELF_Q + k * k) / a0,
        2 * (k * k - vh) / a0,
        (vh - vb * k / _SHELF_Q + k * k) / a0,
    ]
    a = [1.0, 2 * (k * k - 1) / a0, (1 - k / _SHELF_Q + k * k) / a0]
    return b, a


def _high_pass(rate: int) -> tuple[list[float], list[float]]:
    k = math.tan(math.pi * _HIGHPASS_FC / rate)
    a0 = 1 + k / _HIGHPASS_Q + k * k
    b = [1.0, -2.0, 1.0]
    a = [1.0, 2 * (k * k - 1) / a0, (1 - k / _HIGHPASS_Q + k * k) / a0]
    return b, a


def k_weight(samples: Signal, rate: int) -> np.ndarray[Any, np.dtype[np.float64]]:
    """The signal as BS.1770 hears it."""
    x = np.asarray(samples, dtype=np.float64)
    for b, a in (_high_shelf(rate), _high_pass(rate)):
        x = np.asarray(lfilter(b, a, x), dtype=np.float64)
    return x


def integrated_loudness(samples: Signal, rate: int) -> float | None:
    """Integrated loudness in LUFS, or None if every block is below the absolute gate (silence)."""
    weighted = k_weight(samples, rate)
    block = round(BLOCK_SEC * rate)
    hop = round(block * (1 - OVERLAP))
    if weighted.size < block:
        return None
    count = 1 + (weighted.size - block) // hop
    squares = weighted * weighted
    # Mean square of each block from a running sum.
    sums = np.concatenate(([0.0], np.cumsum(squares)))
    starts = np.arange(count) * hop
    means = (sums[starts + block] - sums[starts]) / block
    with np.errstate(divide="ignore"):
        loudness = -0.691 + 10 * np.log10(means)
    kept = means[loudness > ABSOLUTE_GATE_LUFS]
    if kept.size == 0:
        return None
    relative_gate = -0.691 + 10 * math.log10(float(kept.mean())) + RELATIVE_GATE_LU
    with np.errstate(divide="ignore"):
        final = kept[-0.691 + 10 * np.log10(kept) > relative_gate]
    return -0.691 + 10 * math.log10(float(final.mean()))


def normalise(
    samples: Signal, loudness: float, target: float = TARGET_LUFS
) -> np.ndarray[Any, np.dtype[np.float32]]:
    """The signal scaled from `loudness` to `target` LUFS (float, so peaks above 1 are kept)."""
    gain = 10 ** ((target - loudness) / 20)
    return (np.asarray(samples, dtype=np.float64) * gain).astype(np.float32)
