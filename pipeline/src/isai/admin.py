"""`isai admin`: the owner's operations tools (P9, ADR 0016). Service role only.

- `check`: what's wrong right now (a job failed twice, an old queue, a silent worker, the
  rule 8 audit). Exits 1 if anything is, so a scheduled job can alert on it.
- `delete-user EMAIL`: a member's songs, files, sessions, account and invite.
- `backup --out DIR`: the database rows and the songs bucket, as one archive, encrypted
  with gpg when a passphrase is given. The uploads bucket is never backed up (rule 8).
- `restore ARCHIVE`: into an empty project with the migrations applied (the drill).

Postgres tools run from the Supabase Postgres image through Docker, so nothing needs
installing besides Docker.
"""

from __future__ import annotations

import io
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast
from urllib.parse import urlsplit, urlunsplit

from isai.worker.ports import SONGS, UPLOADS

POSTGRES_IMAGE = "public.ecr.aws/supabase/postgres:17.11.0.018"
"""The image the local stack runs; its pg_dump and psql match the server."""

# Rows that make up the data: the app's tables plus the auth users they hang off.
DUMP_TABLES = ("public.*", "auth.users", "auth.identities")

Runner = Callable[[Sequence[str], bytes | None], bytes]
"""Runs a command with optional stdin and returns stdout (raises on failure)."""


def run_command(argv: Sequence[str], stdin: bytes | None = None) -> bytes:
    done = subprocess.run(list(argv), input=stdin, capture_output=True, check=False)
    if done.returncode != 0:
        tail = done.stderr.decode("utf-8", "replace").strip().splitlines()[-3:]
        raise RuntimeError(f"{argv[0]} failed ({done.returncode}): " + " | ".join(tail))
    return done.stdout


# -- check --------------------------------------------------------------------------------


@dataclass(frozen=True)
class Alert:
    alert: str
    detail: str


def check(client: Any) -> list[Alert]:
    rows = cast(list[dict[str, Any]], client.rpc("ops_alerts", {}).execute().data or [])
    return [Alert(str(r["alert"]), str(r["detail"])) for r in rows]


# -- delete-user --------------------------------------------------------------------------


def find_user(client: Any, email: str) -> str | None:
    page = 1
    while True:
        users = cast(list[Any], client.auth.admin.list_users(page=page, per_page=200))
        for user in users:
            if str(getattr(user, "email", "")).lower() == email.lower():
                return str(user.id)
        if len(users) < 200:
            return None
        page += 1


def delete_user(client: Any, email: str) -> dict[str, int]:
    """Everything of one member: files first (SQL can't delete storage), then the user."""
    user_id = find_user(client, email)
    removed = {"songs_files": 0, "uploads": 0}
    if user_id is not None:
        for bucket, key in ((SONGS, "songs_files"), (UPLOADS, "uploads")):
            files = cast(list[dict[str, Any]], client.storage.from_(bucket).list(user_id) or [])
            paths = [f"{user_id}/{f['name']}" for f in files if f.get("id") is not None]
            if paths:
                client.storage.from_(bucket).remove(paths)
            removed[key] = len(paths)
        client.auth.admin.delete_user(user_id)  # cascades to profile, songs, jobs, sessions
    client.table("invites").delete().ilike("email", email).execute()
    removed["user"] = 1 if user_id is not None else 0
    return removed


# -- backup and restore -------------------------------------------------------------------


def docker_url(db_url: str) -> str:
    """A database URL as seen from inside a container: localhost becomes the Docker host."""
    parts = urlsplit(db_url)
    host = parts.hostname or ""
    if host in ("localhost", "127.0.0.1"):
        netloc = parts.netloc.replace(host, "host.docker.internal", 1)
        return urlunsplit(parts._replace(netloc=netloc))
    return db_url


def pg_command(tool: str, db_url: str, *args: str) -> list[str]:
    return [
        "docker", "run", "--rm", "-i", "--add-host=host.docker.internal:host-gateway",
        "--entrypoint", tool, POSTGRES_IMAGE, *args, "--dbname", docker_url(db_url),
    ]  # fmt: skip


def dump_data(db_url: str, run: Runner = run_command) -> bytes:
    tables = [arg for table in DUMP_TABLES for arg in ("--table", table)]
    return run(
        pg_command(
            "pg_dump",
            db_url,
            "--data-only",
            "--no-owner",
            "--no-privileges",
            # Row by row, skipping rows already there (seeded invites in a fresh project).
            "--inserts",
            "--on-conflict-do-nothing",
            *tables,
        ),
        None,
    )


