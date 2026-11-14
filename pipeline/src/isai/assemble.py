"""Builds the Song document from the stage outputs, on the original audio's timeline."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from isai import __version__
from isai.ingest.types import Ingested
from isai.rhythm.types import Rhythm
from isai.schema import current_version, validate_song
from isai.tonality import Tonality
from isai.transcribe.types import TNote

_DECIMALS = 3


@dataclass(frozen=True)
class SongInfo:
    """What the caller decides: names and identity, not analysis."""

    song_id: str
    title: str
    source_type: str
    """One of `pipeline.SUPPORTED_TYPES`."""
    created_at: str
    """ISO 8601 date and time."""


def _times(values: Any, offset: float) -> list[float]:
    return [round(float(v) + offset, _DECIMALS) for v in values]


def _notes(
    notes: Sequence[TNote], hands: Sequence[str], offset: float, duration: float
) -> list[dict[str, Any]]:
    """Song notes on the original timeline, inside the song, sorted; zero-length ones dropped."""
    out: list[dict[str, Any]] = []
    for note, hand in zip(notes, hands, strict=True):
        start = round(note.start + offset, _DECIMALS)
        end = min(round(note.end + offset, _DECIMALS), duration)
        if end <= start:
            continue
        out.append(
            {
                "start": start,
                "end": end,
                "midi": int(min(127, max(0, note.midi))),
                "velocity": int(min(127, max(1, note.velocity))),
                "hand": hand,
                "source": "transcribed",
            }
        )
    out.sort(key=lambda n: (n["start"], n["midi"], n["hand"]))
    return out


def assemble(
    info: SongInfo,
    ingested: Ingested,
    rhythm: Rhythm,
    tonality: Tonality,
    notes: Sequence[TNote] = (),
    hands: Sequence[str] = (),
    notes_confidence: float | None = None,
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
        "notes": _notes(notes, hands, offset, duration),
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
    if tonality.tonic_hz is not None:
        song["tonality"]["tonicHz"] = round(tonality.tonic_hz, 2)
    if notes_confidence is not None:
        song["meta"]["confidence"]["notes"] = round(notes_confidence, 4)
    validate_song(song)
    return song
