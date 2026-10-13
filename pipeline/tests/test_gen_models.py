import sys
from pathlib import Path

from isai.gen_models import OUTPUT, build_command


def _flag_value(cmd: list[str], flag: str) -> str:
    return cmd[cmd.index(flag) + 1]


def test_build_command_runs_datamodel_codegen_with_this_python() -> None:
    cmd = build_command(Path("in.json"), Path("out.py"))
    assert cmd[:3] == [sys.executable, "-m", "datamodel_code_generator"]


def test_build_command_paths() -> None:
    cmd = build_command(Path("schema/song.schema.json"), Path("gen/song.py"))
    assert _flag_value(cmd, "--input") == str(Path("schema/song.schema.json"))
    assert _flag_value(cmd, "--output") == str(Path("gen/song.py"))
    assert _flag_value(cmd, "--input-file-type") == "jsonschema"


def test_build_command_flags_that_shape_the_models() -> None:
    cmd = build_command(Path("in.json"), Path("out.py"))
    assert _flag_value(cmd, "--output-model-type") == "pydantic_v2.BaseModel"
    assert _flag_value(cmd, "--target-python-version") == "3.11"
    assert _flag_value(cmd, "--enum-field-as-literal") == "all"
    # Names must come from schema titles so both generators agree (ADR 0002), and the
    # output must be byte-stable so /schema-sync shows no diff.
    for flag in ("--use-title-as-name", "--disable-timestamp", "--field-constraints"):
        assert flag in cmd


def test_output_is_the_generated_package() -> None:
    assert OUTPUT.parent.name == "generated"
    assert OUTPUT.name == "song.py"
