"""Job error codes: what `jobs.error_code` holds and the web explains.

The codes and their learner-facing words live in `schema/job-errors.json`, shared with the
web. This module maps pipeline failures onto them.
"""

from __future__ import annotations

from typing import Final

from isai.errors import ExitCode, PipelineError
from isai.schema import load_json, schema_dir

CODES: Final = (
    "decode_failed",
    "too_long",
    "silent",
    "unsupported_type",
    "model_failed",
    "timeout",
    "upload_expired",
    "internal",
)

_BY_EXIT: Final[dict[int, str]] = {
    ExitCode.DECODE_FAILED: "decode_failed",
    ExitCode.TOO_LONG: "too_long",
    ExitCode.SILENT: "silent",
    ExitCode.MODEL_MISSING: "model_failed",
    ExitCode.USAGE: "unsupported_type",
}


class JobError(Exception):
    """A job failure with its code. The message is for logs and `jobs.error_message`: no
    file names, titles or audio details (architecture §9)."""

    def __init__(self, code: str, message: str = "") -> None:
        if code not in CODES:
            raise ValueError(f"unknown job error code {code!r}")
        super().__init__(message or code)
        self.code = code


def code_for_exit(exit_code: int) -> str:
    """The job error code for an `isai analyse` exit code (anything unknown is internal)."""
    return _BY_EXIT.get(exit_code, "internal")


def code_for_exception(error: BaseException) -> str:
    if isinstance(error, JobError):
        return error.code
    if isinstance(error, PipelineError):
        return code_for_exit(error.exit_code)
    return "internal"


def messages() -> dict[str, dict[str, str]]:
    """The shared learner-facing words, keyed by code."""
    data = load_json(schema_dir() / "job-errors.json")
    return {k: v for k, v in data.items() if not k.startswith("$")}
