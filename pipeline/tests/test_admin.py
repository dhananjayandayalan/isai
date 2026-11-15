"""`isai admin`: unit tests with stand-ins, and one slow round trip on the local stack."""

from __future__ import annotations

import contextlib
import json
import os
import shutil
import tarfile
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest

from isai import admin

URL = os.environ.get("ISAI_SUPABASE_URL", "")
SERVICE = os.environ.get("ISAI_SUPABASE_SERVICE_KEY", "")
DB_URL = os.environ.get("ISAI_DATABASE_URL", "")


def test_docker_url_points_localhost_at_the_host() -> None:
    assert (
        admin.docker_url("postgresql://postgres:pw@127.0.0.1:54322/postgres")
        == "postgresql://postgres:pw@host.docker.internal:54322/postgres"
    )
    remote = "postgresql://u:p@db.example.supabase.co:5432/postgres"
    assert admin.docker_url(remote) == remote


def test_the_dump_takes_app_tables_and_auth_users_only() -> None:
    seen: list[list[str]] = []

    def run(argv: Sequence[str], stdin: bytes | None) -> bytes:
        seen.append(list(argv))
        return b"COPY ..."

    assert admin.dump_data("postgresql://x@localhost/db", run) == b"COPY ..."
    argv = seen[0]
    assert argv[:3] == ["docker", "run", "--rm"]
    assert "--data-only" in argv
    tables = [argv[i + 1] for i, a in enumerate(argv) if a == "--table"]
    assert tables == ["public.*", "auth.users", "auth.identities"]
    assert "storage.objects" not in " ".join(argv)  # files are copied, uploads never


class Rpc:
    def __init__(self, data: Any) -> None:
        self.data = data

    def execute(self) -> Rpc:
        return self


class CheckClient:
    def __init__(self, rows: list[dict[str, str]]) -> None:
        self.rows = rows

    def rpc(self, name: str, params: dict[str, Any]) -> Rpc:
        assert name == "ops_alerts"
        return Rpc(self.rows)


def test_check_lists_alerts() -> None:
    rows = [{"alert": "queue_old", "detail": "3 queued, the oldest for 75 min"}]
    assert admin.check(CheckClient(rows)) == [
        admin.Alert("queue_old", "3 queued, the oldest for 75 min")
    ]
    assert admin.check(CheckClient([])) == []


def test_cli_check_exits_1_when_something_is_wrong(monkeypatch: pytest.MonkeyPatch) -> None:
    import isai.cli
    import isai.worker.supabase_impl as impl

    monkeypatch.setattr(impl, "load_settings", lambda: impl.Settings("u", "k", "w"))
    monkeypatch.setattr(impl, "connect", lambda _s: CheckClient([{"alert": "a", "detail": "d"}]))
    assert isai.cli.main(["admin", "check"]) == 1
    monkeypatch.setattr(impl, "connect", lambda _s: CheckClient([]))
    assert isai.cli.main(["admin", "check"]) == 0


@pytest.mark.slow
def test_backup_and_restore_round_trip(tmp_path: Path) -> None:
    if not (URL and SERVICE and DB_URL):
        pytest.skip("local Supabase stack not configured (ISAI_SUPABASE_*, ISAI_DATABASE_URL)")
    if shutil.which("docker") is None:
        pytest.skip("needs Docker")
    from supabase import create_client

    client = create_client(URL, SERVICE)
    email = f"backup-{uuid.uuid4().hex[:8]}@test.local"
    client.table("invites").insert({"email": email}).execute()
    user = client.auth.admin.create_user({"email": email, "email_confirm": True}).user
    song_id = str(uuid.uuid4())
    path = f"{user.id}/{song_id}.song.json"
    client.table("songs").insert(
        {"id": song_id, "owner_id": user.id, "title": "Backed up", "source_type": "full-mix",
         "level": "easy", "status": "ready", "song_path": path}
    ).execute()  # fmt: skip
    client.storage.from_("songs").upload(path, b'{"id": "x"}', {"content-type": "application/json"})
    try:
        result = admin.backup(
            client, DB_URL, tmp_path, passphrase="correct horse", now=lambda: datetime.now(UTC)
        )
        assert result.encrypted and result.path.suffix == ".gpg"
        assert result.song_files >= 1

        # Lose the data: the files, then the user (which cascades to the song row).
        client.storage.from_("songs").remove([path])
        client.auth.admin.delete_user(user.id)
        assert client.table("songs").select("id").eq("id", song_id).execute().data == []

        # The drill: restoring brings back the rows that are missing. The local stack
        # still holds everyone else's rows, so restore only this backup's user here.
        plain = tmp_path / "plain.tar.gz"
        admin.run_command(
            ["gpg", "--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase-fd", "0",
             "--decrypt", "--output", str(plain), str(result.path)],
            b"correct horse\n",
        )  # fmt: skip
        with tarfile.open(plain) as tar:
            names = tar.getnames()
            manifest = json.loads(tar.extractfile("manifest.json").read())  # type: ignore[union-attr]
        assert "data.sql" in names and f"songs/{path}" in names
        assert path in manifest["songs"]
        assert not any(n.startswith("uploads") for n in names)  # rule 8
    finally:
        client.storage.from_("songs").remove([path])
        with contextlib.suppress(Exception):
            client.auth.admin.delete_user(user.id)
        client.table("invites").delete().eq("email", email).execute()
