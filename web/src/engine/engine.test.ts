import { describe, expect, it } from 'vitest';
import twinkle from '../../../schema/examples/twinkle-g-major.json';
import { parseSong, type Note } from '../song';
import { activeNotesAt, buildNoteIndex, type ActiveNote } from './activeNotes';

function note(start: number, end: number, midi: number, hand: Note['hand'] = 'right', velocity = 80): Note {
  return { start, end, midi, velocity, hand, source: 'arranged' };
}

const midis = (active: ActiveNote[]) => active.map((n) => n.midi).sort((a, b) => a - b);

describe('activeNotesAt', () => {
  const index = buildNoteIndex([
    note(2, 3, 64),
    note(0, 1, 60, 'left'),
    note(0.5, 4, 48, 'left'), // long note spanning others
    note(1, 2, 62),
  ]);

  it('returns notes with start <= t < end', () => {
    expect(midis(activeNotesAt(index, 0))).toEqual([60]);
    expect(midis(activeNotesAt(index, 0.75))).toEqual([48, 60]);
    expect(midis(activeNotesAt(index, 1))).toEqual([48, 62]); // 60 ends exactly at 1
    expect(midis(activeNotesAt(index, 2.5))).toEqual([48, 64]);
    expect(midis(activeNotesAt(index, 3.99))).toEqual([48]);
    expect(activeNotesAt(index, 4)).toEqual([]);
    expect(activeNotesAt(index, -1)).toEqual([]);
  });

  it('keeps the hand of each note', () => {
    const hands = activeNotesAt(index, 0.75).map((n) => `${n.midi}:${n.hand}`).sort();
    expect(hands).toEqual(['48:left', '60:left']);
  });

  it('reuses the output array', () => {
    const out: ActiveNote[] = [{ midi: 1, hand: 'right' }];
    const result = activeNotesAt(index, 2.5, out);
    expect(result).toBe(out);
    expect(midis(out)).toEqual([48, 64]);
  });

  it('handles an empty song and a single note', () => {
    expect(activeNotesAt(buildNoteIndex([]), 0)).toEqual([]);
    const single = buildNoteIndex([note(1, 2, 72)]);
    expect(midis(activeNotesAt(single, 1.5))).toEqual([72]);
    expect(activeNotesAt(single, 2)).toEqual([]);
  });

  it('lists both of two overlapping notes on the same key', () => {
    const same = buildNoteIndex([note(0, 2, 60), note(1, 3, 60)]);
    expect(midis(activeNotesAt(same, 1.5))).toEqual([60, 60]);
    expect(midis(activeNotesAt(same, 2.5))).toEqual([60]);
  });

  it('matches a full scan on the example song', () => {
    const song = parseSong(twinkle);
    const idx = buildNoteIndex(song.notes);
    for (let t = 0; t <= song.durationSec; t += 0.05) {
      const expected = song.notes.filter((n) => n.start <= t && t < n.end).map((n) => n.midi);
      expect(midis(activeNotesAt(idx, t))).toEqual(expected.sort((a, b) => a - b));
    }
  });
});
