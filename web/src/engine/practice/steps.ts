// Steps: what the learner is expected to play, and when (ADR 0005). The notes of the hand
// being practised are grouped by onset, so a chord is one step. Pure, built once per song,
// hand choice, loop and keyboard; the engine walks the list.

import type { Note } from '../../song';
import type { Hand } from '../activeNotes';

/** Which hand the learner plays. */
export type HandChoice = 'left' | 'right' | 'both';

export interface Step {
  /** Position in the list of steps. */
  index: number;
  /** Song time of the step's first onset, in seconds. */
  start: number;
  /** Expected MIDI pitches, ascending, each once. */
  pitches: number[];
  /** The hand of each pitch, in the same order. */
  hands: Hand[];
  /** Song time each pitch is struck, in the same order (a rolled chord's differ slightly). */
  starts: number[];
}

/** Lowest and highest MIDI note of a keyboard (structurally a piano `KeyRange`). */
export interface PitchRange {
  readonly low: number;
  readonly high: number;
}

export interface StepOptions {
  hands: HandChoice;
  /** Onsets this close to a step's first onset belong to it. Seconds of song time. */
  tolerance?: number;
  /** Only notes starting in [start, end) of the song (a loop). */
  range?: { start: number; end: number } | null;
  /** The learner's keyboard. Notes they have no key for are not expected. */
  playable?: PitchRange | null;
}

/** Notes struck within 35 ms of each other are one chord (ADR 0005). */
export const CHORD_TOLERANCE = 0.035;

const EPSILON = 1e-9;

export function practises(choice: HandChoice, hand: Hand): boolean {
  return choice === 'both' || choice === hand;
}

export function buildSteps(notes: readonly Note[], options: StepOptions): Step[] {
  const tolerance = options.tolerance ?? CHORD_TOLERANCE;
  const { range, playable } = options;
  const candidates = notes
    .filter(
      (n) =>
        practises(options.hands, n.hand) &&
        n.velocity > 0 && // velocity 0 is silent by MIDI convention
        (!range || (n.start >= range.start - EPSILON && n.start < range.end - EPSILON)) &&
        (!playable || (n.midi >= playable.low && n.midi <= playable.high)),
    )
    .sort((a, b) => a.start - b.start || a.midi - b.midi);

  const steps: Step[] = [];
  // When the key of each pitch comes back up, for notes already expected (or skipped
  // because the key was still down).
  const heldUntil = new Float64Array(128).fill(-Infinity);
  let open: { start: number; notes: Note[] } | null = null;

  const close = () => {
    if (!open || open.notes.length === 0) return;
    const sorted = open.notes.sort((a, b) => a.midi - b.midi);
    steps.push({
      index: steps.length,
      start: open.start,
      pitches: sorted.map((n) => n.midi),
      hands: sorted.map((n) => n.hand),
      starts: sorted.map((n) => n.start),
    });
  };

  for (const note of candidates) {
    // The key is still down from an earlier note (or the same pitch twice in one chord):
    // it can't be pressed again, so it isn't expected again.
    const stillHeld = (heldUntil[note.midi] ?? -Infinity) > note.start + EPSILON;
    heldUntil[note.midi] = Math.max(heldUntil[note.midi] ?? -Infinity, note.end);
    if (stillHeld) continue;

    if (!open || note.start - open.start > tolerance + EPSILON) {
      close();
      open = { start: note.start, notes: [] };
    }
    open.notes.push(note);
  }
  close();
  return steps;
}

/** Index of the first step starting at or after `time`; `steps.length` if none. */
export function firstStepAt(steps: readonly Step[], time: number): number {
  let lo = 0;
  let hi = steps.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((steps[mid]?.start ?? Infinity) < time - EPSILON) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
