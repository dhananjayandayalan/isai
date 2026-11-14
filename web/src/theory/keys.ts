// Key signatures: whether a key is written with sharps or with flats. Pure.

import { FLAT_NAMES, SHARP_NAMES, type Prefer } from './pitch';

/** The tonality modes of the Song contract. */
export type KeyMode = 'major' | 'minor' | 'modal';

const LETTER_PCS: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Major keys whose signature has flats: F, Bb, Eb, Ab, Db, Gb. */
const FLAT_MAJORS = new Set([5, 10, 3, 8, 1, 6]);

/** Pitch class of a key name such as "G", "Bb" or "F#" (the contract's `tonality.key`). */
export function keyPitchClass(key: string): number {
  const match = /^([A-G])(#|b)?$/.exec(key);
  const letter = match?.[1];
  if (!letter) throw new RangeError(`Not a key name: ${JSON.stringify(key)}`);
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return ((LETTER_PCS[letter] ?? 0) + accidental + 12) % 12;
}

/**
 * Sharps or flats for this key. A key named with an accidental keeps it ("Bb" flats,
 * "F#" sharps). A natural-letter major or minor key follows its signature: F major and
 * D, G, C and F minor take flats. A modal key has no known signature: sharps.
 */
export function keySpelling(key: string, mode: KeyMode): Prefer {
  const tonic = keyPitchClass(key);
  if (key.endsWith('b')) return 'flat';
  if (key.endsWith('#') || mode === 'modal') return 'sharp';
  const relativeMajor = mode === 'minor' ? (tonic + 3) % 12 : tonic;
  return FLAT_MAJORS.has(relativeMajor) ? 'flat' : 'sharp';
}

/** Name a pitch class in the spelling given: 10 is "A#" or "Bb". */
export function pitchClassName(pc: number, prefer: Prefer): string {
  const names = prefer === 'flat' ? FLAT_NAMES : SHARP_NAMES;
  return names[((pc % 12) + 12) % 12] ?? '?';
}
