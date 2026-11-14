"""Pipeline failures and the CLI exit codes they map to (the worker maps them to job errors)."""

from __future__ import annotations

from enum import IntEnum


class ExitCode(IntEnum):
    OK = 0
    INVALID_SONG = 1
    INPUT_MISSING = 2
    SCHEMA_NOT_FOUND = 3
    DECODE_FAILED = 4
    TOO_LONG = 5
    SILENT = 6


class PipelineError(Exception):
    """A failure the learner (or the worker) can act on, with the exit code that names it."""

    exit_code: ExitCode = ExitCode.DECODE_FAILED


class DecodeError(PipelineError):
    """ffmpeg is missing, or the file isn't audio it can decode."""

    exit_code = ExitCode.DECODE_FAILED


class TooLongError(PipelineError):
    """The input is longer or larger than the pipeline accepts."""

    exit_code = ExitCode.TOO_LONG


class SilentAudioError(PipelineError):
    """The file decodes but holds no audio above the silence threshold."""

    exit_code = ExitCode.SILENT
