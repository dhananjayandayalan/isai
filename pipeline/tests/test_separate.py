from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from isai.device import torch_available
from isai.errors import ModelMissingError
from isai.models import model_path
from isai.separate import STEM_NAMES, STEM_RATE, HDemucsSeparator, Stems, write_stems


def stems(n: int = STEM_RATE) -> Stems:
    ones = np.ones(n, dtype=np.float32)
    return Stems(
        vocals=0.1 * ones, drums=0.2 * ones, bass=0.3 * ones, other=0.4 * ones, separator="fake"
    )


def test_the_harmonic_part_is_bass_plus_other() -> None:
    assert np.allclose(stems().harmonic(), 0.7)


def test_write_stems_writes_one_wav_per_stem(tmp_path: Path) -> None:
    paths = write_stems(stems(), tmp_path / "stems")
    assert [p.name for p in paths] == [f"{name}.wav" for name in STEM_NAMES]
    data, rate = sf.read(paths[2])
    assert rate == STEM_RATE
    assert np.allclose(data, 0.3, atol=1e-3)


def test_hdemucs_wants_44_1_khz() -> None:
    with pytest.raises(ValueError, match="44100"):
        HDemucsSeparator(Path("unused"), "cpu").separate(np.zeros(10, dtype=np.float32), 22_050)


@pytest.mark.slow
def test_hdemucs_puts_bass_and_drums_in_their_stems() -> None:
    if not torch_available():
        pytest.skip("needs torch")
    try:
        checkpoint = model_path("hdemucs")
    except ModelMissingError:
        pytest.skip("hdemucs not fetched (isai models fetch hdemucs)")
    rate = 44_100
    t = np.arange(12 * rate) / rate
    bass = 0.4 * np.sin(2 * np.pi * 55 * t)
    kick = np.zeros_like(t)
    for beat in np.arange(0, 12, 0.5):
        i, n = int(beat * rate), int(0.1 * rate)
        kick[i : i + n] += 0.8 * np.sin(2 * np.pi * 60 * t[:n]) * np.exp(-t[:n] * 30)
    out = HDemucsSeparator(checkpoint, "cpu").separate((bass + kick).astype(np.float32), rate)
    energy = {name: float(np.mean(getattr(out, name) ** 2)) for name in STEM_NAMES}
    assert out.vocals.size == 12 * STEM_RATE
    assert energy["bass"] > 5 * energy["vocals"]
    assert energy["drums"] > 5 * energy["vocals"]
    assert out.separator.startswith("hdemucs")
