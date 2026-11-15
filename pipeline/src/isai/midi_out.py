"""A standard MIDI file for a Song: tempo map, time signature, key signature, both hands.

Type 1, 480 ticks per quarter note. Track 0 holds the meta events and a tempo change at
every beat, so each beat is exactly one quarter note and a DAW's bar lines follow the
song, rubato included. Tracks 1 and 2 hold the right and left hand.
"""

from __future__ import annotations

import io
import itertools
from bisect import bisect_right
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import mido  # pyright: ignore[reportMissingTypeStubs]

TICKS_PER_BEAT = 480
DEFAULT_BPM = 120.0


@dataclass(frozen=True)
class MidiNote:
    start: float
    end: float
    midi: int
    velocity: int
    hand: str


class TempoMap:
    """Seconds to ticks, one quarter note per beat (the first beat's tempo before it)."""

    def __init__(self, beats: Sequence[float], bpm: float) -> None:
        clean = sorted({round(b, 6) for b in beats if b >= 0})
        self.beats = clean
        fallback = 60.0 / (bpm if bpm > 0 else DEFAULT_BPM)
        gaps = [b - a for a, b in itertools.pairwise(clean)]
        self.first_gap = gaps[0] if gaps else fallback
        self.last_gap = gaps[-1] if gaps else fallback
        self.lead_ticks = round(clean[0] / self.first_gap * TICKS_PER_BEAT) if clean else 0

    def ticks(self, seconds: float) -> int:
        beats = self.beats
        if not beats or seconds <= beats[0]:
            return round(seconds / self.first_gap * TICKS_PER_BEAT)
        index = bisect_right(beats, seconds) - 1
        if index >= len(beats) - 1:
            return (
                self.lead_ticks
                + index * TICKS_PER_BEAT
                + round((seconds - beats[-1]) / self.last_gap * TICKS_PER_BEAT)
            )
        span = beats[index + 1] - beats[index]
        return (
            self.lead_ticks
            + index * TICKS_PER_BEAT
            + round((seconds - beats[index]) / span * TICKS_PER_BEAT)
        )

    def tempo_changes(self) -> list[tuple[int, int]]:
        """(tick, microseconds per quarter note) at the start and at every beat."""
        changes = [(0, round(self.first_gap * 1e6))]
        for i, (a, b) in enumerate(itertools.pairwise(self.beats)):
            changes.append((self.lead_ticks + i * TICKS_PER_BEAT, round((b - a) * 1e6)))
        return changes


def _key_signature(key: str, mode: str) -> str:
    # mido spells minor keys with an "m"; a modal key is written as its tonic's major key.
    return f"{key}m" if mode == "minor" else key


def _track(name: str, events: list[tuple[int, Any]]) -> Any:
    track = mido.MidiTrack()  # pyright: ignore[reportUnknownMemberType]
    track.append(mido.MetaMessage("track_name", name=name, time=0))  # pyright: ignore[reportUnknownMemberType]
    now = 0
    # Note-offs before note-ons at the same tick, then by pitch: a stable order.
    for tick, message in sorted(
        events, key=lambda e: (e[0], e[1].type != "note_off", e[1].dict().get("note", 0))
    ):
        track.append(message.copy(time=tick - now))  # pyright: ignore[reportUnknownMemberType]
        now = tick
    track.append(mido.MetaMessage("end_of_track", time=0))  # pyright: ignore[reportUnknownMemberType]
    return track


def song_midi(
    *,
    beats: Sequence[float],
    bpm: float,
    beats_per_bar: int,
    key: str,
    mode: str,
    notes: Sequence[MidiNote] = (),
    chords: Sequence[tuple[float, str]] = (),
) -> bytes:
    """The MIDI file as bytes. The same input always gives the same bytes.

    `chords` (start in seconds, label) become marker events on track 0, so a DAW shows
    the chord names above the bars.
    """
    tempo = TempoMap(beats, bpm)
    meta: list[tuple[int, Any]] = [
        (0, mido.MetaMessage("time_signature", numerator=beats_per_bar, denominator=4, time=0)),  # pyright: ignore[reportUnknownMemberType]
        (0, mido.MetaMessage("key_signature", key=_key_signature(key, mode), time=0)),  # pyright: ignore[reportUnknownMemberType]
    ]
    for tick, micros in tempo.tempo_changes():
        meta.append((tick, mido.MetaMessage("set_tempo", tempo=micros, time=0)))  # pyright: ignore[reportUnknownMemberType]
    for start, text in chords:
        meta.append((tempo.ticks(start), mido.MetaMessage("marker", text=text, time=0)))  # pyright: ignore[reportUnknownMemberType]
    hands: dict[str, list[tuple[int, Any]]] = {"right": [], "left": []}
    for note in notes:
        channel = 0 if note.hand == "right" else 1
        on = tempo.ticks(note.start)
        off = max(on + 1, tempo.ticks(note.end))
        hands[note.hand].append(
            (
                on,
                mido.Message(
                    "note_on", note=note.midi, velocity=note.velocity, channel=channel, time=0
                ),
            )
        )  # pyright: ignore[reportUnknownMemberType]
        hands[note.hand].append(
            (off, mido.Message("note_off", note=note.midi, velocity=0, channel=channel, time=0))
        )  # pyright: ignore[reportUnknownMemberType]
    midi = mido.MidiFile(type=1, ticks_per_beat=TICKS_PER_BEAT)  # pyright: ignore[reportUnknownMemberType]
    tempo_track = mido.MidiTrack()  # pyright: ignore[reportUnknownMemberType]
    now = 0
    for tick, message in sorted(meta, key=lambda e: e[0]):
        tempo_track.append(message.copy(time=tick - now))  # pyright: ignore[reportUnknownMemberType]
        now = tick
    tempo_track.append(mido.MetaMessage("end_of_track", time=0))  # pyright: ignore[reportUnknownMemberType]
    midi.tracks.append(tempo_track)  # pyright: ignore[reportUnknownMemberType]
    midi.tracks.append(_track("Right hand", hands["right"]))  # pyright: ignore[reportUnknownMemberType]
    midi.tracks.append(_track("Left hand", hands["left"]))  # pyright: ignore[reportUnknownMemberType]
    buffer = io.BytesIO()
    midi.save(file=buffer)  # pyright: ignore[reportUnknownMemberType]
    return buffer.getvalue()
