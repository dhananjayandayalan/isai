import pytest

from isai.transcribe.piano_post import clean_piano
from isai.transcribe.types import PedalSpan, TNote


def test_the_pedal_extends_a_note_to_its_release() -> None:
    notes = [TNote(0.0, 0.5, 60, 80)]
    assert clean_piano(notes, [PedalSpan(0.2, 2.0)]) == [TNote(0.0, 2.0, 60, 80)]
    # A note that ends after the pedal lifted keeps its own end.
    assert clean_piano(notes, [PedalSpan(0.0, 0.3)]) == [TNote(0.0, 0.5, 60, 80)]


def test_the_pedal_stops_at_the_next_strike_of_the_same_key() -> None:
    notes = [TNote(0.0, 0.4, 60, 80), TNote(1.0, 1.4, 60, 70), TNote(0.5, 0.9, 64, 70)]
    cleaned = clean_piano(notes, [PedalSpan(0.0, 3.0)])
    assert cleaned == [
        TNote(0.0, 1.0, 60, 80),  # capped at the next C
        TNote(0.5, 3.0, 64, 70),  # E rings to the release
        TNote(1.0, 3.0, 60, 70),
    ]


def test_blips_are_dropped_even_under_the_pedal() -> None:
    notes = [TNote(0.0, 0.02, 72, 90), TNote(0.0, 0.5, 60, 80)]
    assert clean_piano(notes, [PedalSpan(0.0, 2.0)]) == [TNote(0.0, 2.0, 60, 80)]


def test_velocities_are_clamped() -> None:
    notes = [TNote(0.0, 0.5, 60, 0), TNote(1.0, 1.5, 62, 200)]
    assert [n.velocity for n in clean_piano(notes)] == [1, 127]


def test_a_double_strike_is_one_note_keeping_the_louder() -> None:
    notes = [TNote(0.0, 0.3, 60, 50), TNote(0.01, 0.6, 60, 90)]
    assert clean_piano(notes) == [TNote(0.0, 0.6, 60, 90)]


def test_overlapping_notes_on_one_key_are_cut_at_the_next_onset() -> None:
    notes = [TNote(0.0, 1.0, 60, 80), TNote(0.5, 1.2, 60, 80)]
    assert clean_piano(notes) == [TNote(0.0, 0.5, 60, 80), TNote(0.5, 1.2, 60, 80)]


def test_times_are_rounded_and_the_output_is_sorted() -> None:
    notes = [TNote(1.00049, 1.5, 64, 80), TNote(0.12345, 0.6, 60, 80)]
    cleaned = clean_piano(notes)
    assert [n.midi for n in cleaned] == [60, 64]
    assert cleaned[0].start == pytest.approx(0.123)
    assert cleaned[1].start == pytest.approx(1.0)


def test_nothing_in_nothing_out() -> None:
    assert clean_piano([]) == []
