// Keys: their tonic, their scale degrees and how those are spelled with letters. Pure.

import { FLAT_NAMES, SHARP_NAMES, type Prefer } from './pitch';

/** The tonality modes of the Song contract. */
export type KeyMode = 'major' | 'minor' | 'modal';

/** A key as the Song gives it: `tonality.key`, `tonality.mode` and `tonality.scale`. */
export interface KeySpec {
  /** Tonic name: a letter with an optional `#` or `b` ("G", "Bb", "F#"). */
  key: string;
  mode: KeyMode;
  /** Pitch classes of the scale (0 = C); only a modal key's seven-note scale is used for spelling. */
  scale?: readonly number[];
}

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type Letter = (typeof LETTERS)[number];
/** Pitch class of each natural letter, C to B. */
export const NATURAL_PCS = [0, 2, 4, 5, 7, 9, 11] as const;

export const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;
export const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10] as const;

/** Major keys whose signature has flats: F, Bb, Eb, Ab, Db, Gb. */
const FLAT_MAJORS = new Set([5, 10, 3, 8, 1, 6]);

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** Semitones as an accidental: 1 is a sharp, −1 a flat, in the range −6 to 5. */
export function wrapAccidental(semitones: number): number {
  return mod12(semitones + 6) - 6;
}

function parseKey(key: string): { letter: number; accidental: number } {
  const match = /^([A-G])(#|b)?$/.exec(key);
  const letter = match ? LETTERS.indexOf(match[1] as Letter) : -1;
  if (!match || letter < 0) throw new RangeError(`Not a key name: ${JSON.stringify(key)}`);
  return { letter, accidental: match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0 };
}

/** Pitch class of a key name such as "G", "Bb" or "F#" (the contract's `tonality.key`). */
export function keyPitchClass(key: string): number {
  const { letter, accidental } = parseKey(key);
  return mod12((NATURAL_PCS[letter] ?? 0) + accidental);
}

/** Letter index (C = 0 … B = 6) of a key's tonic. */
export function keyLetter(key: string): number {
  return parseKey(key).letter;
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
  return names[mod12(pc)] ?? '?';
}

/**
 * Semitones above the tonic of each scale degree: the major or natural minor scale, or a
 * modal key's own seven-note scale (the major scale when it doesn't have seven notes).
 */
export function scaleSteps(spec: KeySpec): readonly number[] {
  if (spec.mode === 'major') return MAJOR_STEPS;
  if (spec.mode === 'minor') return MINOR_STEPS;
  const tonic = keyPitchClass(spec.key);
  const steps = [...new Set((spec.scale ?? []).map((pc) => mod12(pc - tonic)))].sort((a, b) => a - b);
  return steps.length === 7 && steps[0] === 0 ? steps : MAJOR_STEPS;
}

/** One scale degree: its pitch class and how the key spells it. */
export interface Degree {
  pc: number;
  /** Letter index, C = 0 … B = 6. */
  letter: number;
  /** Semitones from the natural letter: 1 sharp, −1 flat. */
  accidental: number;
}

/** The seven degrees of a key, each on the next letter: G major is G A B C D E F#. */
export function keyDegrees(spec: KeySpec): Degree[] {
  const tonic = keyPitchClass(spec.key);
  const tonicLetter = keyLetter(spec.key);
  return scaleSteps(spec).map((step, i) => {
    const pc = mod12(tonic + step);
    const letter = (tonicLetter + i) % 7;
    return { pc, letter, accidental: wrapAccidental(pc - (NATURAL_PCS[letter] ?? 0)) };
  });
}

/** The key signature: how many sharps (positive) or flats (negative). */
export function signature(spec: KeySpec): number {
  return keyDegrees(spec).reduce((sum, degree) => sum + degree.accidental, 0);
}
