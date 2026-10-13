from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from isai.schema import (
    SongValidationError,
    examples_dir,
    load_json,
    load_schema,
    schema_dir,
    song_errors,
    validate_song,
)

VALID = sorted(p for p in examples_dir().glob("*.json") if not p.name.startswith("invalid-"))
INVALID = sorted(examples_dir().glob("invalid-*.json"))


def test_schema_is_valid_draft_2020_12() -> None:
    Draft202012Validator.check_schema(load_schema())
    assert load_schema()["properties"]["schemaVersion"]["const"] == "0.1.0"


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


def test_schema_dir_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    real = schema_dir()
    monkeypatch.setenv("ISAI_SCHEMA_DIR", str(real))
    assert schema_dir() == real


def test_schema_dir_env_override_must_exist(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("ISAI_SCHEMA_DIR", str(tmp_path))
    with pytest.raises(FileNotFoundError, match="ISAI_SCHEMA_DIR"):
        schema_dir()
