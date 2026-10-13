"""Locate, load and validate against the Song contract in `schema/` (ADR 0002)."""

from __future__ import annotations

import json
import os
from functools import cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import ValidationError

SCHEMA_FILE = "song.schema.json"
SCHEMA_DIR_ENV = "ISAI_SCHEMA_DIR"


class SongValidationError(ValueError):
    """A Song document does not match the schema."""

    def __init__(self, errors: list[str]) -> None:
        self.errors = errors
        super().__init__("Song JSON is invalid:\n" + "\n".join(f"  - {e}" for e in errors))


def schema_dir() -> Path:
    """Return the repo's `schema/` directory.

    `ISAI_SCHEMA_DIR` overrides the lookup; otherwise walk up from this file.
    """
    override = os.environ.get(SCHEMA_DIR_ENV)
    if override:
        path = Path(override)
        if not (path / SCHEMA_FILE).is_file():
            raise FileNotFoundError(f"{SCHEMA_DIR_ENV}={override} has no {SCHEMA_FILE}")
        return path
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "schema"
        if (candidate / SCHEMA_FILE).is_file():
            return candidate
    raise FileNotFoundError(f"Could not find schema/{SCHEMA_FILE}; set {SCHEMA_DIR_ENV}")


def schema_path() -> Path:
    return schema_dir() / SCHEMA_FILE


def examples_dir() -> Path:
    return schema_dir() / "examples"


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


@cache
def load_schema() -> dict[str, Any]:
    schema: dict[str, Any] = load_json(schema_path())
    return schema


def _validator() -> Draft202012Validator:
    return Draft202012Validator(load_schema(), format_checker=FormatChecker())


def song_errors(doc: Any) -> list[str]:
    """Return one readable message per schema violation, empty if the song is valid."""
    found: list[ValidationError] = list(_validator().iter_errors(doc))  # pyright: ignore[reportUnknownMemberType]  # jsonschema's overload stubs
    errors = sorted(found, key=lambda e: list(e.absolute_path))
    return [f"{e.json_path}: {e.message}" for e in errors]


def validate_song(doc: Any) -> None:
    """Raise `SongValidationError` if `doc` does not match the Song schema."""
    errors = song_errors(doc)
    if errors:
        raise SongValidationError(errors)
