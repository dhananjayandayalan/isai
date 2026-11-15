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

from isai.arrange import arrange
from isai.arrange.hands import assign_hands
from isai.arrange.melody import Level
from isai.assemble import SongInfo, assemble
from isai.device import Device, DeviceChoice, resolve
from isai.harmony.chroma import audio_chroma, bass_per_beat, beat_edges, notes_chroma
from isai.harmony.chroma import blend as blend_chroma
from isai.harmony.from_melody import chords_from_melody, coverage
from isai.harmony.recognise import recognise
from isai.harmony.types import Harmony
from isai.ingest import INGEST_VERSION, IngestLimits, ingest
from isai.ingest.types import LOW_RATE, RATE, Ingested
from isai.midi_out import MidiNote, song_midi
from isai.models import model_path
from isai.rhythm import (
    RHYTHM_VERSION,
    BeatThisTracker,
    BeatTracker,
    LibrosaTracker,
    Rhythm,
    analyse_rhythm,
)
from isai.rhythm.derive import filled_downbeats, filled_grid
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
STAGES = ("separate", "rhythm", "tonality", "piano", "melody", "bass", "harmony")

PIANO_VERSION = "1"
HARMONY_VERSION = "2"  # 2: on the filled beat grid
# How much the transcribed notes count against the audio chroma for piano-solo chords.
NOTE_CHROMA_WEIGHT = 0.5
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
    beats: Callable[[], BeatTracker]
    beats_id: str


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
        beats=functools.cache(lambda: BeatThisTracker(model_path("beat-this"), device())),
        beats_id=f"{BeatThisTracker.name}-{BeatThisTracker.version}",
    )


@dataclass
class Options:
    source_type: str
    cache_root: Path | None = Path(".cache")
    from_stage: str | None = None
    log_json: bool = False
    log_stream: TextIO | None = None
    limits: IngestLimits = field(default_factory=IngestLimits)
    tracker: BeatTracker | None = field(default_factory=LibrosaTracker)
    """The beat tracker (ADR 0014: librosa). None uses the models' Beat This!
    (`--beat-tracker beat-this`)."""
    device: DeviceChoice = "auto"
    models: Models | None = None
    keep_stems: Path | None = None
    """`--keep-stems`: write the stems as WAVs here (full-mix only). Never set by the worker."""
    levels: tuple[Level, ...] = ("medium",)
    """Arrangement levels to write (the first is `Result.song`)."""
    simplify: Level | None = None
    """piano-solo: arrange the transcription at this level instead of keeping it."""


@dataclass
class Result:
    song: dict[str, Any]
    midi: bytes
    records: list[StageRecord]
    stem_files: list[Path] = field(default_factory=lambda: [])
    arrangements: dict[str, tuple[dict[str, Any], bytes]] = field(default_factory=lambda: {})
    """Song and MIDI per level ("transcribed" for an unsimplified piano-solo)."""


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


def harmony_detail(harmony: Harmony) -> dict[str, Any]:
    return {
        "recogniser": harmony.recogniser,
        "chords": int(harmony.start.size),
        "confidence": harmony.confidence,
    }


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

    override = options.tracker
    tracker_id = f"{override.name}-{override.version}" if override is not None else models.beats_id
    rhythm = runner.stage(
        "rhythm",
        RHYTHM_VERSION,
        Rhythm,
        lambda: analyse_rhythm(
            ingested.samples_low, LOW_RATE, override if override is not None else models.beats()
        ),
        {"tracker": tracker_id, "type": kind},
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
    bass_line: Melody | None = None
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
            bass_line = runner.stage(  # the slash-chord bass under the chords
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

    end = ingested.samples_low.size / LOW_RATE  # the trimmed audio's length
    # Chords and patterns are laid out on a grid with the tracker's holes filled; the
    # Song itself keeps the detected beats.
    grid = filled_grid(beats, end)
    downbeats = filled_downbeats(grid, [float(d) for d in rhythm.downbeats], rhythm.beats_per_bar)
    harmony = runner.stage(
        "harmony",
        HARMONY_VERSION,
        Harmony,
        lambda: _harmony(kind, notes, bass_line, grid, downbeats, rhythm, tonality, harmonic, end),
        {"type": kind, "key": [tonality.tonic, tonality.mode]},
        harmony_detail,
    )
    segments = harmony.segments()

    arrangements: dict[str, tuple[dict[str, Any], bytes]] = {}
    if kind == "piano-solo" and options.simplify is None:
        hands = assign_hands(notes, beats, melody_only=False)
        song = assemble(
            info, ingested, rhythm, tonality, notes, hands, notes_confidence,
            segments, harmony.confidence, "transcribed",
        )  # fmt: skip
        arrangements["transcribed"] = (song, _midi(song))
    else:
        levels = (options.simplify,) if options.simplify is not None else options.levels
        melody_line = notes
        for level in levels:
            arranged = arrange(
                melody_line, segments, grid, downbeats, rhythm.beats_per_bar, rhythm.bpm,
                level, end,
            )  # fmt: skip
            song = assemble(
                info,
                ingested,
                rhythm,
                tonality,
                [TNote(n.start, n.end, n.midi, n.velocity) for n in arranged],
                [n.hand for n in arranged],
                notes_confidence,
                segments,
                harmony.confidence,
                "arranged",
            )
            arrangements[level] = (song, _midi(song))
    first_song, first_midi = next(iter(arrangements.values()))
    return Result(
        song=first_song,
        midi=first_midi,
        records=runner.records,
        stem_files=stem_files,
        arrangements=arrangements,
    )


def _harmony(
    kind: str,
    notes: list[TNote],
    bass_line: Melody | None,
    beats: list[float],
    downbeats: list[float],
    rhythm: Rhythm,
    tonality: Tonality,
    harmonic: Any,
    end: float,
) -> Harmony:
    """Chords: suggested from the melody (a-cappella), else recognised from the audio
    (blended with the transcription's pitch classes for piano-solo)."""
    if kind == "a-cappella":
        segments = chords_from_melody(
            notes, beats, downbeats, rhythm.beats_per_bar, rhythm.bpm,
            tonality.tonic, tonality.mode, end,
        )  # fmt: skip
        return Harmony.build(segments, coverage(notes, segments), "from-melody-1")
    edges = beat_edges(beats, end)
    chroma, energy = audio_chroma(harmonic, LOW_RATE, edges, tonality.tuning_cents)
    if kind == "piano-solo":
        from_notes, _ = notes_chroma(notes, edges)
        chroma = blend_chroma(chroma, from_notes, NOTE_CHROMA_WEIGHT)
        bass = bass_per_beat(notes, edges)
    else:
        bass = bass_per_beat(bass_line.notes(), edges) if bass_line is not None else None
    segments, confidence = recognise(chroma, energy, edges, tonality.tonic, tonality.mode, bass)
    return Harmony.build(segments, confidence, "templates-1")


def _midi(song: dict[str, Any]) -> bytes:
    return song_midi(
        beats=song["tempo"]["beats"],
        bpm=song["tempo"]["bpm"],
        beats_per_bar=song["timeSignature"]["num"],
        key=song["tonality"]["key"],
        mode=song["tonality"]["mode"],
        notes=[
            MidiNote(n["start"], n["end"], n["midi"], n["velocity"], n["hand"])
            for n in song["notes"]
        ],
        chords=[(c["start"], c["label"]) for c in song["chords"]],
    )


def _with_tonic(tonality: Tonality, hz: float | None) -> Tonality:
    import dataclasses

    return dataclasses.replace(tonality, tonic_hz=hz)
