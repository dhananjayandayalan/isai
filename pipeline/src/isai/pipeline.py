"""The analysis pipeline: stages wired per source type, through the runner.

    piano-solo  ingest → rhythm → tonality → piano → (key from notes) → hands
    full-mix    ingest → separate → rhythm → tonality (bass + other) → melody (vocals)
                → bass line (bass stem, cached for P5) → (key from notes) → hands (all right)
    a-cappella  ingest → rhythm → tonality → melody → (key from notes, tonicHz) → hands

Ingest always runs (it produces the audio hash the cache is keyed on); every other stage
is cached. The learned models come from `Models`, built lazily, so a fully cached run
needs neither torch nor the weights; tests swap in fakes.
"""

from __future__ import annotations

import functools
import hashlib
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, TextIO

from isai.arrange.hands import assign_hands
from isai.assemble import SongInfo, assemble
from isai.device import Device, DeviceChoice, resolve
from isai.ingest import INGEST_VERSION, IngestLimits, ingest
from isai.ingest.types import LOW_RATE, RATE, Ingested
from isai.midi_out import MidiNote, song_midi
from isai.models import model_path
from isai.rhythm import RHYTHM_VERSION, BeatTracker, LibrosaTracker, Rhythm, analyse_rhythm
from isai.runner import Runner, StageRecord
from isai.separate import SEPARATE_VERSION, STEM_RATE, HDemucsSeparator, Separator, Stems
from isai.separate import write_stems as write_stem_files
from isai.tonality import TONALITY_VERSION, Tonality, analyse_tonality
from isai.tonality.refine import refine, tonic_hz
from isai.transcribe.melody import CrepeTracker, Melody, PitchTracker, analyse_melody
from isai.transcribe.piano import ByteDanceTranscriber, PianoTranscriber, analyse_piano
from isai.transcribe.segment import SegmentOptions, hysteresis
from isai.transcribe.types import Notes, TNote

SUPPORTED_TYPES = ("piano-solo", "full-mix", "a-cappella")
LATER_TYPES = ("carnatic",)
STAGES = ("separate", "rhythm", "tonality", "piano", "melody", "bass")

PIANO_VERSION = "1"
MELODY_VERSION = "1"
# The bass line: the same tracker and segmentation, limited to bass notes.
BASS_SEGMENT = SegmentOptions(midi_range=(28, 64), min_note_sec=0.1)


@dataclass
class Models:
    """The learned models, made only when a stage actually runs. `*_id` keys the cache."""

    separator: Callable[[], Separator]
    separator_id: str
    piano: Callable[[], PianoTranscriber]
    piano_id: str
    pitch: Callable[[], PitchTracker]
    pitch_id: str


def default_models(choice: DeviceChoice = "auto") -> Models:
    @functools.cache
    def device() -> Device:
        return resolve(choice)

    return Models(
        separator=functools.cache(lambda: HDemucsSeparator(model_path("hdemucs"), device())),
        separator_id=f"{HDemucsSeparator.name}-{HDemucsSeparator.version}",
        piano=functools.cache(
            lambda: ByteDanceTranscriber(model_path("piano-bytedance"), device())
        ),
        piano_id=f"{ByteDanceTranscriber.name}-{ByteDanceTranscriber.version}",
        pitch=functools.cache(lambda: CrepeTracker(device())),
        pitch_id=f"{CrepeTracker.name}-{CrepeTracker.version}",
    )


@dataclass
class Options:
    source_type: str
    cache_root: Path | None = Path(".cache")
    from_stage: str | None = None
    log_json: bool = False
    log_stream: TextIO | None = None
    limits: IngestLimits = field(default_factory=IngestLimits)
    tracker: BeatTracker = field(default_factory=LibrosaTracker)
    device: DeviceChoice = "auto"
    models: Models | None = None
    keep_stems: Path | None = None
    """`--keep-stems`: write the stems as WAVs here (full-mix only). Never set by the worker."""


@dataclass
class Result:
    song: dict[str, Any]
    midi: bytes
    records: list[StageRecord]
    stem_files: list[Path] = field(default_factory=lambda: [])


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


def stems_detail(stems: Stems) -> dict[str, Any]:
    return {"separator": stems.separator, "seconds": round(stems.vocals.size / STEM_RATE, 1)}


