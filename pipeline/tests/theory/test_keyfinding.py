import pytest

from isai.theory.keyfinding import (
    CONFIDENT_LEAD,
    PROFILES,
    find_key,
    key_name,
    key_scores,
)
from isai.theory.scales import scale

NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")


def rotated(profile: tuple[float, ...], tonic: int) -> list[float]:
    """A chroma that is `profile` with its tonic on `tonic`."""
    return [profile[(i - tonic) % 12] for i in range(12)]


def scale_chroma(
    tonic: int, mode: str, tonic_weight: float = 2.0, fifth_weight: float = 1.5
) -> list[float]:
    """Equal weight on the scale's notes, more on the tonic and fifth (a plain tonal piece)."""
    chroma = [0.0] * 12
    for pc in scale(tonic, mode):  # type: ignore[arg-type]
        chroma[pc] = 1.0
    chroma[tonic] = tonic_weight
    chroma[(tonic + 7) % 12] = fifth_weight
    return chroma


def test_profiles_have_twelve_bins_each() -> None:
    assert set(PROFILES) == {"krumhansl-kessler", "temperley", "albrecht-shanahan"}
    for major, minor in PROFILES.values():
        assert len(major) == len(minor) == 12


@pytest.mark.parametrize("tonic", range(12))
@pytest.mark.parametrize("mode", ["major", "minor"])
def test_finds_each_of_the_24_keys_from_its_own_profile(tonic: int, mode: str) -> None:
    profile = PROFILES["krumhansl-kessler"][0 if mode == "major" else 1]
    estimate = find_key(rotated(profile, tonic))
    assert estimate is not None
    assert (estimate.tonic, estimate.mode) == (tonic, mode)
    assert 0 < estimate.confidence <= 1


@pytest.mark.parametrize("tonic", range(12))
@pytest.mark.parametrize("mode", ["major", "minor"])
def test_finds_each_key_from_a_plain_scale_with_tonic_and_fifth_stressed(
    tonic: int, mode: str
) -> None:
    estimate = find_key(scale_chroma(tonic, mode))
    assert estimate is not None
    assert (estimate.tonic, estimate.mode) == (tonic, mode)


def test_the_relative_key_confusion_has_low_confidence() -> None:
    # The evidence split between C major and its relative A minor: they fit almost equally.
    blend = [a + b for a, b in zip(scale_chroma(0, "major"), scale_chroma(9, "minor"), strict=True)]
    estimate = find_key(blend)
    assert estimate is not None
    top_two = {(s.tonic, s.mode) for s in estimate.scores[:2]}
    assert top_two == {(0, "major"), (9, "minor")}
    assert estimate.confidence < 0.5
    # Even white keys alone already lean to C major: the profiles stress the tonic triad.
    white = find_key([1.0 if pc in (0, 2, 4, 5, 7, 9, 11) else 0.0 for pc in range(12)])
    assert white is not None
    assert (white.tonic, white.mode) == (0, "major")


def test_scores_all_24_keys_best_first() -> None:
    scores = key_scores(scale_chroma(7, "major"))
    assert scores is not None
    assert len(scores) == 24
    assert len({(s.tonic, s.mode) for s in scores}) == 24
    assert [s.score for s in scores] == sorted((s.score for s in scores), reverse=True)


def test_confidence_grows_with_the_lead() -> None:
    clear = find_key(rotated(PROFILES["temperley"][0], 2))
    vague = find_key([1.0 if pc in (0, 2, 4, 5, 7, 9, 11) else 0.0 for pc in range(12)])
    assert clear is not None and vague is not None
    assert clear.confidence > vague.confidence
    lead = clear.scores[0].score - clear.scores[1].score
    assert clear.confidence == pytest.approx(
        min(1.0, lead / CONFIDENT_LEAD) * clear.scores[0].score, abs=1e-4
    )


def test_calls_a_chroma_that_fits_neither_mode_modal() -> None:
    # A whole-tone collection, and a chromatic line around C: no major or minor key fits.
    whole_tone = [1.0 if pc % 2 == 0 else 0.0 for pc in range(12)]
    whole_tone[0] = 1.3
    chromatic = [2.0] + [1.0] * 11
    for chroma in (whole_tone, chromatic):
        estimate = find_key(chroma)
        assert estimate is not None
        assert estimate.mode == "modal"
    assert find_key(chromatic).tonic == 0  # type: ignore[union-attr]


def test_tonal_material_is_not_called_modal() -> None:
    # D Dorian reads as D minor, a major pentatonic as its major key: both fit well.
    dorian = scale_chroma(2, "dorian")
    estimate = find_key(dorian)
    assert estimate is not None
    assert (estimate.tonic, estimate.mode) == (2, "minor")
    pentatonic = find_key([1.0 if pc in (0, 2, 4, 7, 9) else 0.0 for pc in range(12)])
    assert pentatonic is not None
    assert (pentatonic.tonic, pentatonic.mode) == (0, "major")


def test_returns_nothing_for_a_flat_or_empty_chroma() -> None:
    assert find_key([0.0] * 12) is None
    assert find_key([0.5] * 12) is None


def test_rejects_a_malformed_chroma() -> None:
    with pytest.raises(ValueError, match="12 bins"):
        find_key([1.0] * 11)
    with pytest.raises(ValueError, match="non-negative"):
        find_key([1.0] * 11 + [-1.0])
    with pytest.raises(ValueError, match="non-negative"):
        find_key([1.0] * 11 + [float("nan")])


@pytest.mark.parametrize(
    ("tonic", "mode", "name"),
    [
        (0, "major", "C"),
        (7, "major", "G"),
        (6, "major", "F#"),
        (1, "major", "Db"),
        (10, "major", "Bb"),
        (5, "major", "F"),
        (9, "minor", "A"),
        (2, "minor", "D"),
        (5, "minor", "F"),
        (10, "minor", "Bb"),
        (3, "minor", "Eb"),
        (1, "minor", "C#"),
        (6, "minor", "F#"),
        (8, "minor", "G#"),
        (2, "modal", "D"),
        (10, "modal", "Bb"),
    ],
)
def test_names_the_tonic_as_its_key_signature_spells_it(tonic: int, mode: str, name: str) -> None:
    assert key_name(tonic, mode) == name  # type: ignore[arg-type]


def test_key_name_rejects_a_bad_pitch_class() -> None:
    with pytest.raises(ValueError):
        key_name(12, "major")
    assert NAMES[key_scores(scale_chroma(4, "minor"))[0].tonic] == "E"  # type: ignore[index]
