import sys

import isai


def test_python_pin() -> None:
    assert sys.version_info[:2] == (3, 11), "ADR-002: the research engine runs on Python 3.11 only"


def test_package_imports() -> None:
    assert isai.__version__
