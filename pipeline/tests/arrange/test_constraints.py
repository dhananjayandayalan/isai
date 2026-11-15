from isai.arrange.constraints import ANote, check, fix

S = 0.125  # a sixteenth at 120 BPM


def rules(notes: list[ANote]) -> list[str]:
    return [v.rule for v in check(notes, S)]


def r(start: float, end: float, midi: int) -> ANote:
    return ANote(start, end, midi, 80, "right")


def left(start: float, end: float, midi: int) -> ANote:
    return ANote(start, end, midi, 70, "left")


def test_a_clean_arrangement_has_no_violations() -> None:
    notes = [r(0, 0.5, 72), r(0.5, 1, 74), left(0, 1, 48), left(0, 1, 52), left(0, 1, 55)]
    assert check(notes, S) == []


def test_each_rule_is_reported() -> None:
    assert rules([r(0, 1, 110)]) == ["range"]
    assert rules([r(0, 0.05, 72)]) == ["short"]
    assert rules([r(0, 1, 72), r(0.5, 1.5, 72)]) == ["same-key"]
    assert rules([left(0, 1, 36), left(0, 1, 52)]) == ["span"]
    assert rules([left(0, 1, p) for p in (48, 50, 52, 53, 55)]) == ["crowd"]
    assert rules([r(0, 1, 60), left(0, 1, 59)]) == ["overlap"]


def test_the_fixer_drops_the_left_hand_an_octave_first() -> None:
    fixed = fix([r(0, 1, 62), left(0, 1, 52), left(0, 1, 55), left(0, 1, 61)], S)
    assert check(fixed, S) == []
    assert sorted(n.midi for n in fixed if n.hand == "left") == [40, 43, 49]
    assert [n.midi for n in fixed if n.hand == "right"] == [62]


def test_the_fixer_moves_the_right_hand_up_when_the_left_cant_go_lower() -> None:
    fixed = fix([r(0, 1, 26), left(0, 1, 25)], S)
    assert check(fixed, S) == []
    assert {(n.hand, n.midi) for n in fixed} == {("left", 25), ("right", 38)}


def test_the_fixer_drops_left_notes_as_a_last_resort() -> None:
    fixed = fix([r(0, 1, 104), r(0, 1, 100), left(0, 1, 25), left(0, 1, 101)], S)
    assert check(fixed, S) == []
    assert all(n.midi != 101 for n in fixed)


def test_the_fixer_thins_crowded_and_wide_hands() -> None:
    crowded = fix([left(0, 1, p) for p in (48, 50, 52, 53, 55)], S)
    assert check(crowded, S) == [] and len(crowded) == 4
    wide_left = fix([left(0, 1, 36), left(0, 1, 52)], S)
    assert [n.midi for n in wide_left] == [36]  # keeps the bass
    wide_right = fix([r(0, 1, 60), r(0, 1, 80)], S)
    assert [n.midi for n in wide_right] == [80]  # keeps the melody


def test_the_fixer_mends_keys_lengths_and_range() -> None:
    fixed = fix(
        [
            r(0, 0.05, 72),
            r(1, 2, 72),
            r(1.5, 2.5, 72),
            r(3, 4, 112),
            r(5, 5.04, 72),
            r(5.05, 6, 72),
        ],
        S,
    )
    assert check(fixed, S) == []
    assert fixed[0].end == S  # lengthened
    assert (fixed[1].start, fixed[1].end) == (1, 1.5)  # cut at the next strike
    assert any(n.midi == 100 for n in fixed)  # an octave down into range
    assert len([n for n in fixed if n.start >= 5]) == 1  # a double strike is one note
