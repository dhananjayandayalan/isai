"""`isai` command line.

P0: `isai analyse` is a stub. It checks the input exists and writes a placeholder Song
copied from a schema example. No audio is read.
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

from isai import __version__
from isai.schema import SongValidationError, examples_dir, load_json, validate_song

PLACEHOLDER_EXAMPLE = "twinkle-g-major.json"


def build_placeholder_song(source: Path, title: str | None = None) -> dict[str, Any]:
    song: dict[str, Any] = load_json(examples_dir() / PLACEHOLDER_EXAMPLE)
    song["id"] = uuid.uuid4().hex
    song["title"] = title or source.stem
    song["meta"]["pipelineVersion"] = __version__
    song["meta"]["createdAt"] = datetime.now(UTC).isoformat(timespec="seconds")
    validate_song(song)
    return song


def analyse(source: Path, out_dir: Path, title: str | None = None) -> Path:
    """Write `<out_dir>/<stem>.song.json` for `source` and return its path."""
    if not source.is_file():
        raise FileNotFoundError(f"input file not found: {source}")
    song = build_placeholder_song(source, title)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{source.stem}.song.json"
    with out_path.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(song, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return out_path


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="isai", description="Isai song analysis pipeline.")
    parser.add_argument("--version", action="version", version=f"isai {__version__}")
    commands = parser.add_subparsers(dest="command", required=True)

    analyse_cmd = commands.add_parser("analyse", help="analyse one song into Song JSON")
    analyse_cmd.add_argument("file", type=Path, help="audio file to analyse")
    analyse_cmd.add_argument("--out", type=Path, required=True, help="output directory")
    analyse_cmd.add_argument("--title", help="song title (default: file name)")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.command == "analyse":
        try:
            out_path = analyse(args.file, args.out, args.title)
        except FileNotFoundError as e:
            print(f"isai: {e}", file=sys.stderr)
            return 2
        except SongValidationError as e:
            print(f"isai: {e}", file=sys.stderr)
            return 1
        print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
