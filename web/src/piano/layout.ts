// Key geometry for a keyboard range. Pure; the renderer and tests share it.

import { isBlackKey } from '../theory/pitch';

export type KeyboardSize = 49 | 61 | 76 | 88;

export interface KeyRange {
  /** Lowest MIDI note on the keyboard. */
  readonly low: number;
  /** Highest MIDI note on the keyboard. */
  readonly high: number;
}

/** Standard keyboard sizes: 49 C2–C6, 61 C2–C7, 76 E1–G7, 88 A0–C8. */
export const KEYBOARD_RANGES: Readonly<Record<KeyboardSize, KeyRange>> = {
  49: { low: 36, high: 84 },
  61: { low: 36, high: 96 },
  76: { low: 28, high: 103 },
  88: { low: 21, high: 108 },
};

export const KEYBOARD_SIZES: readonly KeyboardSize[] = [49, 61, 76, 88];
export const DEFAULT_KEYBOARD_SIZE: KeyboardSize = 88;

/** Black key width as a share of a white key. */
export const BLACK_WIDTH_RATIO = 0.58;
/** Black key length as a share of the keyboard height. */
export const BLACK_HEIGHT_RATIO = 0.62;

export interface KeyRect {
  midi: number;
  black: boolean;
  x: number;
  width: number;
}

export interface KeyLayout {
  range: KeyRange;
  width: number;
  whiteWidth: number;
  whites: KeyRect[];
  blacks: KeyRect[];
  /** Key for each MIDI note (index 0-127), undefined outside the range. */
  byMidi: (KeyRect | undefined)[];
}

export function whiteKeyCount(range: KeyRange): number {
  let count = 0;
  for (let midi = range.low; midi <= range.high; midi++) if (!isBlackKey(midi)) count++;
  return count;
}

/** Lay out every key of `range` across `width` CSS pixels. The range must end on white keys. */
export function layoutKeys(range: KeyRange, width: number): KeyLayout {
  if (range.low > range.high || isBlackKey(range.low) || isBlackKey(range.high)) {
    throw new RangeError(`Keyboard range must start and end on white keys: ${range.low}-${range.high}`);
  }
  const whiteWidth = width / whiteKeyCount(range);
  const blackWidth = whiteWidth * BLACK_WIDTH_RATIO;
  const whites: KeyRect[] = [];
  const blacks: KeyRect[] = [];
  const byMidi: (KeyRect | undefined)[] = new Array<KeyRect | undefined>(128);
  for (let midi = range.low; midi <= range.high; midi++) {
    let key: KeyRect;
    if (isBlackKey(midi)) {
      // Centred on the line between the white keys either side.
      key = { midi, black: true, x: whites.length * whiteWidth - blackWidth / 2, width: blackWidth };
      blacks.push(key);
    } else {
      key = { midi, black: false, x: whites.length * whiteWidth, width: whiteWidth };
      whites.push(key);
    }
    byMidi[midi] = key;
  }
  return { range, width, whiteWidth, whites, blacks, byMidi };
}

export interface OutOfRange {
  below: number;
  above: number;
}

/** How many notes fall below or above the keyboard (for a "won't fit" hint). */
export function countOutOfRange(notes: readonly { midi: number }[], range: KeyRange): OutOfRange {
  let below = 0;
  let above = 0;
  for (const note of notes) {
    if (note.midi < range.low) below++;
    else if (note.midi > range.high) above++;
  }
  return { below, above };
}
