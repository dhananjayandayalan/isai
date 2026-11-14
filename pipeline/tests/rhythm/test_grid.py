import pytest

from isai.rhythm.derive import filled_downbeats, filled_grid


def test_holes_are_filled_evenly_and_the_ends_extended() -> None:
    beats = [1.0, 1.5, 2.0, 3.5, 4.0]  # two beats missing between 2.0 and 3.5
    assert filled_grid(beats, 5.0) == [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5]


def test_a_steady_grid_is_left_alone_and_tiny_inputs_pass_through() -> None:
    steady = [0.0, 0.5, 1.0, 1.5]
    assert filled_grid(steady, 2.0) == steady
    assert filled_grid([1.0], 5.0) == [1.0]
    assert filled_grid([], 5.0) == []


def test_an_outro_without_beats_is_carried_on() -> None:
    grid = filled_grid([0.0, 0.5, 1.0], 3.0)
    assert grid[-1] == pytest.approx(2.5) and len(grid) == 6


def test_bar_starts_carry_on_past_the_detected_ones() -> None:
    grid = [i * 0.5 for i in range(12)]
    assert filled_downbeats(grid, [1.0, 3.0], 4) == [1.0, 3.0, 5.0]  # 4 beats before 1.0 is < 0
    assert filled_downbeats(grid, [2.0], 4) == [0.0, 2.0, 4.0]
    assert filled_downbeats(grid, [], 4) == [0.0, 2.0, 4.0]
    assert filled_downbeats([], [1.0], 4) == []
