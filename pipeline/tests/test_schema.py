import json
import shutil
from collections.abc import Iterator
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from isai.schema import (
    SchemaNotFoundError,
    SongValidationError,
    _validator,  # pyright: ignore[reportPrivateUsage]
    current_version,
    examples_dir,
    frozen_examples_dir,
    load_json,
    load_schema,
    schema_dir,
    schema_versions,
    song_errors,
    validate_song,
)

VALID = sorted(p for p in examples_dir().glob("*.json") if not p.name.startswith("invalid-"))
INVALID = sorted(examples_dir().glob("invalid-*.json"))
FROZEN = sorted(frozen_examples_dir().glob("*/*.json"))


def test_schema_is_valid_draft_2020_12() -> None:
    Draft202012Validator.check_schema(load_schema())


def test_lists_every_supported_version_and_writes_the_newest() -> None:
    assert schema_versions() == ["0.1.0", "0.2.0", "0.3.0"]
    assert current_version() == "0.3.0"
    for path in VALID:
        assert load_json(path)["schemaVersion"] == current_version(), path.name


@pytest.mark.parametrize("path", FROZEN, ids=lambda p: f"{p.parent.name}/{p.name}")
def test_frozen_examples_of_past_versions_still_load(path: Path) -> None:
    doc = load_json(path)
    assert doc["schemaVersion"] == path.parent.name
    assert doc["schemaVersion"] in schema_versions()
    validate_song(doc)


def test_every_past_version_has_a_frozen_example() -> None:
    frozen = {p.parent.name for p in FROZEN}
    assert frozen == set(schema_versions()[:-1])


def test_downbeats_are_optional_and_must_lie_within_the_song() -> None:
    doc = load_json(examples_dir() / "twinkle-g-major.json")
    assert doc["tempo"]["downbeats"] == [0.0, 2.4, 4.8, 7.2]
    validate_song(doc)
    del doc["tempo"]["downbeats"]
    validate_song(doc)
    doc["tempo"]["downbeats"] = [0.0, 12.0]
    with pytest.raises(SongValidationError) as exc:
        validate_song(doc)
    assert any("tempo.downbeats[1]" in e for e in exc.value.errors)
    doc["tempo"]["downbeats"] = [-1.0]
    assert any("downbeats" in e for e in song_errors(doc))


def test_an_unknown_version_is_rejected() -> None:
    doc = load_json(examples_dir() / "twinkle-g-major.json")
    doc["schemaVersion"] = "9.9.9"
    assert any("schemaVersion" in e for e in song_errors(doc))


def test_there_are_examples_of_both_kinds() -> None:
    assert len(VALID) >= 2
    assert len(INVALID) >= 1


@pytest.mark.parametrize("path", VALID, ids=lambda p: p.name)
def test_valid_examples_pass(path: Path) -> None:
    validate_song(load_json(path))


@pytest.mark.parametrize("path", INVALID, ids=lambda p: p.name)
def test_invalid_examples_fail(path: Path) -> None:
    with pytest.raises(SongValidationError) as exc:
        validate_song(load_json(path))
    assert exc.value.errors


def test_invalid_example_reports_each_problem() -> None:
    errors = song_errors(load_json(examples_dir() / "invalid-out-of-range.json"))
    assert any("'tonality' is a required property" in e for e in errors)
    assert any("notes[0].midi" in e and "130" in e for e in errors)


def test_unknown_fields_are_rejected() -> None:
    doc = load_json(examples_dir() / "twinkle-g-major.json")
    doc["extra"] = 1
    assert any("Additional properties" in e for e in song_errors(doc))


def test_created_at_must_be_a_date_time() -> None:
    doc = load_json(examples_dir() / "twinkle-g-major.json")
    doc["meta"]["createdAt"] = "yesterday"
    assert any("date-time" in e for e in song_errors(doc))


def test_empty_song_is_valid() -> None:
    doc = load_json(examples_dir() / "frere-jacques-a-cappella.json")
    doc["notes"] = []
    doc["chords"] = []
    doc["tempo"]["beats"] = []
    doc["durationSec"] = 0
    validate_song(doc)


