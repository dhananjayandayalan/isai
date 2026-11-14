// Names for notes and chords in the system the learner picked: letters, solfège, swaras,
// Roman numerals. One NoteNamer per song and setting; the keyboard, the falling notes, the
// chord lane and screen-reader text all read from it. Pure.

import type { KeySpec } from './keys';
import { RomanNumerals, type ChordQuality, type ChordShape } from './roman';
import { solfege, type MinorSolfege } from './solfege';
import { Speller, spelledName, type Motion } from './spelling';
import { octaveWord, SwaraNamer, type SwaraDetail } from './swaras';

/** The note-name setting, as on the Devices screen. */
export type Notation = 'letters' | 'solfege' | 'swaras' | 'roman' | 'staff';

export interface NamingOptions {
  notation: Notation;
  /** Letters with octave numbers ("C4"). */
  octaves: boolean;
  swaraDetail: SwaraDetail;
  minor: MinorSolfege;
}

export const DEFAULT_NAMING: NamingOptions = {
  notation: 'letters',
  octaves: false,
  swaraDetail: 'short',
  minor: 'do',
};

/** A note's name, with octave dots for swaras (above for tara, below for mandra). */
export interface NoteLabel {
  text: string;
  dotsAbove: number;
  dotsBelow: number;
}

/** A chord as the lane needs it: the Song's chord fields. */
export interface LaneChord extends ChordShape {
  label: string;
}

/** Chord-quality endings after a root named in solfège or swaras ("Re m7", "R2 dim"). */
export const QUALITY_TEXT: Readonly<Record<ChordQuality, string>> = {
  maj: '',
  min: 'm',
  dim: 'dim',
  aug: 'aug',
  sus2: 'sus2',
  sus4: 'sus4',
  '5': '5',
  maj6: '6',
  min6: 'm6',
  '7': '7',
  maj7: 'maj7',
  min7: 'm7',
  minmaj7: 'm(maj7)',
  dim7: 'dim7',
  hdim7: 'm7♭5',
  '9': '9',
  maj9: 'maj9',
  min9: 'm9',
  add9: 'add9',
};

/** Which system names the notes: Roman numerals and the staff name the keys with letters. */
function noteSystem(notation: Notation): 'letters' | 'solfege' | 'swaras' {
  return notation === 'solfege' || notation === 'swaras' ? notation : 'letters';
}

export class NoteNamer {
  readonly options: NamingOptions;
  private readonly spec: KeySpec;
  private readonly speller: Speller;
  private readonly swaras: SwaraNamer;
  private readonly roman: RomanNumerals;

  constructor(spec: KeySpec, options: Partial<NamingOptions> = {}) {
    this.spec = spec;
    this.options = { ...DEFAULT_NAMING, ...options };
    this.speller = new Speller(spec);
    this.swaras = new SwaraNamer(spec);
    this.roman = new RomanNumerals(spec);
  }

  /** The note's name. `motion` (where the line goes next) spells notes outside the key. */
  note(midi: number, motion: Motion = 0): NoteLabel {
    const system = noteSystem(this.options.notation);
    if (system === 'swaras') {
      const swara = this.swaras.name(midi, this.options.swaraDetail);
      return { text: swara.text, dotsAbove: Math.max(0, swara.octave), dotsBelow: Math.max(0, -swara.octave) };
    }
    const spelled = this.speller.pitch(midi, motion);
    const text =
      system === 'solfege' ? solfege(spelled, this.spec, this.options.minor) : spelledName(spelled, this.options.octaves);
    return { text, dotsAbove: 0, dotsBelow: 0 };
  }

  /** The note's name as words, for screen readers ("tara S", "F#4"). */
  spoken(midi: number): string {
    const label = this.note(midi);
    if (noteSystem(this.options.notation) !== 'swaras') return label.text;
    const octave = octaveWord(label.dotsAbove - label.dotsBelow);
    return octave ? `${octave} ${label.text}` : label.text;
  }

  /**
   * The chord's name for the lane: the Song's label for letters and the staff, Roman
   * numerals for "roman", and the root in solfège or swaras plus the quality for those.
   * `next` lets a secondary dominant be named for where it goes.
   */
  chord(chord: LaneChord, next?: ChordShape): string {
    const notation = this.options.notation;
    if (notation === 'roman') return this.roman.numeral(chord, next);
    if (notation !== 'solfege' && notation !== 'swaras') return chord.label;
    const root = this.pitchClassName(chord.root);
    const quality = QUALITY_TEXT[chord.quality];
    const bass = chord.bass !== undefined && chord.bass !== chord.root ? `/${this.pitchClassName(chord.bass)}` : '';
    return `${root}${quality ? ` ${quality}` : ''}${bass}`;
  }

  /** A pitch class named without octave marks, in the note system. */
  private pitchClassName(pc: number): string {
    const midi = 60 + (((pc % 12) + 12) % 12);
    if (noteSystem(this.options.notation) === 'swaras') return this.swaras.name(midi, this.options.swaraDetail).text;
    const spelled = this.speller.pitch(midi);
    return noteSystem(this.options.notation) === 'solfege'
      ? solfege(spelled, this.spec, this.options.minor)
      : spelledName(spelled);
  }
}
