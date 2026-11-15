"""Run the pipeline for one job in a child process.

A child process can be stopped at the job's deadline or when the worker must let the job
go, keeps model memory from building up across jobs, and reports through the same exit
codes and JSON stage log as `isai analyse`.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from isai.worker.errors import JobError, code_for_exit
from isai.worker.ports import Job

StageCallback = Callable[[str, float], None]
"""Called with each finished stage's name and seconds."""


class Cancelled(Exception):
    """The analysis was stopped because the worker is letting the job go."""


@dataclass(frozen=True)
class Analysis:
    song: dict[str, Any]
    midi: bytes


class Analyser(Protocol):
    def analyse(
        self,
        audio: Path,
        job: Job,
        work: Path,
        on_stage: StageCallback,
        cancelled: Callable[[], bool],
        timeout_sec: float,
    ) -> Analysis: ...


class SubprocessAnalyser:
    """`isai analyse` in a child process, its output written inside `work`."""

    def __init__(
        self,
        command: Sequence[str] | None = None,
        device: str = "auto",
        poll_sec: float = 0.25,
    ) -> None:
        self.command = list(command) if command else [sys.executable, "-m", "isai.cli"]
        self.device = device
        self.poll_sec = poll_sec

    def analyse(
        self,
        audio: Path,
        job: Job,
        work: Path,
        on_stage: StageCallback,
        cancelled: Callable[[], bool],
        timeout_sec: float,
    ) -> Analysis:
        out = work / "out"
        argv = [
            *self.command,
            "analyse",
            str(audio),
            "--type",
            job.source_type,
            "--level",
            job.level,
            "--id",
            job.song_id,
            "--title",
            job.title,
            "--out",
            str(out),
            "--cache-dir",
            str(work / "cache"),
            "--device",
            self.device,
            "--log-json",
        ]
        # Its own process group, so the worker's Ctrl+C doesn't kill the analysis: the
        # worker decides whether to finish or let the job go.
        if os.name == "nt":
            group: dict[str, Any] = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
        else:
            group = {"start_new_session": True}
        proc = subprocess.Popen(
            argv,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            **group,
        )
        reader = threading.Thread(target=_read_stages, args=(proc, on_stage), daemon=True)
        reader.start()
        started = time.monotonic()
        try:
            while proc.poll() is None:
                if cancelled():
                    raise Cancelled
                if time.monotonic() - started > timeout_sec:
                    raise JobError("timeout", f"analysis passed {timeout_sec:.0f} s")
                time.sleep(self.poll_sec)
        except BaseException:
            proc.kill()
            proc.wait()
            raise
        finally:
            reader.join(timeout=5)
        if proc.returncode != 0:
            code = code_for_exit(proc.returncode)
            raise JobError(code, f"isai analyse exited with {proc.returncode}")
        stem = audio.stem
        song_file, midi_file = out / f"{stem}.song.json", out / f"{stem}.mid"
        if not song_file.is_file() or not midi_file.is_file():
            raise JobError("internal", "isai analyse wrote no Song")
        song: dict[str, Any] = json.loads(song_file.read_text(encoding="utf-8"))
        return Analysis(song=song, midi=midi_file.read_bytes())


def _read_stages(proc: subprocess.Popen[str], on_stage: StageCallback) -> None:
    stream = proc.stderr
    if stream is None:
        return
    for line in stream:
        try:
            event = json.loads(line)
        except ValueError:
            continue  # plain messages; they may name files, so they aren't passed on
        if isinstance(event, dict) and event.get("event") == "stage":  # pyright: ignore[reportUnknownMemberType]
            data: dict[str, Any] = event  # pyright: ignore[reportUnknownVariableType]
            try:
                on_stage(str(data["stage"]), float(data["seconds"]))
            except Exception:  # a progress update failing must not stop the analysis
                continue
