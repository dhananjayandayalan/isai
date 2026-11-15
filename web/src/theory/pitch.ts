// Pitch classes and MIDI note names, matching pipeline/src/isai/theory/pitch.py.
// Pitch class 0 is C; MIDI 60 is C4 (scientific pitch notation, middle C).

export type Prefer = 'sharp' | 'flat';

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

export const MIDI_MIN = 0;
export const MIDI_MAX = 127;

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

function checkMidi(midi: number): void {
  if (!Number.isInteger(midi) || midi < MIDI_MIN || midi > MIDI_MAX) {
    throw new RangeError(`MIDI note must be an integer ${MIDI_MIN}-${MIDI_MAX}, got ${midi}`);
  }
}

/** 0-11, C = 0. */
export function pitchClass(midi: number): number {
  checkMidi(midi);
  return midi % 12;
}

/** Scientific octave: MIDI 60 is in octave 4, MIDI 0 in octave -1. */
export function octave(midi: number): number {
  checkMidi(midi);
  return Math.floor(midi / 12) - 1;
}

/** `midiToName(60) === 'C4'`, `midiToName(61, 'flat') === 'Db4'`. */
export function midiToName(midi: number, prefer: Prefer = 'sharp'): string {
  const names = prefer === 'flat' ? FLAT_NAMES : SHARP_NAMES;
  return `${names[pitchClass(midi)]}${octave(midi)}`;
}

/** True for the keys drawn black on a piano (C#, D#, F#, G#, A#). */
export function isBlackKey(midi: number): boolean {
  return BLACK_PITCH_CLASSES.has(pitchClass(midi));
}
