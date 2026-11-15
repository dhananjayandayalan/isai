// What the piano needs from the practice engine (ADR 0005): the keys to light and the
// right and wrong marks. Kept apart from the engine so drawing code depends only on this.

import type { Hand } from '../activeNotes';

// Per-key flags for the piano (`PracticeView.keys`).
export const KEY_EXPECT_RIGHT = 1;
export const KEY_EXPECT_LEFT = 2;
export const KEY_NEXT_RIGHT = 4;
export const KEY_NEXT_LEFT = 8;
export const FLASH_CORRECT = 1;
export const FLASH_WRONG = 2;
/** How long a correct or wrong mark stays on a key. */
export const FLASH_SECONDS = 0.35;

/**
 * What the piano draws for practice, read every animation frame. Nothing here is React
 * state: `revision` goes up whenever the arrays change, so the piano knows to redraw.
 */
export interface PracticeView {
  readonly revision: number;
  /** KEY_* flags for each MIDI note: the step to play now, and the one after. */
  readonly keys: Uint8Array;
  /** FLASH_* for each MIDI note, shown until `flashUntil` (audio-clock seconds). */
  readonly flashKind: Uint8Array;
  readonly flashUntil: Float64Array;
  /** Song notes of this hand are drawn dimmed (the hand not being practised). */
  readonly dimHand: Hand | null;
  /** The audio clock, to time the flashes. */
  now(): number;
}
