"""Finished Songs in the songs bucket, over any ObjectStore."""

from __future__ import annotations

import json
from typing import Any

from isai.worker.ports import SONGS, ObjectStore


class StoreSongRepository:
    """Songs kept as `{owner}/{song}.song.json` and `{owner}/{song}.mid` in the songs bucket."""

    def __init__(self, store: ObjectStore) -> None:
        self.store = store

    def save(
        self, owner_id: str, song_id: str, song: dict[str, Any], midi: bytes
    ) -> tuple[str, str]:
        song_path = f"{owner_id}/{song_id}.song.json"
        midi_path = f"{owner_id}/{song_id}.mid"
        body = (json.dumps(song, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
        self.store.upload(SONGS, song_path, body, "application/json")
        self.store.upload(SONGS, midi_path, midi, "audio/midi")
        return song_path, midi_path

    def delete(self, paths: list[str]) -> None:
        self.store.delete(SONGS, paths)