def notes_detail(notes: Notes) -> dict[str, Any]:
    return {"notes": int(notes.start.size), "confidence": notes.confidence}


def melody_detail(melody: Melody) -> dict[str, Any]:
    return {
        "tracker": melody.tracker,
        "notes": int(melody.note_start.size),
        "confidence": melody.notes_confidence,
        "tuningCents": melody.tuning_cents,
    }


def _singer_tonic(melody: Melody, tonality: Tonality) -> float | None:
    options = SegmentOptions()
    voiced = hysteresis(melody.confidence, options.voice_on, options.voice_off)
    return tonic_hz(melody.hz, voiced, tonality.tonic, melody.tuning_cents)


def run(source: Path, info: SongInfo, options: Options) -> Result:
    """Analyse `source` into a Song and its MIDI file."""
    kind = options.source_type
    if kind not in SUPPORTED_TYPES:
        raise ValueError(f"unsupported source type {kind!r}")
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
    models = options.models or default_models(options.device)

    stems: Stems | None = None
    stem_files: list[Path] = []
    if kind == "full-mix":
        stems = runner.stage(
            "separate",
            SEPARATE_VERSION,
            Stems,
            lambda: models.separator().separate(ingested.samples, RATE),
            {"separator": models.separator_id},
            stems_detail,
        )
        if options.keep_stems is not None:
            stem_files = write_stem_files(stems, options.keep_stems)

    tracker = options.tracker
    rhythm = runner.stage(
        "rhythm",
        RHYTHM_VERSION,
        Rhythm,
        lambda: analyse_rhythm(ingested.samples_low, LOW_RATE, tracker),
        {"tracker": f"{tracker.name}-{tracker.version}", "type": kind},
        rhythm_detail,
    )
    beats = [float(b) for b in rhythm.beats]
    harmonic = stems.harmonic() if stems is not None else ingested.samples_low
    tonality = runner.stage(
        "tonality",
        TONALITY_VERSION,
        Tonality,
        lambda: analyse_tonality(harmonic, LOW_RATE, beats),
        {"type": kind},
        tonality_detail,
    )

    notes: list[TNote]
    notes_confidence: float
    if kind == "piano-solo":
        piano = runner.stage(
            "piano",
            PIANO_VERSION,
            Notes,
            lambda: analyse_piano(ingested.samples, RATE, models.piano()),
            {"transcriber": models.piano_id},
            notes_detail,
        )
        notes, notes_confidence = piano.list(), piano.confidence
    else:
        voice = stems.vocals if stems is not None else ingested.samples_low
        melody = runner.stage(
            "melody",
            MELODY_VERSION,
            Melody,
            lambda: analyse_melody(voice, LOW_RATE, models.pitch()),
            {"tracker": models.pitch_id, "type": kind},
            melody_detail,
        )
        if stems is not None:
            bass_stem = stems.bass
            runner.stage(  # cached for P5's left hand; not in the Song yet
                "bass",
                MELODY_VERSION,
                Melody,
                lambda: analyse_melody(bass_stem, STEM_RATE, models.pitch(), BASS_SEGMENT),
                {"tracker": models.pitch_id},
                melody_detail,
            )
        notes, notes_confidence = melody.notes(), melody.notes_confidence
        if kind == "a-cappella":
            tonality = refine(tonality, notes)
            tonality = _with_tonic(tonality, _singer_tonic(melody, tonality))

    if kind != "a-cappella":
        tonality = refine(tonality, notes)
    hands = assign_hands(notes, beats, melody_only=kind != "piano-solo")
    song = assemble(info, ingested, rhythm, tonality, notes, hands, notes_confidence)
    midi = song_midi(
        beats=song["tempo"]["beats"],
        bpm=song["tempo"]["bpm"],
        beats_per_bar=song["timeSignature"]["num"],
        key=song["tonality"]["key"],
        mode=song["tonality"]["mode"],
        notes=[
            MidiNote(n["start"], n["end"], n["midi"], n["velocity"], n["hand"])
            for n in song["notes"]
        ],
    )
    return Result(song=song, midi=midi, records=runner.records, stem_files=stem_files)


def _with_tonic(tonality: Tonality, hz: float | None) -> Tonality:
    import dataclasses

    return dataclasses.replace(tonality, tonic_hz=hz)
