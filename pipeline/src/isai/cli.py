"""`isai` command line.

`isai analyse song.mp3 --type full-mix --out out/` writes `out/song.song.json` and
`out/song.mid`. Exit codes: 0 done, 1 invalid Song, 2 input missing or bad arguments,
3 schema not found, 4 decode failed, 5 too long, 6 silent, 7 a model or torch missing.
`isai models list` and `isai models fetch` manage the model weights.
`isai worker [--once]` processes the analysis queue; `isai worker sweep` deletes old uploads.
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from jsonschema import FormatChecker

from isai import __version__, models
from isai.arrange import LEVELS
from isai.assemble import SongInfo
from isai.errors import ExitCode, ModelMissingError, PipelineError
from isai.models import fetch as fetch_model
from isai.pipeline import LATER_TYPES, STAGES, SUPPORTED_TYPES, Options, Result, run
from isai.rhythm import LibrosaTracker
from isai.schema import SchemaNotFoundError, SongValidationError


def _write(song: dict[str, Any], midi: bytes, out_dir: Path, stem: str) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    song_path = out_dir / f"{stem}.song.json"
    with song_path.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(song, f, indent=2, ensure_ascii=False)
        f.write("\n")
    midi_path = out_dir / f"{stem}.mid"
    midi_path.write_bytes(midi)
    return song_path, midi_path


def write_outputs(result: Result, out_dir: Path, stem: str) -> list[tuple[Path, Path]]:
    """Write each arrangement's Song JSON and MIDI file; return their paths.

    One arrangement is `<stem>.song.json`; several (`--level all`) are
    `<stem>.<level>.song.json`.
    """
    arrangements = result.arrangements or {"": (result.song, result.midi)}
    if len(arrangements) == 1:
        song, midi = next(iter(arrangements.values()))
        return [_write(song, midi, out_dir, stem)]
    return [
        _write(song, midi, out_dir, f"{stem}.{level}")
        for level, (song, midi) in arrangements.items()
    ]


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="isai", description="Isai song analysis pipeline.")
    parser.add_argument("--version", action="version", version=f"isai {__version__}")
    commands = parser.add_subparsers(dest="command", required=True)

    analyse = commands.add_parser("analyse", help="analyse one song into Song JSON and MIDI")
    analyse.add_argument("file", type=Path, help="audio file to analyse")
    analyse.add_argument(
        "--type",
        required=True,
        choices=[*SUPPORTED_TYPES, *LATER_TYPES],
        help="what the recording is: solo piano, a full mix, or unaccompanied voice",
    )
    analyse.add_argument("--out", type=Path, required=True, help="output directory")
    analyse.add_argument("--title", help="song title (default: file name)")
    analyse.add_argument("--id", dest="song_id", help="Song id (default: a new random id)")
    analyse.add_argument(
        "--created-at",
        help="creation time, ISO 8601 with a UTC offset (default: now); fix it for "
        "repeatable output",
    )
    analyse.add_argument(
        "--cache-dir", type=Path, default=Path(".cache"), help="stage cache (default: .cache)"
    )
    analyse.add_argument("--no-cache", action="store_true", help="run every stage afresh")
    analyse.add_argument(
        "--from-stage", choices=STAGES, help="re-run this stage and the ones after it"
    )
    analyse.add_argument(
        "--log-json", action="store_true", help="log each stage as a JSON line on stderr"
    )
    analyse.add_argument(
        "--device",
        choices=["auto", "cpu", "cuda"],
        default="auto",
        help="where the models run (default: auto, the GPU when torch sees one)",
    )
    analyse.add_argument(
        "--beat-tracker",
        choices=["librosa", "beat-this"],
        default="librosa",
        help="beats and bars from librosa's tracker (default, ADR 0014) or Beat This! (a model)",
    )
    analyse.add_argument(
        "--level",
        choices=[*LEVELS, "all"],
        default="medium",
        help="arrangement level (default: medium); all writes one Song per level",
    )
    analyse.add_argument(
        "--simplify",
        choices=["easy", "medium"],
        help="piano-solo: arrange the transcription at this level instead of keeping it",
    )
    analyse.add_argument(
        "--keep-stems",
        action="store_true",
        help="full-mix: also write the separated stems to <out>/stems/ (local use only)",
    )
    models_parser = commands.add_parser("models", help="list or download the analysis models")
    models_commands = models_parser.add_subparsers(dest="models_command", required=True)
    models_commands.add_parser("list", help="each model, its licence and whether it's here")
    fetch = models_commands.add_parser("fetch", help="download and verify models")
    fetch.add_argument("names", nargs="*", help="model names (default: all)")

    worker = commands.add_parser(
        "worker", help="process the analysis queue (needs ISAI_SUPABASE_URL and a service key)"
    )
    worker.add_argument(
        "action", nargs="?", choices=["run", "sweep"], default="run",
        help="run (default): process jobs; sweep: delete uploads older than 24 h, then exit",
    )  # fmt: skip
    worker.add_argument("--once", action="store_true", help="process at most one job, then exit")
    worker.add_argument(
        "--device", choices=["auto", "cpu", "cuda"], default="auto", help="where the models run"
    )
    return parser


def _models(args: argparse.Namespace) -> int:
    if args.models_command == "list":
        for model in models.REGISTRY.values():
            try:
                status = f"here ({models.model_path(model.name)})"
            except ModelMissingError:
                status = "missing"
            size = f"{model.size / 1e6:.0f} MB"
            print(f"{model.name}: {model.what}; {size}; {model.licence}; {status}")
        return ExitCode.OK
    unknown = [name for name in args.names if name not in models.REGISTRY]
    if unknown:
        known = ", ".join(models.REGISTRY)
        print(f"isai: unknown model {', '.join(unknown)} (known: {known})", file=sys.stderr)
        return ExitCode.USAGE
    for name in args.names or list(models.REGISTRY):
        try:
            path = fetch_model(name)
        except ModelMissingError as e:
            print(f"isai: {e}", file=sys.stderr)
            return e.exit_code
        except OSError as e:
            print(f"isai: downloading {name} failed: {e}", file=sys.stderr)
            return ExitCode.MODEL_MISSING
        print(f"{name}: {path}")
    return ExitCode.OK


def _created_at(value: str | None) -> str:
    if value is None:
        return datetime.now(UTC).isoformat(timespec="seconds")
    # The schema's own check (RFC 3339), so a bad value fails here, before the analysis.
    if not FormatChecker().conforms(value, "date-time"):
        raise ValueError(
            "--created-at must be an ISO 8601 date and time with a UTC offset, "
            f"like 2026-11-14T10:00:00+05:30, got {value!r}"
        )
    return value


def _worker(args: argparse.Namespace) -> int:
    import signal

    from isai.worker.analyser import SubprocessAnalyser
    from isai.worker.loop import Worker, WorkerConfig
    from isai.worker.repository import StoreSongRepository
    from isai.worker.supabase_impl import (
        SettingsError,
        SupabaseJobQueue,
        SupabaseObjectStore,
        connect,
        load_settings,
    )

    try:
        settings = load_settings()
    except SettingsError as e:
        print(f"isai: {e}", file=sys.stderr)
        return ExitCode.USAGE
    client = connect(settings)
    store = SupabaseObjectStore(client)
    worker = Worker(
        SupabaseJobQueue(client),
        store,
        StoreSongRepository(store),
        SubprocessAnalyser(device=args.device),
        WorkerConfig(worker_id=settings.worker_id),
    )
    if args.action == "sweep":
        deleted = worker.sweep()
        print(f"Deleted {len(deleted)} uploads older than 24 hours")
        return ExitCode.OK

    def on_signal(_signum: int, _frame: object) -> None:
        if worker.stop.is_set():
            worker.abort.set()  # second time: put the current job back in the queue now
        else:
            worker.stop.set()
            print("isai: finishing the current job; press Ctrl+C again to release it",
                  file=sys.stderr)  # fmt: skip

    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)
    worker.log("start", once=args.once)
    count = worker.run(once=args.once)
    worker.log("stop", processed=count)
    return ExitCode.OK


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.command == "models":
        return _models(args)
    if args.command == "worker":
        return _worker(args)
    source: Path = args.file
    if args.type in LATER_TYPES:
        print(f"isai: {args.type} songs are coming in a later version", file=sys.stderr)
        return ExitCode.USAGE
    if not source.is_file():
        print(f"isai: input file not found: {source}", file=sys.stderr)
        return ExitCode.USAGE
    try:
        info = SongInfo(
            song_id=args.song_id or uuid.uuid4().hex,
            title=args.title or source.stem,
            source_type=args.type,
            created_at=_created_at(args.created_at),
        )
    except ValueError as e:
        print(f"isai: {e}", file=sys.stderr)
        return ExitCode.USAGE
    options = Options(
        source_type=args.type,
        cache_root=None if args.no_cache else args.cache_dir,
        from_stage=args.from_stage,
        log_json=args.log_json,
        device=args.device,
        keep_stems=args.out / "stems" if args.keep_stems else None,
        tracker=None if args.beat_tracker == "beat-this" else LibrosaTracker(),
        levels=LEVELS if args.level == "all" else (args.level,),
        simplify=args.simplify if args.type == "piano-solo" else None,
    )
    try:
        result = run(source, info, options)
    except SchemaNotFoundError as e:
        # A broken install, not a user mistake: say so and how to fix it.
        print(f"isai: {e}. Is the repo's schema/ folder present?", file=sys.stderr)
        return ExitCode.SCHEMA_NOT_FOUND
    except PipelineError as e:
        print(f"isai: {e}", file=sys.stderr)
        return e.exit_code
    except SongValidationError as e:
        print(f"isai: {e}", file=sys.stderr)
        return ExitCode.INVALID_SONG
    for song_path, midi_path in write_outputs(result, args.out, source.stem):
        print(f"Wrote {song_path} and {midi_path}")
    if result.stem_files:
        print(f"Wrote {len(result.stem_files)} stems to {result.stem_files[0].parent}")
    return ExitCode.OK


if __name__ == "__main__":
    raise SystemExit(main())
