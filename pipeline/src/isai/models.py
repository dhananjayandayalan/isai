"""Model weights: one registry, fetched on request, checked by SHA-256, cached outside git.

Analysis never downloads anything. `isai models fetch` does, once; the P8 worker image
will bake the files in. Files live in `~/.cache/isai/models/` (or `ISAI_MODEL_DIR`).
A file is fully hashed the first time it's used; after that a small marker with its size
and modification time stands in for the hash, so a run doesn't re-read 300 MB.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

from isai.errors import ModelMissingError

MODEL_DIR_ENV = "ISAI_MODEL_DIR"
_CHUNK = 1 << 20


@dataclass(frozen=True)
class Model:
    name: str
    filename: str
    url: str
    sha256: str
    size: int
    licence: str
    what: str


REGISTRY: dict[str, Model] = {
    m.name: m
    for m in (
        Model(
            name="piano-bytedance",
            filename="piano-bytedance-note-pedal.pth",
            url="https://zenodo.org/records/4034264/files/CRNN_note_F1%3D0.9677_pedal_F1%3D0.9186.pth?download=1",
            sha256="c3fa9730725bf4a762f1c14bc80cd5986eacda01b026f5a4a2525cd607876141",
            size=171_966_578,
            licence="CC BY 4.0 (Kong et al. 2021, Zenodo 4034264)",
            what="piano notes, velocities and sustain pedal",
        ),
        Model(
            name="hdemucs",
            filename="hdemucs-high-musdb-plus.pt",
            url="https://download.pytorch.org/torchaudio/models/hdemucs_high_trained.pt",
            sha256="a004b2790d73ffeaa535db458a1a79b539dfdbafbccc31f275d07e632ebd7816",
            size=334_697_255,
            licence="MIT (Demucs; torchaudio HDEMUCS_HIGH_MUSDB_PLUS)",
            what="separation into drums, bass, other and vocals",
        ),
    )
}


def model_dir() -> Path:
    override = os.environ.get(MODEL_DIR_ENV)
    return Path(override) if override else Path.home() / ".cache" / "isai" / "models"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(_CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def _marker(path: Path) -> Path:
    return path.with_name(path.name + ".verified")


def _stamp(path: Path) -> dict[str, float | int]:
    stat = path.stat()
    return {"size": stat.st_size, "mtime": stat.st_mtime}


def _fetch_hint(model: Model) -> str:
    return f"run `uv run isai models fetch {model.name}`"


def model_path(name: str) -> Path:
    """The verified local file for a model; raises ModelMissingError (exit 7) otherwise."""
    model = REGISTRY[name]
    path = model_dir() / model.filename
    if not path.is_file():
        raise ModelMissingError(f"the {name} model ({model.what}) isn't here; {_fetch_hint(model)}")
    marker = _marker(path)
    if marker.is_file():
        try:
            if json.loads(marker.read_text(encoding="utf-8")) == _stamp(path):
                return path
        except ValueError:
            pass
    if path.stat().st_size != model.size or _sha256(path) != model.sha256:
        raise ModelMissingError(
            f"the {name} model at {path} fails its checksum; delete it and {_fetch_hint(model)}"
        )
    marker.write_text(json.dumps(_stamp(path)), encoding="utf-8")
    return path


Opener = Callable[[str], BinaryIO]


def _open_url(url: str) -> BinaryIO:
    request = urllib.request.Request(url, headers={"User-Agent": "isai-pipeline"})
    return urllib.request.urlopen(request, timeout=60)


def fetch(name: str, opener: Opener = _open_url) -> Path:
    """Download a model if it's missing or broken, verify it, and return its path."""
    model = REGISTRY[name]
    try:
        return model_path(name)
    except ModelMissingError:
        pass
    folder = model_dir()
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / model.filename
    partial = path.with_name(path.name + ".part")
    with opener(model.url) as source, partial.open("wb") as target:
        shutil.copyfileobj(source, target, _CHUNK)
    digest = _sha256(partial)
    if digest != model.sha256:
        partial.unlink()
        raise ModelMissingError(
            f"the {name} download has SHA-256 {digest}, expected {model.sha256}; not kept"
        )
    partial.replace(path)
    _marker(path).unlink(missing_ok=True)
    return model_path(name)
