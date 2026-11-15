"""Runs pipeline stages: caching each output, timing it, and logging what happened.

Stages are plain functions over typed artifacts; they don't read files or global config.
The runner sits around them: for each stage it builds a cache directory from the audio
hash, the stage's name and version, its options and the stage before it, so changing one
stage invalidates everything after it and nothing before.

    .cache/<audio-hash>/<stage>-<version>-<key>/
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, TextIO, TypeVar

from isai import cache

A = TypeVar("A")


@dataclass(frozen=True)
class StageRecord:
    """One stage's run, for the log and for tests."""

    name: str
    version: str
    seconds: float
    cached: bool
    detail: Mapping[str, Any] = field(default_factory=lambda: {})
    """What the stage found, for the log and the golden report (bpm, stability, key)."""


@dataclass
class Runner:
    """Caches and times stages for one song.

    `cache_root` None (or `--no-cache`) runs every stage; `from_stage` re-runs that stage
    and every stage after it, reading the cache only for the stages before.
    """

    audio_hash: str
    cache_root: Path | None = None
    from_stage: str | None = None
    log_json: bool = False
    log_stream: TextIO = field(default_factory=lambda: sys.stderr)
    clock: Callable[[], float] = time.perf_counter
    records: list[StageRecord] = field(default_factory=lambda: [])
    _previous_key: str = ""
    _rerun: bool = False

    def stage(
        self,
        name: str,
        version: str,
        cls: type[A],
        compute: Callable[[], A],
        options: Mapping[str, Any] | None = None,
        detail: Callable[[A], Mapping[str, Any]] | None = None,
    ) -> A:
        """Return the stage's artifact: from the cache if it is there and allowed, else computed.

        `detail` picks what the log line reports about the artifact.
        """
        key = self._key(name, version, options or {})
        if self.from_stage == name:
            self._rerun = True
        directory = self._directory(name, version, key)
        started = self.clock()
        artifact = None if directory is None or self._rerun else cache.load(directory, cls)
        cached = artifact is not None
        if artifact is None:
            artifact = compute()
            if directory is not None:
                cache.save(directory, artifact)
        record = StageRecord(
            name=name,
            version=version,
            seconds=self.clock() - started,
            cached=cached,
            detail=detail(artifact) if detail is not None else {},
        )
        self.records.append(record)
        self._log(record)
        self._previous_key = key
        return artifact

    def note(
        self,
        name: str,
        version: str,
        seconds: float,
        options: Mapping[str, Any] | None = None,
    ) -> None:
        """Record a step the runner doesn't cache (ingest, which produces the hash itself).

        Its version and options still join the key chain, so changing the step invalidates
        every cached stage after it.
        """
        record = StageRecord(name=name, version=version, seconds=seconds, cached=False)
        self.records.append(record)
        self._log(record)
        self._previous_key = self._key(name, version, options or {})

    def _key(self, name: str, version: str, options: Mapping[str, Any]) -> str:
        text = json.dumps(
            {"stage": name, "version": version, "options": options, "after": self._previous_key},
            sort_keys=True,
        )
        return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]

    def _directory(self, name: str, version: str, key: str) -> Path | None:
        if self.cache_root is None:
            return None
        return self.cache_root / self.audio_hash / f"{name}-{version}-{key}"

    def _log(self, record: StageRecord) -> None:
        if not self.log_json:
            return
        line: dict[str, Any] = {
            "event": "stage",
            "stage": record.name,
            "version": record.version,
            "seconds": round(record.seconds, 4),
            "cached": record.cached,
        }
        if record.detail:
            line["detail"] = dict(record.detail)
        self.log_stream.write(json.dumps(line) + "\n")
