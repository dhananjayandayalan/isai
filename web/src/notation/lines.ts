// Each hand as a line of notes, for spelling by the way the line moves. Pure.

import type { NoteIndex } from '../engine/activeNotes';
import type { Motion } from '../theory/spelling';

const EPSILON = 1e-6;

/**
 * Where each note's line goes next: towards the next note of the same hand that starts
 * later. Notes struck at the same time (a chord) are not "next" to each other, so a
 * chromatic chord tone is spelled by where the hand moves, not by its neighbour in the chord.
 */
export function motionInHand(index: NoteIndex): Motion[] {
  const motions = new Array<Motion>(index.notes.length).fill(0);
  for (const hand of ['left', 'right'] as const) {
    const order: number[] = [];
    index.notes.forEach((note, i) => {
      if (note.hand === hand) order.push(i);
    });
    // `later` walks ahead to the first note of this hand that starts after the current one.
    let later = 0;
    order.forEach((current, k) => {
      const note = index.notes[current];
      if (!note) return;
      if (later <= k) later = k + 1;
      while (later < order.length && (index.notes[order[later] ?? -1]?.start ?? Infinity) <= note.start + EPSILON) later++;
      const next = index.notes[order[later] ?? -1];
      if (next && next.midi !== note.midi) motions[current] = next.midi > note.midi ? 1 : -1;
    });
  }
  return motions;
}
