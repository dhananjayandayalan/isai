import io

import mido  # pyright: ignore[reportMissingTypeStubs]
import pytest

from isai.midi_out import TICKS_PER_BEAT, MidiNote, TempoMap, song_midi


def read(data: bytes) -> mido.MidiFile:
    return mido.MidiFile(file=io.BytesIO(data))


def test_writes_the_time_signature_key_signature_and_both_hands() -> None:
    midi = read(
        song_midi(beats=[0.5, 1.0, 1.5, 2.0], bpm=120, beats_per_bar=3, key="Bb", mode="minor")
    )
    assert midi.type == 1 and midi.ticks_per_beat == TICKS_PER_BEAT
    meta = {m.type: m for m in midi.tracks[0] if m.is_meta}
    assert (meta["time_signature"].numerator, meta["time_signature"].denominator) == (3, 4)
    assert meta["key_signature"].key == "Bbm"
    assert [t.name for t in midi.tracks[1:]] == ["Right hand", "Left hand"]
    major = read(song_midi(beats=[], bpm=90, beats_per_bar=4, key="F#", mode="modal"))
    assert {m.type: m for m in major.tracks[0] if m.is_meta}["key_signature"].key == "F#"


def test_puts_a_tempo_change_on_every_beat_so_rubato_lines_up() -> None:
    beats = [0.5, 1.0, 1.6, 2.0, 2.7]
    midi = read(song_midi(beats=beats, bpm=100, beats_per_bar=4, key="C", mode="major"))
    tempos = [m.tempo for m in midi.tracks[0] if m.type == "set_tempo"]
    # The lead-in at the first interval's tempo, then one per beat interval.
    assert tempos == [500_000, 500_000, 600_000, 400_000, 700_000]
    tempo_map = TempoMap(beats, 100)
    assert [tempo_map.ticks(b) for b in beats] == [480, 960, 1440, 1920, 2400]


def test_maps_seconds_to_ticks_between_and_beyond_the_beats() -> None:
    tempo_map = TempoMap([1.0, 2.0, 3.0], 60)
    assert tempo_map.ticks(0.0) == 0
    assert tempo_map.ticks(0.5) == 240  # before the first beat, at the first interval's tempo
    assert tempo_map.ticks(1.5) == 720
    assert tempo_map.ticks(3.5) == 1680  # after the last beat, at the last interval's tempo
    no_beats = TempoMap([], 120)
    assert no_beats.ticks(1.0) == 960
    assert TempoMap([], 0).ticks(0.5) == 480  # a broken bpm falls back to 120


def test_writes_notes_on_each_hand_in_a_stable_order() -> None:
    notes = [
        MidiNote(start=1.0, end=1.5, midi=67, velocity=90, hand="right"),
        MidiNote(start=1.0, end=2.0, midi=43, velocity=70, hand="left"),
        MidiNote(start=1.5, end=1.5, midi=69, velocity=80, hand="right"),  # zero length: one tick
    ]
    data = song_midi(
        beats=[1.0, 1.5, 2.0], bpm=120, beats_per_bar=4, key="G", mode="major", notes=notes
    )
    midi = read(data)
    right = [m for m in midi.tracks[1] if not m.is_meta]
    assert [(m.type, m.note, m.channel) for m in right] == [
        ("note_on", 67, 0),
        ("note_off", 67, 0),
        ("note_on", 69, 0),
        ("note_off", 69, 0),
    ]
    assert right[3].time >= 1
    left = [m for m in midi.tracks[2] if not m.is_meta]
    assert [(m.type, m.note, m.channel) for m in left] == [("note_on", 43, 1), ("note_off", 43, 1)]
    # The same notes in another order give the same bytes.
    again = song_midi(
        beats=[1.0, 1.5, 2.0], bpm=120, beats_per_bar=4, key="G", mode="major", notes=notes[::-1]
    )
    assert again == data


def test_the_beats_are_heard_where_the_song_has_them() -> None:
    beats = [0.25, 0.75, 1.35, 1.9, 2.6, 3.1]
    midi = read(song_midi(beats=beats, bpm=100, beats_per_bar=4, key="C", mode="major"))
    seconds, tick, tempo = 0.0, 0, None
    heard: dict[int, float] = {}
    for message in midi.tracks[0]:
        if tempo is not None:
            seconds += mido.tick2second(message.time, TICKS_PER_BEAT, tempo)
        tick += message.time
        if message.type == "set_tempo":
            heard[tick] = seconds
            tempo = message.tempo
    # Each beat but the last starts a tempo change; walking the map lands on its time.
    tempo_map = TempoMap(beats, 100)
    for beat in beats[:-1]:
        assert heard[tempo_map.ticks(beat)] == pytest.approx(beat, abs=1e-3)
    assert tempo_map.ticks(beats[0]) == 240  # half a beat of lead-in before the first beat
