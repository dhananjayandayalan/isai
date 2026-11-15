"""Error codes, settings and the Supabase adapters over a stand-in client."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest

from isai.errors import ExitCode
from isai.worker.errors import CODES, JobError, code_for_exit, messages
from isai.worker.ports import Summary
from isai.worker.supabase_impl import (
    SettingsError,
    SupabaseJobQueue,
    SupabaseObjectStore,
    load_settings,
    read_env_file,
)


def test_every_code_has_words_for_the_learner() -> None:
    words = messages()
    assert set(words) == set(CODES)
    for entry in words.values():
        assert entry["message"] and entry["next"]
        assert "!" not in entry["message"]  # STYLE_GUIDE §7: no exclamation marks in errors


def test_exit_codes_map_to_job_codes() -> None:
    assert code_for_exit(ExitCode.DECODE_FAILED) == "decode_failed"
    assert code_for_exit(ExitCode.USAGE) == "unsupported_type"
    assert code_for_exit(ExitCode.INVALID_SONG) == "internal"
    assert code_for_exit(99) == "internal"


def test_unknown_codes_are_refused() -> None:
    with pytest.raises(ValueError):
        JobError("oops")


def test_settings_come_from_env_then_file(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        '# comment\nISAI_SUPABASE_URL="http://file"\nISAI_SUPABASE_SERVICE_KEY=k\n\nnoise\n'
    )
    assert read_env_file(env_file)["ISAI_SUPABASE_URL"] == "http://file"
    s = load_settings({"ISAI_SUPABASE_URL": "http://env", "ISAI_WORKER_ID": "pc"}, env_file)
    assert (s.url, s.service_key, s.worker_id) == ("http://env", "k", "pc")
    assert load_settings({}, env_file).worker_id  # hostname-pid by default
    with pytest.raises(SettingsError):
        load_settings({}, tmp_path / "missing.env")


class Response:
    def __init__(self, data: Any) -> None:
        self.data = data

    def execute(self) -> Response:
        return self


class Client:
    def __init__(self, rpc_data: dict[str, Any]) -> None:
        self.rpc_data = rpc_data
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.storage = Storage()

    def rpc(self, name: str, params: dict[str, Any]) -> Response:
        self.calls.append((name, params))
        return Response(self.rpc_data.get(name))


class Bucket:
    def __init__(self, tree: dict[str, list[dict[str, Any]]]) -> None:
        self.tree = tree
        self.removed: list[str] = []

    def list(self, prefix: str, options: dict[str, Any]) -> list[dict[str, Any]]:
        return self.tree.get(prefix, []) if options["offset"] == 0 else []

    def download(self, path: str) -> bytes:
        if path == "missing":
            raise RuntimeError("Object not found (404)")
        return b"audio"

    def remove(self, paths: list[str]) -> None:
        self.removed += paths


class Storage:
    def __init__(self) -> None:
        self.bucket = Bucket(
            {
                "": [{"name": "user-1", "id": None}, {"name": "loose.mp3", "id": "1",
                      "created_at": "2026-11-14T10:00:00Z"}],
                "user-1": [{"name": "job.mp3", "id": "2",
                            "created_at": "2026-11-15T10:00:00+00:00"}],
            }
        )  # fmt: skip

    def from_(self, bucket: str) -> Bucket:
        return self.bucket


def test_claim_maps_the_row() -> None:
    row = {"job_id": "j", "song_id": "s", "owner_id": "o", "upload_path": "o/j.mp3",
           "attempts": 1, "title": "T", "source_type": "full-mix", "level": "easy"}  # fmt: skip
    client = Client({"claim_job": [row], "finish_job": True})
    queue = SupabaseJobQueue(client)
    claimed = queue.claim("w", 120)
    assert claimed is not None and claimed.level == "easy"
    assert client.calls[0] == ("claim_job", {"p_worker_id": "w", "p_lease_sec": 120})
    summary = Summary("1.1.0", "0.1.0", "D", "minor", 120.0, 200.0, "a", "b")
    assert queue.finish("j", "w", summary) is True
    assert client.calls[-1][1]["p_summary"]["songPath"] == "a"
    assert SupabaseJobQueue(Client({"claim_job": []})).claim("w", 1) is None
    assert queue.renew("j", "w", 1) is False  # no data: the lease is gone


def test_storage_lists_one_folder_deep_and_maps_not_found(tmp_path: Path) -> None:
    store = SupabaseObjectStore(Client({}))
    listed = {o.path: o.created_at for o in store.list_all("uploads")}
    assert listed == {
        "user-1/job.mp3": datetime(2026, 11, 15, 10, tzinfo=UTC),
        "loose.mp3": datetime(2026, 11, 14, 10, tzinfo=UTC),
    }
    store.download("uploads", "x", tmp_path / "a")
    assert (tmp_path / "a").read_bytes() == b"audio"
    with pytest.raises(FileNotFoundError):
        store.download("uploads", "missing", tmp_path / "b")
    store.delete("uploads", [])
    store.delete("uploads", ["p"])
    assert store.client.storage.bucket.removed == ["p"]
