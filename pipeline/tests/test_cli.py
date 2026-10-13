import shutil
import subprocess
import sys
from pathlib import Path

import pytest

import isai.cli
from isai.cli import analyse, main
from isai.schema import SongValidationError, load_json, validate_song


@pytest.fixture
def source(tmp_path: Path) -> Path:
    path = tmp_path / "my song.txt"
    path.write_text("not audio, the stub does not read it")
    return path


def test_analyse_writes_valid_song(source: Path, tmp_path: Path) -> None:
    out = analyse(source, tmp_path / "out")
    assert out == tmp_path / "out" / "my song.song.json"
    song = load_json(out)
    validate_song(song)
    assert song["title"] == "my song"
    assert song["meta"]["pipelineVersion"] == "0.1.0"


def test_analyse_uses_given_title_and_fresh_id(source: Path, tmp_path: Path) -> None:
    first = load_json(analyse(source, tmp_path / "a", title="Vaseegara"))
    second = load_json(analyse(source, tmp_path / "b"))
    assert first["title"] == "Vaseegara"
    assert first["id"] != second["id"]


def test_main_success(source: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["analyse", str(source), "--out", str(tmp_path / "out")]) == 0
    assert "Wrote" in capsys.readouterr().out


def test_main_missing_file(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    code = main(["analyse", str(tmp_path / "nope.wav"), "--out", str(tmp_path / "out")])
    assert code == 2
    assert "input file not found" in capsys.readouterr().err
    assert not (tmp_path / "out").exists()


def test_main_requires_out(source: Path) -> None:
    with pytest.raises(SystemExit) as exc:
        main(["analyse", str(source)])
    assert exc.value.code == 2


def test_main_schema_not_found(
    source: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("ISAI_SCHEMA_DIR", str(tmp_path / "empty"))
    assert main(["analyse", str(source), "--out", str(tmp_path / "out")]) == 3
    err = capsys.readouterr().err
    assert "ISAI_SCHEMA_DIR" in err
    assert "input file not found" not in err


def test_main_invalid_song(
    source: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    def reject(_doc: object) -> None:
        raise SongValidationError(["$.notes[0]: broken on purpose"])

    monkeypatch.setattr(isai.cli, "validate_song", reject)
    assert main(["analyse", str(source), "--out", str(tmp_path / "out")]) == 1
    assert "broken on purpose" in capsys.readouterr().err


def test_console_script_runs(source: Path, tmp_path: Path) -> None:
    # The `isai` entry point installed next to this interpreter, not `python -m`.
    script = shutil.which("isai", path=str(Path(sys.executable).parent))
    assert script is not None, "isai console script is not installed in this environment"
    result = subprocess.run(
        [script, "analyse", str(source), "--out", str(tmp_path)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    validate_song(load_json(tmp_path / "my song.song.json"))
