from collections.abc import Iterator

import pytest

import isai.pipeline
from tests.fakes import fake_models


@pytest.fixture(autouse=True)
def fake_models_unless_slow(request: pytest.FixtureRequest) -> Iterator[None]:
    """Fast tests get fake models wherever the pipeline would build real ones.

    Tests marked `slow` keep the real models (torch and the fetched weights).
    """
    if request.node.get_closest_marker("slow") is not None:
        yield
        return
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(isai.pipeline, "default_models", lambda _choice="auto": fake_models()[0])
        yield
