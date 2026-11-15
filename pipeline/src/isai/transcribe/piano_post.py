"""Clean-up of a raw piano transcription. Pure: no audio, no model.

In order:
1. Velocities clamped to 1-127, times rounded to the millisecond.
2. Notes shorter than `MIN_NOTE_SEC` dropped. This uses the note as played, before the
   pedal stretches it, so the pedal can't rescue a spurious blip.
3. Duplicates removed: the same key struck again within `DUPLICATE_SEC` is one note
   (the louder, longer one survives).
4. Under the sustain pedal a note rings until the pedal lifts, so its end moves to the
   release of the pedal span it ends in.
5. A key can't sound twice at once: every end is capped at the next onset of the same
   key.
"""

from __future__ import annotations

from collections.abc import Sequence

from isai.transcribe.types import PedalSpan, TNote

MIN_NOTE_SEC = 0.03
DUPLICATE_SEC = 0.03
_DECIMALS = 3


def _pedal_release(end: float, pedals: Sequence[PedalSpan]) -> float:
    for span in pedals:
        if span.start <= end < span.end:
            return span.end
    return end


def clean_piano(notes: Sequence[TNote], pedals: Sequence[PedalSpan] = ()) -> list[TNote]:
    """The cleaned notes, sorted by onset then pitch."""
    rounded = [
        TNote(
            round(n.start, _DECIMALS),
            round(n.end, _DECIMALS),
            n.midi,
            min(127, max(1, n.velocity)),
        )
        for n in notes
    ]
    played = sorted(
        (n for n in rounded if n.end - n.start >= MIN_NOTE_SEC - 1e-9),
        key=lambda n: (n.midi, n.start, -n.velocity, -n.end),
    )

    unique: list[TNote] = []
    for note in played:
        last = unique[-1] if unique else None
        if last and last.midi == note.midi and note.start - last.start < DUPLICATE_SEC:
            keep = max(last, note, key=lambda x: (x.velocity, x.end - x.start))
            unique[-1] = TNote(last.start, max(last.end, note.end), keep.midi, keep.velocity)
        else:
            unique.append(note)

    ordered = sorted(pedals, key=lambda p: p.start)
    out: list[TNote] = []
    for i, note in enumerate(unique):
        end = round(_pedal_release(note.end, ordered), _DECIMALS)
        following = unique[i + 1] if i + 1 < len(unique) else None
        if following is not None and following.midi == note.midi:
            end = min(end, following.start)
        out.append(TNote(note.start, max(end, note.start + MIN_NOTE_SEC), note.midi, note.velocity))
    return sorted(out, key=lambda n: (n.start, n.midi))
