"""Generate Pydantic v2 models from the Song schema into `isai/generated/` (ADR 0002).

Run with `uv run gen-models`. Never edit the output by hand.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from isai.schema import schema_path

GENERATED_DIR = Path(__file__).resolve().parent / "generated"
OUTPUT = GENERATED_DIR / "song.py"


def build_command(schema: Path, output: Path) -> list[str]:
    return [
        sys.executable,
        "-m",
        "datamodel_code_generator",
        "--input",
        str(schema),
        "--input-file-type",
        "jsonschema",
        "--output",
        str(output),
        "--output-model-type",
        "pydantic_v2.BaseModel",
        "--target-python-version",
        "3.11",
        "--use-schema-description",
        "--use-field-description",
        "--use-standard-collections",
        "--use-union-operator",
        "--use-title-as-name",
        "--enum-field-as-literal",
        "all",
        "--use-annotated",
        "--field-constraints",
        "--disable-timestamp",
        "--formatters",
        "ruff-format",
        "ruff-check",
    ]


def main() -> int:
    GENERATED_DIR.mkdir(exist_ok=True)
    result = subprocess.run(build_command(schema_path(), OUTPUT), check=False)
    if result.returncode != 0:
        return result.returncode
    init = GENERATED_DIR / "__init__.py"
    init.write_text('"""Generated from schema/song.schema.json. Do not edit."""\n', newline="\n")
    # Normalise line endings so regeneration is byte-identical on every OS.
    OUTPUT.write_bytes(OUTPUT.read_bytes().replace(b"\r\n", b"\n"))
    print(f"Wrote {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
