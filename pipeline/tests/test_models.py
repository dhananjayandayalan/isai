import hashlib
import io
from pathlib import Path

import pytest

import isai.models as models
from isai.cli import main
from isai.device import resolve, torch_available
from isai.errors import ExitCode, ModelMissingError
from isai.models import Model, fetch, model_path

CONTENT = b"weights" * 1000
FAKE = Model(
    name="fake",
    filename="fake.bin",
    url="https://example.invalid/fake.bin",
    sha256=hashlib.sha256(CONTENT).hexdigest(),
    size=len(CONTENT),
    licence="MIT",
    what="testing",
)


@pytest.fixture
def registry(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    monkeypatch.setenv(models.MODEL_DIR_ENV, str(tmp_path))
    monkeypatch.setattr(models, "REGISTRY", {"fake": FAKE})
    return tmp_path


def serve(content: bytes):
    def opener(_url: str) -> io.BytesIO:
        return io.BytesIO(content)

    return opener


def test_a_missing_model_says_how_to_fetch_it(registry: Path) -> None:
    with pytest.raises(ModelMissingError, match="isai models fetch fake") as exc:
        model_path("fake")
    assert exc.value.exit_code == ExitCode.MODEL_MISSING == 7


def test_fetch_downloads_verifies_and_marks_the_file(registry: Path) -> None:
    path = fetch("fake", opener=serve(CONTENT))
    assert path == registry / "fake.bin"
    assert path.read_bytes() == CONTENT
    assert (registry / "fake.bin.verified").is_file()
    assert not (registry / "fake.bin.part").exists()
    # Already there: no second download.
    assert fetch("fake", opener=serve(b"never read")) == path


def test_a_corrupt_download_is_not_kept(registry: Path) -> None:
    with pytest.raises(ModelMissingError, match="expected"):
        fetch("fake", opener=serve(b"tampered"))
    assert list(registry.iterdir()) == []


def test_a_file_changed_after_verifying_fails_its_checksum(registry: Path) -> None:
    path = fetch("fake", opener=serve(CONTENT))
    path.write_bytes(b"x" * len(CONTENT))  # same size, new content and mtime
    with pytest.raises(ModelMissingError, match="fails its checksum"):
        model_path("fake")
    # A broken marker is ignored, and the file re-checked.
    path.write_bytes(CONTENT)
    (registry / "fake.bin.verified").write_text("not json")
    assert model_path("fake") == path


def test_fetch_replaces_a_broken_file(registry: Path) -> None:
    (registry / "fake.bin").write_bytes(b"broken")
    assert fetch("fake", opener=serve(CONTENT)).read_bytes() == CONTENT


def test_models_list_and_fetch_on_the_command_line(
    registry: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main(["models", "list"]) == 0
    assert "fake: testing" in capsys.readouterr().out
    monkeypatch.setattr("isai.cli.fetch_model", lambda name: fetch(name, serve(CONTENT)))
    assert main(["models", "fetch"]) == 0
    capsys.readouterr()
    assert main(["models", "list"]) == 0
    assert "here" in capsys.readouterr().out


def test_models_fetch_reports_failures(
    registry: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr("isai.cli.fetch_model", lambda name: fetch(name, serve(b"bad")))
    assert main(["models", "fetch", "fake"]) == 7

    def offline(_name: str) -> Path:
        raise OSError("no network")

    monkeypatch.setattr("isai.cli.fetch_model", offline)
    assert main(["models", "fetch", "fake"]) == 7
    assert "no network" in capsys.readouterr().err
    assert main(["models", "fetch", "nope"]) == 2
    assert "unknown model nope" in capsys.readouterr().err


def test_the_real_registry_names_licences_and_checksums() -> None:
    for model in models.REGISTRY.values():
        assert len(model.sha256) == 64 and model.size > 0 and model.licence
        assert model.url.startswith("https://")


def test_device_auto_picks_what_torch_sees(monkeypatch: pytest.MonkeyPatch) -> None:
    if not torch_available():
        with pytest.raises(ModelMissingError, match="uv sync --extra"):
            resolve("auto")
        return
    import torch

    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)
    assert resolve("auto") == "cpu"
    assert resolve("cpu") == "cpu"
    with pytest.raises(ModelMissingError, match="can't see a GPU"):
        resolve("cuda")
    monkeypatch.setattr(torch.cuda, "is_available", lambda: True)
    assert resolve("auto") == "cuda"


def test_device_without_torch(monkeypatch: pytest.MonkeyPatch) -> None:
    import builtins

    real_import = builtins.__import__

    def no_torch(name: str, *args: object, **kwargs: object) -> object:
        if name == "torch":
            raise ImportError("no torch")
        return real_import(name, *args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(builtins, "__import__", no_torch)
    assert torch_available() is False
    with pytest.raises(ModelMissingError, match="uv sync --extra cuda"):
        resolve("auto")
