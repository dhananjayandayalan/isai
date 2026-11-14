"""Stage outputs on disk: flat dataclasses, numpy arrays in `.npz`, everything else in JSON.

A stage's artifact must be a dataclass whose fields are numpy arrays, numbers, strings,
booleans, None, or lists and dicts of those. Arrays round-trip exactly; floats in JSON are
written with `repr` precision, so a cached run gives the same Song as a fresh one.
"""

from __future__ import annotations

import dataclasses
import json
import os
from pathlib import Path
from typing import Any, TypeVar

import numpy as np

T = TypeVar("T")

ARRAYS_FILE = "arrays.npz"
VALUES_FILE = "values.json"
DONE_FILE = "done"


def save(directory: Path, artifact: object) -> None:
    """Write `artifact` into `directory`, marking it complete only once everything is written."""
    if not dataclasses.is_dataclass(artifact) or isinstance(artifact, type):
        raise TypeError(f"cache.save expects a dataclass instance, got {type(artifact).__name__}")
    directory.mkdir(parents=True, exist_ok=True)
    arrays: dict[str, np.ndarray[Any, Any]] = {}
    values: dict[str, Any] = {}
    for field in dataclasses.fields(artifact):
        value = getattr(artifact, field.name)
        if isinstance(value, np.ndarray):
            arrays[field.name] = value
        else:
            values[field.name] = value
    if arrays:
        with (directory / ARRAYS_FILE).open("wb") as f:
            np.savez(f, **arrays)  # pyright: ignore[reportArgumentType]  # numpy's kwargs stub
    temp = directory / f"{VALUES_FILE}.tmp"
    temp.write_text(json.dumps(values, sort_keys=True, allow_nan=False), encoding="utf-8")
    os.replace(temp, directory / VALUES_FILE)
    (directory / DONE_FILE).write_text("", encoding="utf-8")


def load(directory: Path, cls: type[T]) -> T | None:
    """Read an artifact of type `cls` from `directory`, or None if it is missing or incomplete."""
    if not (directory / DONE_FILE).is_file():
        return None
    values: dict[str, Any] = json.loads((directory / VALUES_FILE).read_text(encoding="utf-8"))
    arrays_path = directory / ARRAYS_FILE
    if arrays_path.is_file():
        with np.load(arrays_path, allow_pickle=False) as data:
            for name in data.files:
                values[name] = data[name]
    return cls(**values)
