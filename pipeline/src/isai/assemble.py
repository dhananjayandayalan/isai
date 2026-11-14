"""Builds the Song document from the stage outputs, on the original audio's timeline."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from isai import __version__
from isai.ingest.types import Ingested
from isai.rhythm.types import Rhythm
from isai.schema import current_version, validate_song
from isai.tonality import Tonality

SourceType = str

_DECIMALS = 3


@dataclass(frozen=True)
class SongInfo:
    """What the caller decides: names and identity, not analysis."""

    song_id: str
    title: str
    source_type: SourceType
    created_at: str
    """ISO 8601 date and time."""


def _times(values: Any, offset: float) -> list[float]:
    return [round(float(v) + offset, _DECIMALS) for v in values]


def assemble(
    info: SongInfo, ingested: Ingested, rhythm: Rhythm, tonality: Tonality
) -> dict[str, Any]:
    """The Song (newest schema version), validated. Stage times move back by the trimmed offset."""
    offset = ingested.offset_sec
    duration = round(ingested.duration_sec, _DECIMALS)
    beats = [t for t in _times(rhythm.beats, offset) if t <= duration]
    downbeats = [t for t in _times(rhythm.downbeats, offset) if t <= duration]
    song: dict[str, Any] = {
        "schemaVersion": current_version(),
        "id": info.song_id,
        "title": info.title,
        "sourceType": info.source_type,
        "durationSec": duration,
        "tempo": {"bpm": rhythm.bpm, "beats": beats, "downbeats": downbeats},
        "timeSignature": {"num": rhythm.beats_per_bar, "den": 4},
        "tonality": {"key": tonality.key, "mode": tonality.mode, "scale": list(tonality.scale)},
        "chords": [],
        "notes": [],
        "meta": {
            "pipelineVersion": __version__,
            "createdAt": info.created_at,
            "confidence": {
                "key": round(tonality.confidence, 4),
                "tempo": round(rhythm.confidence, 4),
                "chords": 0.0,
            },
        },
    }
    validate_song(song)
    return song
