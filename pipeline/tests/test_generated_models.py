from pathlib import Path

import pytest
from pydantic import ValidationError

from isai.generated.song import Song
from isai.schema import examples_dir, load_json

VALID = sorted(p for p in examples_dir().glob("*.json") if not p.name.startswith("invalid-"))


@pytest.mark.parametrize("path", VALID, ids=lambda p: p.name)
def test_examples_load_into_generated_model(path: Path) -> None:
    song = Song.model_validate(load_json(path))
    assert song.schemaVersion == "0.1.0"
    assert song.notes


def test_typed_fields_are_readable() -> None:
    song = Song.model_validate(load_json(examples_dir() / "twinkle-g-major.json"))
    assert song.tonality.key == "G"
    assert song.tonality.mode == "major"
    assert song.tempo.bpm == 100
    assert {n.hand for n in song.notes} == {"left", "right"}


def test_round_trip_matches_source() -> None:
    raw = load_json(examples_dir() / "frere-jacques-a-cappella.json")
    song = Song.model_validate(raw)
    again = Song.model_validate_json(song.model_dump_json(exclude_none=True))
    assert again == song


def test_generated_model_rejects_invalid_example() -> None:
    with pytest.raises(ValidationError):
        Song.model_validate(load_json(examples_dir() / "invalid-out-of-range.json"))