def test_single_note_song_is_valid() -> None:
    doc = load_json(examples_dir() / "frere-jacques-a-cappella.json")
    doc["notes"] = doc["notes"][:1]
    validate_song(doc)


@pytest.mark.parametrize("field", ["notes", "chords", "sections"])
@pytest.mark.parametrize(("start", "end"), [(5.0, 0.0), (1.0, 1.0)])
def test_end_must_be_after_start(field: str, start: float, end: float) -> None:
    doc = load_json(examples_dir() / "twinkle-g-major.json")
    doc[field][0]["start"] = start
    doc[field][0]["end"] = end
    with pytest.raises(SongValidationError, match=rf"\$\.{field}\[0\]: end .* must be after"):
        validate_song(doc)


@pytest.mark.parametrize("field", ["notes", "chords", "sections"])
def test_end_must_be_within_duration(field: str) -> None:
    doc = load_json(examples_dir() / "twinkle-g-major.json")
    doc[field][0]["end"] = doc["durationSec"] + 0.5
    with pytest.raises(SongValidationError, match=rf"\$\.{field}\[0\]: .* past durationSec"):
        validate_song(doc)


def test_end_exactly_at_duration_is_valid() -> None:
    doc = load_json(examples_dir() / "twinkle-g-major.json")
    doc["notes"][-1]["end"] = doc["durationSec"]
    validate_song(doc)


def test_beats_must_be_within_duration() -> None:
    doc = load_json(examples_dir() / "twinkle-g-major.json")
    doc["tempo"]["beats"].append(doc["durationSec"] + 1)
    with pytest.raises(SongValidationError, match=r"\$\.tempo\.beats\[16\]"):
        validate_song(doc)


def test_time_rules_report_every_problem() -> None:
    doc = load_json(examples_dir() / "twinkle-g-major.json")
    doc["notes"][0]["end"] = 0
    doc["chords"][0]["end"] = 99
    with pytest.raises(SongValidationError) as exc:
        validate_song(doc)
    assert len(exc.value.errors) == 2


@pytest.fixture
def fresh_caches() -> Iterator[None]:
    """Clear the schema and validator caches around a test that changes ISAI_SCHEMA_DIR."""
    load_schema.cache_clear()
    _validator.cache_clear()
    yield
    load_schema.cache_clear()
    _validator.cache_clear()


def test_validator_is_cached() -> None:
    assert _validator() is _validator()


@pytest.mark.usefixtures("fresh_caches")
def test_schema_dir_env_override(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    real = schema_dir()
    monkeypatch.setenv("ISAI_SCHEMA_DIR", str(real))
    assert schema_dir() == real

    # A different schema behind the override is what validation then uses.
    shutil.copytree(real, tmp_path / "schema")
    loose = load_json(real / "song.schema.json")
    loose["$defs"]["Note"]["properties"]["midi"]["maximum"] = 200
    (tmp_path / "schema" / "song.schema.json").write_text(json.dumps(loose), encoding="utf-8")
    monkeypatch.setenv("ISAI_SCHEMA_DIR", str(tmp_path / "schema"))
    load_schema.cache_clear()
    _validator.cache_clear()
    doc = load_json(examples_dir() / "twinkle-g-major.json")
    doc["notes"][0]["midi"] = 150
    assert song_errors(doc) == []


@pytest.mark.usefixtures("fresh_caches")
def test_schema_dir_env_override_must_exist(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("ISAI_SCHEMA_DIR", str(tmp_path))
    with pytest.raises(SchemaNotFoundError, match="ISAI_SCHEMA_DIR"):
        schema_dir()


def test_notes_confidence_is_optional_and_between_0_and_1() -> None:
    doc = load_json(examples_dir() / "twinkle-g-major.json")
    assert doc["meta"]["confidence"]["notes"] == 1
    validate_song(doc)
    del doc["meta"]["confidence"]["notes"]
    validate_song(doc)
    doc["meta"]["confidence"]["notes"] = 1.5
    with pytest.raises(SongValidationError):
        validate_song(doc)
