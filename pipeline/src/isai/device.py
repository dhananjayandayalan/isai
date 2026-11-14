"""Where the models run: `auto` picks CUDA when torch can see a GPU, else the CPU."""

from __future__ import annotations

from typing import Literal

from isai.errors import ModelMissingError

Device = Literal["cpu", "cuda"]
DeviceChoice = Literal["auto", "cpu", "cuda"]

TORCH_HINT = (
    "the model stages need torch; install it with `uv sync --extra cuda` (NVIDIA GPU) "
    "or `uv sync --extra cpu`"
)


def torch_available() -> bool:
    try:
        import torch  # noqa: F401  # pyright: ignore[reportUnusedImport]
    except ImportError:
        return False
    return True


def resolve(choice: DeviceChoice) -> Device:
    """The device to use; ModelMissingError (exit 7) without torch, or `cuda` without a GPU."""
    try:
        import torch
    except ImportError as e:
        raise ModelMissingError(TORCH_HINT) from e
    has_gpu = bool(torch.cuda.is_available())
    if choice == "cuda" and not has_gpu:
        raise ModelMissingError("--device cuda was asked for, but torch can't see a GPU")
    if choice == "auto":
        return "cuda" if has_gpu else "cpu"
    return choice