@dataclass(frozen=True)
class BackupResult:
    path: Path
    rows_bytes: int
    song_files: int
    encrypted: bool


def backup(
    client: Any,
    db_url: str,
    out_dir: Path,
    passphrase: str | None = None,
    run: Runner = run_command,
    now: Callable[[], datetime] = lambda: datetime.now(UTC),
) -> BackupResult:
    from isai.worker.supabase_impl import SupabaseObjectStore

    store = SupabaseObjectStore(client)
    rows = dump_data(db_url, run)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = now().strftime("%Y%m%dT%H%M%SZ")
    archive = out_dir / f"isai-backup-{stamp}.tar.gz"
    objects = store.list_all(SONGS)
    with (
        tempfile.TemporaryDirectory(prefix="isai-backup-") as tmp,
        tarfile.open(archive, "w:gz") as tar,
    ):
        _add(tar, "data.sql", rows)
        manifest = {"created": stamp, "tables": list(DUMP_TABLES), "songs": []}
        for obj in objects:
            local = Path(tmp) / "file"
            store.download(SONGS, obj.path, local)
            tar.add(local, arcname=f"songs/{obj.path}")
            cast(list[str], manifest["songs"]).append(obj.path)
        _add(tar, "manifest.json", json.dumps(manifest, indent=2).encode())
    encrypted = False
    if passphrase:
        target = archive.with_name(archive.name + ".gpg")
        run(
            ["gpg", "--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase-fd", "0",
             "--symmetric", "--cipher-algo", "AES256", "--output", str(target), str(archive)],
            passphrase.encode() + b"\n",
        )  # fmt: skip
        archive.unlink()
        archive, encrypted = target, True
    return BackupResult(archive, len(rows), len(objects), encrypted)


def _add(tar: tarfile.TarFile, name: str, data: bytes) -> None:
    info = tarfile.TarInfo(name)
    info.size = len(data)
    tar.addfile(info, io.BytesIO(data))


def restore(
    client: Any,
    db_url: str,
    archive: Path,
    passphrase: str | None = None,
    run: Runner = run_command,
) -> dict[str, int]:
    """Load a backup into a project that has the migrations applied and no data yet."""
    from isai.worker.supabase_impl import SupabaseObjectStore

    with tempfile.TemporaryDirectory(prefix="isai-restore-") as tmp:
        plain = Path(tmp) / "backup.tar.gz"
        if archive.suffix == ".gpg":
            run(
                ["gpg", "--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase-fd",
                 "0", "--decrypt", "--output", str(plain), str(archive)],
                (passphrase or "").encode() + b"\n",
            )  # fmt: skip
        else:
            shutil.copyfile(archive, plain)
        with tarfile.open(plain, "r:gz") as tar:
            _safe_extract(tar, Path(tmp) / "x")
        root = Path(tmp) / "x"
        # Triggers (the invite gate, profile creation) stay off while rows are copied in.
        script = b"set session_replication_role = replica;\n" + (root / "data.sql").read_bytes()
        # One transaction: a restore that fails part-way leaves nothing behind.
        psql = ("--quiet", "--single-transaction", "--set", "ON_ERROR_STOP=1")
        run(pg_command("psql", db_url, *psql), script)
        store = SupabaseObjectStore(client)
        manifest = json.loads((root / "manifest.json").read_text())
        for path in manifest["songs"]:
            data = (root / "songs" / path).read_bytes()
            kind = "application/json" if path.endswith(".json") else "audio/midi"
            store.upload(SONGS, path, data, kind)
        return {"song_files": len(manifest["songs"])}


def _safe_extract(tar: tarfile.TarFile, dest: Path) -> None:
    """Extract only plain files and folders that stay inside `dest`."""
    root = dest.resolve()
    for member in tar.getmembers():
        target = (dest / member.name).resolve()
        if not (member.isfile() or member.isdir()) or not target.is_relative_to(root):
            raise ValueError(f"unexpected entry in backup: {member.name}")
    if hasattr(tarfile, "data_filter"):
        tar.extractall(dest, filter="data")
    else:  # Python before 3.11.4; every member was checked above
        tar.extractall(dest)


def database_url() -> str:
    url = os.environ.get("ISAI_DATABASE_URL", "")
    if not url:
        from isai.worker.supabase_impl import read_env_file

        url = read_env_file(Path(".env")).get("ISAI_DATABASE_URL", "")
    if not url:
        raise ValueError("set ISAI_DATABASE_URL (the project's Postgres connection string)")
    return url
