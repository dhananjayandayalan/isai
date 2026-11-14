// The name of every key in the chosen notation, built once per song and setting, for the
// keyboard to draw without naming anything per frame. Pure.

import type { NoteLabel, NoteNamer } from '../theory/labels';
import { octave } from '../theory/pitch';

/**
 * A label per MIDI note. Where the keys are named with letters (letters, Roman numerals,
 * the staff), each C keeps its octave number so the learner can find their place.
 */
export function keyNames(namer: NoteNamer): NoteLabel[] {
  const letters = !['solfege', 'swaras'].includes(namer.options.notation);
  return Array.from({ length: 128 }, (_, midi) => {
    const label = namer.note(midi);
    if (letters && midi % 12 === 0 && !namer.options.octaves) return { ...label, text: `${label.text}${octave(midi)}` };
    return label;
  });
}
