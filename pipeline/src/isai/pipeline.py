"""The analysis pipeline: stages wired in order for a source type, through the runner.

P3 runs ingest, rhythm and tonality for every supported type; notes and chords come in
P4 and P5. Ingest always runs (it produces the audio hash the cache is keyed on); the
later stages are cached.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, TextIO

from isai.assemble import SongInfo, assemble
from isai.ingest import INGEST_VERSION, IngestLimits, ingest
from isai.ingest.types import LOW_RATE
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
    runner.note("ingest", INGEST_VERSION, time.perf_counter() - started)

    tracker = options.tracker
    rhythm = runner.stage(
        "rhythm",
        RHYTHM_VERSION,
        Rhythm,
        lambda: analyse_rhythm(ingested.samples_low, LOW_RATE, tracker),
        {"tracker": f"{tracker.name}-{tracker.version}", "type": options.source_type},
    )
    beats = [float(b) for b in rhythm.beats]
    tonality = runner.stage(
        "tonality",
        TONALITY_VERSION,
        Tonality,
        lambda: analyse_tonality(ingested.samples_low, LOW_RATE, beats),
        {"type": options.source_type},
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
