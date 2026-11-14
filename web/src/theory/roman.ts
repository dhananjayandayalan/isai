// Roman numerals for chords, relative to the key. Pure.
//
// Built from the chord's root, quality and bass (the Song contract's fields), not from
// its label. Upper case for major-type chords, lower case for minor-type; `°` diminished,
// `ø` half-diminished, `+` augmented, `M7` a major seventh. Inversions are figures (`6`,
// `64`, `65`, `43`, `42`). Degrees count from the key's own scale (the natural minor in a
// minor key, where the leading-tone chord is still `vii`); other roots take `♭` or `♯`.
// A non-diatonic major or dominant chord that resolves down a fifth to the next chord is a
// secondary dominant: `V/V`, `V7/ii`.

import type { Chord } from '../generated/song';
import { keyDegrees, keyLetter, keyPitchClass, type KeySpec } from './keys';
import { Speller } from './spelling';

export type ChordQuality = Chord['quality'];

/** What a Roman numeral needs from a chord. */
export interface ChordShape {
  /** Root pitch class (0 = C). */
  root: number;
  quality: ChordQuality;
  /** Bass pitch class when it isn't the root. */
  bass?: number;
}

interface QualityInfo {
  /** Semitones above the root of each chord tone; the third (if any) comes second. */
  tones: readonly number[];
  upper: boolean;
  /** What follows the numeral in root position. */
  suffix: string;
  /** For seventh chords: the symbol kept when an inversion figure replaces the `7`. */
  seventh?: string;
}

export const QUALITIES: Readonly<Record<ChordQuality, QualityInfo>> = {
  maj: { tones: [0, 4, 7], upper: true, suffix: '' },
  min: { tones: [0, 3, 7], upper: false, suffix: '' },
  dim: { tones: [0, 3, 6], upper: false, suffix: '°' },
  aug: { tones: [0, 4, 8], upper: true, suffix: '+' },
  sus2: { tones: [0, 2, 7], upper: true, suffix: 'sus2' },
  sus4: { tones: [0, 5, 7], upper: true, suffix: 'sus4' },
  '5': { tones: [0, 7], upper: true, suffix: '5' },
  maj6: { tones: [0, 4, 7, 9], upper: true, suffix: 'add6' },
  min6: { tones: [0, 3, 7, 9], upper: false, suffix: 'add6' },
  '7': { tones: [0, 4, 7, 10], upper: true, suffix: '7', seventh: '' },
  maj7: { tones: [0, 4, 7, 11], upper: true, suffix: 'M7', seventh: 'M' },
  min7: { tones: [0, 3, 7, 10], upper: false, suffix: '7', seventh: '' },
  minmaj7: { tones: [0, 3, 7, 11], upper: false, suffix: 'M7', seventh: 'M' },
  dim7: { tones: [0, 3, 6, 9], upper: false, suffix: '°7', seventh: '°' },
  hdim7: { tones: [0, 3, 6, 10], upper: false, suffix: 'ø7', seventh: 'ø' },
  '9': { tones: [0, 4, 7, 10, 2], upper: true, suffix: '9' },
  maj9: { tones: [0, 4, 7, 11, 2], upper: true, suffix: 'M9' },
  min9: { tones: [0, 3, 7, 10, 2], upper: false, suffix: '9' },
  add9: { tones: [0, 4, 7, 2], upper: true, suffix: 'add9' },
};

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;
const DOMINANT_QUALITIES = new Set<ChordQuality>(['maj', '7', '9']);
const TRIADS = new Set<ChordQuality>(['maj', 'min', 'dim', 'aug']);

const mod12 = (n: number) => ((n % 12) + 12) % 12;

function accidentalSign(alteration: number): string {
  if (alteration > 0) return '♯'.repeat(alteration);
  return '♭'.repeat(-alteration);
}

/** Roman numerals for one key. Build it once per song. */
export class RomanNumerals {
  private readonly spec: KeySpec;
  private readonly tonic: number;
  private readonly tonicLetter: number;
  private readonly degreeAccidentals: number[];
  private readonly speller: Speller;

  constructor(spec: KeySpec) {
    this.spec = spec;
    this.tonic = keyPitchClass(spec.key);
    this.tonicLetter = keyLetter(spec.key);
    this.degreeAccidentals = keyDegrees(spec).map((d) => d.accidental);
    this.speller = new Speller(spec);
  }

  /** The scale degree (0–6) of a pitch class and its alteration from the key: −1 ♭, +1 ♯. */
  degree(pc: number): { index: number; alteration: number } {
    const spelled = this.speller.pitch(60 + mod12(pc));
    const index = (spelled.letter - this.tonicLetter + 7) % 7;
    let alteration = spelled.accidental - (this.degreeAccidentals[index] ?? 0);
    // In minor the leading tone (a raised seventh) is the usual vii, not ♯vii.
    if (this.spec.mode === 'minor' && index === 6 && alteration === 1) alteration = 0;
    return { index, alteration };
  }

  /** "♭VII", "ii", "V": the degree with its accidental, in the chord's case. */
  private base(chord: ChordShape): string {
    const { index, alteration } = this.degree(chord.root);
    const numeral = NUMERALS[index] ?? '?';
    return accidentalSign(alteration) + (QUALITIES[chord.quality].upper ? numeral : numeral.toLowerCase());
  }

  /** The suffix and inversion figure: "7", "65", "°43", "64", or "/♭7" for another bass. */
  private tail(chord: ChordShape): string {
    const info = QUALITIES[chord.quality];
    if (chord.bass === undefined || mod12(chord.bass) === mod12(chord.root)) return info.suffix;
    const interval = mod12(chord.bass - chord.root);
    const position = info.tones.indexOf(interval);
    if (TRIADS.has(chord.quality) && (position === 1 || position === 2)) {
      return info.suffix + (position === 1 ? '6' : '64');
    }
    if (info.seventh !== undefined && position >= 1 && position <= 3) {
      return info.seventh + ['', '65', '43', '42'][position];
    }
    // A bass that isn't a chord tone, or a chord with no figures: the bass's scale degree.
    const bass = this.degree(chord.bass);
    return `${info.suffix}/${accidentalSign(bass.alteration)}${bass.index + 1}`;
  }

  /** Whether every tone of the chord is in the key. */
  isDiatonic(chord: ChordShape): boolean {
    return QUALITIES[chord.quality].tones.every((t) => this.speller.isDiatonic(chord.root + t));
  }

  /**
   * The numeral for `chord`. Pass the chord that follows it, so a secondary dominant can
   * be named for the chord it resolves to.
   */
  numeral(chord: ChordShape, next?: ChordShape): string {
    const target = next && this.secondaryTarget(chord, next);
    if (target) return `V${this.tail(chord)}/${target}`;
    return this.base(chord) + this.tail(chord);
  }

  /** The numeral of the chord a secondary dominant resolves to, or null if it isn't one. */
  private secondaryTarget(chord: ChordShape, next: ChordShape): string | null {
    if (!DOMINANT_QUALITIES.has(chord.quality) || this.isDiatonic(chord)) return null;
    if (mod12(chord.root - 7) !== mod12(next.root)) return null;
    // Resolving to the tonic is just V; resolving to a chord outside the key isn't analysed.
    if (mod12(next.root - this.tonic) === 0 || !this.speller.isDiatonic(next.root)) return null;
    return this.base(next);
  }
}
