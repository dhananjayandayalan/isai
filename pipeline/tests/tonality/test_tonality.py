import numpy as np
import pytest

from isai.theory.scales import scale
from isai.tonality import analyse_tonality, tuning_offset, weighted_chroma
from tests.synth import cadence, harmonic_note

RATE = 22_050
BEATS = [float(i) for i in range(9)]


@pytest.mark.parametrize("cents", [-30, 30])
@pytest.mark.parametrize("tonic", range(12))
@pytest.mark.parametrize("mode", ["major", "minor"])
def test_finds_the_key_of_a_cadence_in_all_24_keys_detuned(
    mode: str, tonic: int, cents: int
) -> None:
    result = analyse_tonality(cadence(tonic, mode, cents).astype(np.float32), RATE, BEATS)
    assert (result.tonic, result.mode) == (tonic, mode)
    assert result.scale == scale(tonic, mode)  # type: ignore[arg-type]
    assert result.tuning_cents == pytest.approx(cents, abs=10)
    assert result.confidence > 0
    assert result.chroma.shape == (12,)
    assert result.chroma.max() == pytest.approx(1.0)


def test_spells_the_key_as_the_song_writes_it() -> None:
    assert analyse_tonality(cadence(10, "major").astype(np.float32), RATE, BEATS).key == "Bb"
    assert analyse_tonality(cadence(3, "minor").astype(np.float32), RATE, BEATS).key == "Eb"
    assert analyse_tonality(cadence(6, "major").astype(np.float32), RATE, BEATS).key == "F#"


def test_measures_the_tuning_offset() -> None:
    for cents in (-40, 0, 25):
        tone = sum(harmonic_note(57 + step, 2.0, RATE, cents) for step in (0, 4, 7))
        assert tuning_offset(np.asarray(tone, dtype=np.float32), RATE) == pytest.approx(
            cents, abs=10
        )
    assert tuning_offset(np.zeros(RATE, dtype=np.float32), RATE) == 0.0  # silence


def test_weights_the_chroma_by_beat_or_by_frame() -> None:
    audio = cadence(0, "major").astype(np.float32)
    by_beat = weighted_chroma(audio, RATE, 0.0, BEATS)
    by_frame = weighted_chroma(audio, RATE, 0.0, [])
    for profile in (by_beat, by_frame):
        assert profile.shape == (12,)
        # I-IV-V-I: the tonic leads, then the dominant (in three of the four chords each),
        # and every note of C major outweighs every note outside it.
        assert np.argsort(profile)[::-1][:2].tolist() == [0, 7]
        diatonic = [0, 2, 4, 5, 7, 9, 11]
        chromatic = [1, 3, 6, 8, 10]
        assert profile[diatonic].min() > 1.5 * profile[chromatic].max()


def test_falls_back_to_c_major_without_pitched_content() -> None:
    result = analyse_tonality(np.zeros(RATE * 3, dtype=np.float32), RATE, BEATS)
    assert (result.key, result.mode, result.confidence) == ("C", "major", 0.0)
    assert result.scale == scale(0, "major")
