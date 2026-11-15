// Movable-do solfège. Pure.
//
// In major, do is the tonic. In minor, do-based (the default) keeps do on the tonic and
// lowers the third, sixth and seventh (do re me fa sol le te); la-based puts la on the
// tonic (la ti do re mi fa sol). Notes outside the key take the chromatic syllables
// (di, ra, ri, me, fi, se, si, le, li, te).

import { keyLetter, keyPitchClass, MAJOR_STEPS, NATURAL_PCS, wrapAccidental, type KeySpec } from './keys';
import type { Spelled } from './spelling';

export type MinorSolfege = 'do' | 'la';

/** Syllables for each degree of a major scale: lowered, as written, raised. */
const SYLLABLES: readonly (readonly [string, string, string])[] = [
  ['de', 'do', 'di'],
  ['ra', 're', 'ri'],
  ['me', 'mi', 'mi♯'],
  ['fa♭', 'fa', 'fi'],
  ['se', 'sol', 'si'],
  ['le', 'la', 'li'],
  ['te', 'ti', 'ti♯'],
];

/** Where do is, as a pitch class and a letter, for this key and convention. */
function doOf(spec: KeySpec, minor: MinorSolfege): { pc: number; letter: number } {
  const pc = keyPitchClass(spec.key);
  const letter = keyLetter(spec.key);
  // La-based minor: do is the relative major, a minor third (two letters) up.
  if (spec.mode === 'minor' && minor === 'la') return { pc: (pc + 3) % 12, letter: (letter + 2) % 7 };
  return { pc, letter };
}

/**
 * The syllable for a spelled note, capitalised ("Do", "Me", "Fi"). Spell the note for the
 * key first, so the letter says which degree it is and the accidental how it is altered.
 */
export function solfege(note: Spelled, spec: KeySpec, minor: MinorSolfege = 'do'): string {
  const home = doOf(spec, minor);
  const degree = (note.letter - home.letter + 7) % 7;
  const written = ((NATURAL_PCS[note.letter] ?? 0) + note.accidental + 120) % 12;
  const expected = (home.pc + (MAJOR_STEPS[degree] ?? 0)) % 12;
  const alteration = wrapAccidental(written - expected);
  const row = SYLLABLES[degree] ?? SYLLABLES[0];
  const syllable = alteration < 0 ? row?.[0] : alteration > 0 ? row?.[2] : row?.[1];
  const text = syllable ?? '?';
  return text.charAt(0).toUpperCase() + text.slice(1);
}
