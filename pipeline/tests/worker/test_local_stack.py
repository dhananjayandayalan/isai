"""One job end to end against the local Supabase stack, with the real pipeline.

Needs `pnpm --dir web db:start` and, from `pnpm --dir web db:status`:
ISAI_SUPABASE_URL, ISAI_SUPABASE_SERVICE_KEY and ISAI_SUPABASE_ANON_KEY. Skipped otherwise.
"""

from __future__ import annotations

import io
import json
import os
import uuid
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
import soundfile as sf

from isai.schema import validate_song
from isai.worker.analyser import SubprocessAnalyser
from isai.worker.loop import Worker, WorkerConfig
from isai.worker.ports import UPLOADS
from isai.worker.repository import StoreSongRepository
from isai.worker.supabase_impl import SupabaseJobQueue, SupabaseObjectStore

pytestmark = pytest.mark.slow

URL = os.environ.get("ISAI_SUPABASE_URL", "")
SERVICE = os.environ.get("ISAI_SUPABASE_SERVICE_KEY", "")
ANON = os.environ.get("ISAI_SUPABASE_ANON_KEY", "")


def melody_wav() -> bytes:
    """Eight seconds of a sung-like line: sine tones on a C major scale, 120 BPM."""
    rate = 22_050
    notes = [60, 62, 64, 65, 67, 65, 64, 62, 60, 64, 67, 72, 67, 64, 62, 60]
    parts = []
    for midi in notes:
        t = np.arange(int(rate * 0.5)) / rate
        f = 440.0 * 2 ** ((midi - 69) / 12)
        envelope = np.minimum(1.0, np.minimum(t / 0.02, (0.5 - t) / 0.05))
        parts.append(0.4 * np.sin(2 * np.pi * f * t) * envelope)
    buf = io.BytesIO()
    sf.write(buf, np.concatenate(parts).astype(np.float32), rate, format="WAV")
    return buf.getvalue()


@pytest.fixture
def clients() -> Iterator[tuple[Any, Any, str]]:
    if not (URL and SERVICE and ANON):
        pytest.skip("local Supabase stack not configured")
    from supabase import create_client

    admin = create_client(URL, SERVICE)
    email = f"worker-e2e-{uuid.uuid4().hex[:8]}@test.local"
    password = uuid.uuid4().hex
    admin.table("invites").insert({"email": email}).execute()
    created = admin.auth.admin.create_user(
        {"email": email, "password": password, "email_confirm": True}
    )
    user_id = created.user.id
    user = create_client(URL, ANON)
    user.auth.sign_in_with_password({"email": email, "password": password})
    try:
        yield admin, user, user_id
    finally:
        songs = admin.storage.from_("songs")
        paths = [f"{user_id}/{o['name']}" for o in songs.list(user_id)]
        if paths:
            songs.remove(paths)
        admin.auth.admin.delete_user(user_id)
        admin.table("invites").delete().eq("email", email).execute()


def test_upload_to_song(clients: tuple[Any, Any, str]) -> None:
    admin, user, user_id = clients
    row = (
        user.rpc(
            "create_upload",
            {
                "p_title": "Scale",
                "p_source_type": "a-cappella",
                "p_level": "medium",
                "p_ext": "wav",
            },
        )
        .execute()
        .data[0]
    )
    user.storage.from_(UPLOADS).upload(
        row["upload_path"], melody_wav(), {"content-type": "audio/wav"}
    )
    user.rpc("submit_job", {"p_job_id": row["job_id"]}).execute()

    store = SupabaseObjectStore(admin)
    worker = Worker(
        SupabaseJobQueue(admin),
        store,
        StoreSongRepository(store),
        SubprocessAnalyser(),
        WorkerConfig(worker_id="e2e-test"),
    )
    assert worker.sweep() == []  # real storage listing parses; nothing is a day old
    assert worker.run(once=True) == 1

    job = user.table("jobs").select("*").eq("id", row["job_id"]).single().execute().data
    assert job["status"] == "succeeded", job
    assert job["timings"].get("melody", 0) >= 0
    song_row = user.table("songs").select("*").eq("id", row["song_id"]).single().execute().data
    assert song_row["status"] == "ready"
    assert song_row["song_path"] == f"{user_id}/{row['song_id']}.song.json"
    song = json.loads(user.storage.from_("songs").download(song_row["song_path"]))
    validate_song(song)
    assert song["id"] == row["song_id"] and song["title"] == "Scale"
    # Rule 8: the upload is gone.
    assert admin.storage.from_(UPLOADS).list(user_id) == []
