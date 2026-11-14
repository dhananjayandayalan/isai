"""The analysis pipeline: stages wired in order for a source type, through the runner.

P3 runs ingest, rhythm and tonality for every supported type; notes and chords come in
P4 and P5. Ingest always runs (it produces the audio hash the cache is keyed on); the
later stages are cached.
"""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, TextIO

from isai.assemble import SongInfo, assemble
from isai.ingest import INGEST_VERSION, IngestLimits, ingest
from isai.ingest.types import LOW_RATE, Ingested
from isai.midi_out import song_midi
from isai.rhythm import RHYTHM_VERSION, BeatTracker, LibrosaTracker, Rhythm, analyse_rhythm
from isai.runner import Runner, StageRecord
from isai.tonality import TONALITY_VERSION, Tonality, analyse_tonality

SUPPORTED_TYPES = ("piano-solo", "full-mix", "a-cappella")
LATER_TYPES = ("carnatic",)
STAGES = ("rhythm", "tonality")


@dataclass
class Options:
    source_type: str
    cache_root: Path | None = Path(".cache")
    from_stage: str | None = None
    log_json: bool = False
    log_stream: TextIO | None = None
    limits: IngestLimits = field(default_factory=IngestLimits)
    tracker: BeatTracker = field(default_factory=LibrosaTracker)


@dataclass
class Result:
    song: dict[str, Any]
    midi: bytes
    records: list[StageRecord]


def ingest_key(ingested: Ingested, limits: IngestLimits) -> dict[str, Any]:
    """What ingest's cache key covers: its limits, the trim offset and the audio it hands on.

    The audio hash names the cache folder but is taken before normalising and trimming, so
    a change there must show up here for the later stages to re-run.
    """
    return {
        "limits": [limits.max_seconds, limits.max_bytes],
        "offset": ingested.offset_sec,
        "low": hashlib.sha256(ingested.samples_low.astype("<f4").tobytes()).hexdigest(),
    }


def rhythm_detail(rhythm: Rhythm) -> dict[str, Any]:
    return {
        "tracker": rhythm.tracker,
        "bpm": rhythm.bpm,
        "beatsPerBar": rhythm.beats_per_bar,
        "stability": round(rhythm.stability, 4),
        "stable": rhythm.stable,
    }


def tonality_detail(tonality: Tonality) -> dict[str, Any]:
    return {
        "key": tonality.key,
        "mode": tonality.mode,
        "confidence": round(tonality.confidence, 4),
        "tuningCents": tonality.tuning_cents,
    }


def run(source: Path, info: SongInfo, options: Options) -> Result:
    """Analyse `source` into a Song and its MIDI file."""
    if options.source_type not in SUPPORTED_TYPES:
        raise ValueError(f"unsupported source type {options.source_type!r}")
    started = time.perf_counter()
    ingested = ingest(source, options.limits)
    runner_kwargs: dict[str, Any] = {
        "audio_hash": ingested.audio_hash,
        "cache_root": options.cache_root,
        "from_stage": options.from_stage,
        "log_json": options.log_json,
    }
    if options.log_stream is not None:
        runner_kwargs["log_stream"] = options.log_stream
    runner = Runner(**runner_kwargs)
    seconds = time.perf_counter() - started
    runner.note("ingest", INGEST_VERSION, seconds, ingest_key(ingested, options.limits))

    tracker = options.tracker
    rhythm = runner.stage(
        "rhythm",
        RHYTHM_VERSION,
        Rhythm,
        lambda: analyse_rhythm(ingested.samples_low, LOW_RATE, tracker),
        {"tracker": f"{tracker.name}-{tracker.version}", "type": options.source_type},
        rhythm_detail,
    )
    beats = [float(b) for b in rhythm.beats]
    tonality = runner.stage(
        "tonality",
        TONALITY_VERSION,
        Tonality,
        lambda: analyse_tonality(ingested.samples_low, LOW_RATE, beats),
        {"type": options.source_type},
        tonality_detail,
    )
    song = assemble(info, ingested, rhythm, tonality)
    midi = song_midi(
        beats=song["tempo"]["beats"],
        bpm=song["tempo"]["bpm"],
        beats_per_bar=song["timeSignature"]["num"],
        key=song["tonality"]["key"],
        mode=song["tonality"]["mode"],
    )
    return Result(song=song, midi=midi, records=runner.records)
