// Which song notes are sounding at a given song time. Called every animation frame by
// the keyboard (rule 5), so it does a binary search instead of scanning every note.

import type { Note } from '../song';

export type Hand = Note['hand'];

export interface ActiveNote {
  midi: number;
  hand: Hand;
}

export interface NoteIndex {
  /** Notes sorted by start (stable). */
  readonly notes: readonly Note[];
  /** `maxEnd[i]` is the latest end among notes[0..i]. */
  readonly maxEnd: Float64Array;
}

export function buildNoteIndex(notes: readonly Note[]): NoteIndex {
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const maxEnd = new Float64Array(sorted.length);
  let latest = -Infinity;
  sorted.forEach((note, i) => {
    latest = Math.max(latest, note.end);
    maxEnd[i] = latest;
  });
  return { notes: sorted, maxEnd };
}

/** Index of the first note that starts after `t`. */
function firstStartAfter(notes: readonly Note[], t: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((notes[mid]?.start ?? Infinity) <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Notes with `start <= t < end`. Pass `out` to reuse one array across frames; it is
 * cleared first. Walks back from the last note that has started and stops as soon as no
 * earlier note can still be sounding.
 */
export function activeNotesAt(index: NoteIndex, t: number, out: ActiveNote[] = []): ActiveNote[] {
  out.length = 0;
  const { notes, maxEnd } = index;
  for (let i = firstStartAfter(notes, t) - 1; i >= 0 && (maxEnd[i] ?? -Infinity) > t; i--) {
    const note = notes[i];
    if (note && note.end > t) out.push({ midi: note.midi, hand: note.hand });
  }
  return out;
}
