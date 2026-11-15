// Spelling notes for a key: F# in D major, Gb in Db major. A note outside the key on a
// white key is written as its plain letter (B natural in F major, never Cb); one on a black
// key is raised or lowered by the way the line moves. Pure.

import { keyDegrees, keyPitchClass, LETTERS, NATURAL_PCS, type Degree, type KeySpec } from './keys';

/** A note with its letter, accidental and octave. */
export interface Spelled {
  midi: number;
  /** Letter index, C = 0 … B = 6. */
  letter: number;
  /** 1 sharp, 2 double sharp, −1 flat, −2 double flat. */
  accidental: number;
  /** The letter's octave (Cb4 is MIDI 59, B#3 is MIDI 60). */
  octave: number;
}

/** Which way the line goes from this note to the next: up, down, or neither. */
export type Motion = 1 | -1 | 0;

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/**
 * Notes outside the key that are raised when nothing else decides, by semitones above
 * the tonic: the sharp fourth in every key, and in minor the major third, sixth and
 * seventh (the leading tone). Every other outside note is lowered (b2, b3, b6, b7).
 */
function raisedByDefault(spec: KeySpec, step: number): boolean {
  if (step === 6) return true;
  return spec.mode === 'minor' && (step === 4 || step === 9 || step === 11);
}

function spell(midi: number, letter: number, accidental: number): Spelled {
  const octave = Math.floor((midi - accidental - (NATURAL_PCS[letter] ?? 0)) / 12) - 1;
  return { midi, letter, accidental, octave };
}

/** Spells notes for one key. Build it once per song; `pitch` and `line` are cheap. */
export class Speller {
  readonly spec: KeySpec;
  private readonly tonic: number;
  private readonly byPc: (Degree | undefined)[] = new Array<Degree | undefined>(12);

  constructor(spec: KeySpec) {
    this.spec = spec;
    this.tonic = keyPitchClass(spec.key);
    for (const degree of keyDegrees(spec)) this.byPc[degree.pc] = degree;
  }

  /** Whether the pitch class is one of the key's seven. */
  isDiatonic(pc: number): boolean {
    return this.byPc[mod12(pc)] !== undefined;
  }

  /** Spell one note. `motion` is where the line goes next; it decides notes outside the key. */
  pitch(midi: number, motion: Motion = 0): Spelled {
    const pc = mod12(midi);
    const own = this.byPc[pc];
    if (own) return spell(midi, own.letter, own.accidental);
    // A white key outside the key: its plain letter reads best (B, not Cb; G, not F##).
    const natural = NATURAL_PCS.findIndex((n) => n === pc);
    if (natural >= 0) return spell(midi, natural, 0);
    const below = this.byPc[mod12(pc - 1)];
    const above = this.byPc[mod12(pc + 1)];
    const raise = motion === 0 ? raisedByDefault(this.spec, mod12(pc - this.tonic)) : motion > 0;
    if (below && (raise || !above)) return spell(midi, below.letter, below.accidental + 1);
    if (above) return spell(midi, above.letter, above.accidental - 1);
    // A black key in a gap of three semitones or more (a modal scale): the letter below, raised.
    const lower = NATURAL_PCS.findIndex((n) => n === mod12(pc - 1));
    return spell(midi, lower, 1);
  }

  /** Spell a line of notes in order: each note outside the key follows where the next one goes. */
  line(midis: readonly number[]): Spelled[] {
    return midis.map((midi, i) => {
      const next = midis[i + 1];
      const motion: Motion = next === undefined || next === midi ? 0 : next > midi ? 1 : -1;
      return this.pitch(midi, motion);
    });
  }
}

function accidentalText(accidental: number): string {
  if (accidental > 0) return '#'.repeat(accidental);
  return 'b'.repeat(-accidental);
}

/** "F#4", or "F#" without the octave. */
export function spelledName(note: Spelled, withOctave = false): string {
  return `${LETTERS[note.letter] ?? '?'}${accidentalText(note.accidental)}${withOctave ? note.octave : ''}`;
}

/**
 * Diatonic staff step: C4 is 28, D4 29 … B4 34, C5 35. Each step is one line or space on a
 * staff, so the staff renderer places a note by its letter and octave, not its pitch.
 */
export function staffStep(note: Spelled): number {
  return note.octave * 7 + note.letter;
}
