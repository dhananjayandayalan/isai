"""Run every candidate beat tracker on the golden set (or on synthesised pieces) and score it.

    uv run python run.py --synth
    uv run python run.py --manifest ../../../tests/golden/manifest.yaml

Audio goes through the pipeline's own ingest, so each tracker sees what the pipeline would
give it; times are moved back by the trimmed offset before scoring. Writes
`results/<name>.json` (numbers only, no audio) and prints a Markdown table.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import tempfile
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
import synth
import yaml
from scoring import f_measure, tempo_verdict
from trackers import candidates

from isai.ingest import ingest
from isai.ingest.types import LOW_RATE, RATE
from isai.rhythm.derive import bpm, metre, stability

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]


@dataclass
class Case:
    id: str
    type: str
    audio: Path
    bpm: float | None
    beats_per_bar: int | None = None
    beats: list[float] | None = None
    downbeats: list[float] | None = None


@dataclass
class Row:
    song: str
    tracker: str
    seconds: float
    audio_seconds: float
    bpm: float | None
    tempo: str
    beats_per_bar: int
    metre: str
    stability: float | None
    beat_f: float | None = None
    downbeat_f: float | None = None
    agreement: dict[str, float] = field(default_factory=lambda: {})


def read_annotations(path: Path) -> tuple[list[float], list[float]]:
    """A `.beats` file: one beat per line, `time [position-in-bar]`; position 1 is a downbeat."""
    beats: list[float] = []
    downbeats: list[float] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if not parts or parts[0].startswith("#"):
            continue
        t = float(parts[0])
        beats.append(t)
        if len(parts) > 1 and float(parts[1]) == 1:
            downbeats.append(t)
    return beats, downbeats


def manifest_cases(manifest: Path) -> tuple[list[Case], list[str]]:
    data: dict[str, Any] = yaml.safe_load(manifest.read_text(encoding="utf-8"))
    cases: list[Case] = []
    skipped: list[str] = []
    for song in data.get("songs", []):
        audio = Path(str(song.get("audio", "TODO")))
        if not audio.is_absolute():
            audio = REPO / audio
        if song.get("type") == "carnatic" or not audio.is_file():
            skipped.append(str(song["id"]))
            continue
        expected = song.get("expected") or {}
        case = Case(
            id=str(song["id"]),
            type=str(song["type"]),
            audio=audio,
            bpm=_number(expected.get("bpm")),
            beats_per_bar=_int(expected.get("beats_per_bar")),
        )
        if song.get("beats"):
            case.beats, case.downbeats = read_annotations(manifest.parent / str(song["beats"]))
        cases.append(case)
    return cases, skipped


def synth_cases(folder: Path) -> list[Case]:
    cases: list[Case] = []
    for piece in synth.pieces():
        path = folder / f"{piece.id}.wav"
        peak = float(np.max(np.abs(piece.audio))) or 1.0
        sf.write(path, (0.8 * piece.audio / peak).astype(np.float32), synth.RATE)
        cases.append(
            Case(
                id=piece.id,
                type="synth",
                audio=path,
                bpm=piece.bpm,
                beats_per_bar=piece.beats_per_bar,
                beats=piece.beats,
                downbeats=piece.downbeats,
            )
        )
    return cases


def _number(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _int(value: Any) -> int | None:
    number = _number(value)
    return None if number is None else int(number)


def evaluate(cases: list[Case]) -> tuple[list[Row], dict[str, str], dict[str, float]]:
    loading = time.perf_counter()
    trackers, missing = candidates()
    load_seconds = round(time.perf_counter() - loading, 2)
    rows: list[Row] = []
    for case in cases:
        ingested = ingest(case.audio)
        found: dict[str, list[float]] = {}
        for tracker, low in trackers:
            samples, rate = (ingested.samples_low, LOW_RATE) if low else (ingested.samples, RATE)
            started = time.perf_counter()
            tracked = tracker.track(samples, rate)
            seconds = time.perf_counter() - started
            beats = [float(t) + ingested.offset_sec for t in tracked.beats]
            downbeats = [float(t) + ingested.offset_sec for t in tracked.downbeats]
            found[tracker.name] = beats
            tempo = bpm(beats)
            bar = metre(beats, downbeats).beats_per_bar
            cv = stability(beats)
            row = Row(
                song=case.id,
                tracker=tracker.name,
                seconds=round(seconds, 2),
                audio_seconds=round(ingested.duration_sec, 1),
                bpm=round(tempo, 2) if tempo is not None else None,
                tempo=tempo_verdict(tempo, case.bpm),
                beats_per_bar=bar,
                metre="n/a" if case.beats_per_bar is None else str(bar == case.beats_per_bar),
                stability=round(cv, 4) if cv is not None else None,
            )
            if case.beats:
                row.beat_f = f_measure(case.beats, beats).f
            if case.downbeats:
                row.downbeat_f = f_measure(case.downbeats, downbeats).f
            rows.append(row)
        # Without annotations, how far the trackers agree with each other still says something.
        for row in rows[-len(trackers) :]:
            row.agreement = {
                other: f_measure(found[other], found[row.tracker]).f
                for other in found
                if other != row.tracker
            }
    return rows, missing, {"model_load_seconds": load_seconds}


def summary(rows: list[Row]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for name in dict.fromkeys(r.tracker for r in rows):
        mine = [r for r in rows if r.tracker == name]
        beat_f = [r.beat_f for r in mine if r.beat_f is not None]
        down_f = [r.downbeat_f for r in mine if r.downbeat_f is not None]
        judged = [r for r in mine if r.tempo != "n/a"]
        metred = [r for r in mine if r.metre != "n/a"]
        audio = sum(r.audio_seconds for r in mine) or 1.0
        out.append(
            {
                "tracker": name,
                "songs": len(mine),
                "beat_f": round(statistics.fmean(beat_f), 3) if beat_f else None,
                "downbeat_f": round(statistics.fmean(down_f), 3) if down_f else None,
                "tempo_right": _share([r.tempo == "right" for r in judged]),
                "tempo_octave": _share([r.tempo == "octave" for r in judged]),
                "metre_right": _share([r.metre == "True" for r in metred]),
                "seconds_per_audio_minute": round(60 * sum(r.seconds for r in mine) / audio, 2),
            }
        )
    return out


def _share(flags: list[bool]) -> float | None:
    return round(sum(flags) / len(flags), 3) if flags else None


def _cell(value: Any) -> str:
    return "-" if value is None else str(value)


def markdown(table: list[dict[str, Any]], rows: list[Row]) -> str:
    lines = [
        "| tracker | songs | beat F | downbeat F | tempo right | tempo octave | metre right "
        "| s per audio min |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for s in table:
        cells = [
            s["tracker"],
            s["songs"],
            s["beat_f"],
            s["downbeat_f"],
            s["tempo_right"],
            s["tempo_octave"],
            s["metre_right"],
            s["seconds_per_audio_minute"],
        ]
        lines.append("| " + " | ".join(_cell(c) for c in cells) + " |")
    lines += [
        "",
        "| song | tracker | bpm | tempo | bar | beat F | downbeat F | seconds |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        cells = [r.song, r.tracker, r.bpm, r.tempo, r.beats_per_bar, r.beat_f, r.downbeat_f]
        lines.append("| " + " | ".join(_cell(c) for c in [*cells, r.seconds]) + " |")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Score beat trackers on the golden set.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--synth", action="store_true", help="synthesised pieces, known beats")
    source.add_argument("--manifest", type=Path, help="the golden manifest")
    parser.add_argument("--name", help="results file name (default: synth or golden)")
    args = parser.parse_args()

    skipped: list[str] = []
    with tempfile.TemporaryDirectory() as folder:
        if args.synth:
            cases = synth_cases(Path(folder))
        else:
            cases, skipped = manifest_cases(args.manifest)
        if not cases:
            print("No songs with audio on this machine; nothing to run.", file=sys.stderr)
            return 1
        rows, missing, timing = evaluate(cases)

    table = summary(rows)
    name = args.name or ("synth" if args.synth else "golden")
    results = HERE / "results"
    results.mkdir(exist_ok=True)
    report = {
        "summary": table,
        "rows": [asdict(r) for r in rows],
        "unavailable": missing,
        "skipped_songs": skipped,
        **timing,
    }
    (results / f"{name}.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(markdown(table, rows))
    for tracker, reason in missing.items():
        print(f"\n{tracker} unavailable: {reason}")
    if skipped:
        print(f"\nSkipped (no audio here): {', '.join(skipped)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
