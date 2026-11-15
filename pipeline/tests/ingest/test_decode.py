"""ffmpeg's failure paths, with `subprocess.run` faked so they need no broken ffmpeg."""

import importlib
import subprocess
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from isai.errors import DecodeError
from isai.ingest.decode import Tools, decode, find_tools, probe_duration

# The module, not the `decode` function that `isai.ingest` re-exports under the same name.
decode_module = importlib.import_module("isai.ingest.decode")
TOOLS = Tools(ffmpeg="ffmpeg", ffprobe="ffprobe", version="7.1")


def fake_run(
    monkeypatch: pytest.MonkeyPatch, returncode: int = 0, stdout: Any = "", stderr: Any = ""
) -> None:
    def run(command: list[str], **_kwargs: Any) -> subprocess.CompletedProcess[Any]:
        if returncode != 0 and _kwargs.get("check"):
            raise subprocess.CalledProcessError(returncode, command, stdout, stderr)
        return subprocess.CompletedProcess(command, returncode, stdout, stderr)

    monkeypatch.setattr(decode_module.subprocess, "run", run)


@pytest.fixture
def fake_tools(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """ffmpeg and ffprobe that exist (so _locate passes) but are never really run."""
    for name, env in (("ffmpeg", "ISAI_FFMPEG"), ("ffprobe", "ISAI_FFPROBE")):
        path = tmp_path / name
        path.write_text("")
        monkeypatch.setenv(env, str(path))


@pytest.mark.usefixtures("fake_tools")
def test_find_tools_reports_an_ffmpeg_that_fails_to_run(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_run(monkeypatch, returncode=1, stderr="boom")
    with pytest.raises(DecodeError, match="could not be run"):
        find_tools()


@pytest.mark.usefixtures("fake_tools")
def test_find_tools_reports_an_unreadable_version(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_run(monkeypatch, stdout="avconv something\n")
    with pytest.raises(DecodeError, match="could not read the ffmpeg version"):
        find_tools()


@pytest.mark.usefixtures("fake_tools")
def test_find_tools_refuses_an_old_ffmpeg(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_run(monkeypatch, stdout="ffmpeg version 4.4.2 Copyright\n")
    with pytest.raises(DecodeError, match=r"ffmpeg 4\.4 is too old"):
        find_tools()


@pytest.mark.usefixtures("fake_tools")
def test_find_tools_reads_a_git_build_version(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_run(monkeypatch, stdout="ffmpeg version n7.1 Copyright\n")
    assert find_tools().version == "7.1"


def test_find_tools_reports_a_file_that_is_not_a_program(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    # A real run of something that can't execute: OSError, turned into a DecodeError.
    text = tmp_path / "ffmpeg.txt"
    text.write_text("not a program")
    monkeypatch.setenv("ISAI_FFMPEG", str(text))
    monkeypatch.setenv("ISAI_FFPROBE", str(text))
    with pytest.raises(DecodeError, match="could not be run"):
        find_tools()


@pytest.mark.parametrize("stdout", ["not json", "{}", '{"format": {"duration": null}}'])
def test_probe_duration_is_none_when_ffprobe_cannot_tell(
    monkeypatch: pytest.MonkeyPatch, stdout: str
) -> None:
    fake_run(monkeypatch, stdout=stdout)
    assert probe_duration(TOOLS, Path("song.mp3")) is None


def test_probe_duration_reads_the_container(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_run(monkeypatch, stdout='{"format": {"duration": "241.5"}}')
    assert probe_duration(TOOLS, Path("song.mp3")) == 241.5


def test_decode_reports_ffmpeg_failing(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_run(monkeypatch, returncode=1, stdout=b"", stderr=b"first\n  Invalid data found  \n\n")
    with pytest.raises(DecodeError, match=r"could not decode song\.mp3: Invalid data found$"):
        decode(TOOLS, Path("song.mp3"), 44_100, 60)


def test_decode_reports_an_empty_stream(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_run(monkeypatch, stdout=b"", stderr=b"")
    with pytest.raises(DecodeError, match="has no audio stream"):
        decode(TOOLS, Path("video.mp4"), 44_100, 60)


def test_decode_reads_little_endian_float_pcm(monkeypatch: pytest.MonkeyPatch) -> None:
    pcm = np.array([0.0, 0.5, -0.25], dtype="<f4")
    fake_run(monkeypatch, stdout=pcm.tobytes())
    samples = decode(TOOLS, Path("song.wav"), 44_100, 60)
    assert samples.dtype == np.float32
    assert samples.tolist() == [0.0, 0.5, -0.25]
