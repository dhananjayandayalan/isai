// Swaras relative to the tonic (Sa). Pure.
//
// The twelve swarasthanas: S, R1, R2/G1, R3/G2, G3, M1, M2, P, D1, D2/N1, D3/N2, N3.
// Where two names share a position, the song's scale decides: a position takes the
// higher name (G1, G2, N1, N2) only when the scale already has a lower R or D below it,
// so a major scale reads S R2 G3 M1 P D2 N3. Raga-aware spelling comes in P10.

import { keyPitchClass, scaleSteps, type KeySpec } from './keys';

export type SwaraDetail = 'short' | 'detailed';

/** A swara with its octave: 0 madhya, −1 mandra, −2 anumandra, 1 tara, 2 atitara. */
export interface Swara {
  /** "R", or "R2" in detailed display; S and P never carry a number. */
  text: string;
  /** Octave relative to the middle (madhya) octave. Shown as dots: above for tara, below for mandra. */
  octave: number;
}

/** Madhya Sa is the tonic in MIDI 60–71 (G major: G4). */
export const MADHYA_BASE = 60;

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** The name of each position, given which positions the scale has. */
function positionNames(steps: ReadonlySet<number>): string[] {
  const rBelow = steps.has(1);
  const anyRBelowGa = steps.has(1) || steps.has(2);
  const dBelow = steps.has(8);
  const anyDBelowNi = steps.has(8) || steps.has(9);
  return [
    'S',
    'R1',
    rBelow ? 'G1' : 'R2',
    anyRBelowGa ? 'G2' : 'R3',
    'G3',
    'M1',
    'M2',
    'P',
    'D1',
    dBelow ? 'N1' : 'D2',
    anyDBelowNi ? 'N2' : 'D3',
    'N3',
  ];
}

/** Names swaras for one key. Build it once per song. */
export class SwaraNamer {
  private readonly tonic: number;
  private readonly names: string[];

  constructor(spec: KeySpec) {
    this.tonic = keyPitchClass(spec.key);
    const scale = spec.scale?.length ? spec.scale.map((pc) => mod12(pc - this.tonic)) : scaleSteps(spec);
    this.names = positionNames(new Set(scale));
  }

  /** The detailed name of a position (semitones above Sa), whatever the octave. */
  position(semitones: number): string {
    return this.names[mod12(semitones)] ?? '?';
  }

  name(midi: number, detail: SwaraDetail = 'short'): Swara {
    const full = this.position(midi - this.tonic);
    const madhyaSa = MADHYA_BASE + this.tonic;
    return {
      text: detail === 'short' ? full.charAt(0) : full,
      octave: Math.floor((midi - madhyaSa) / 12),
    };
  }
}

/** Words for a swara's octave, for screen readers: "mandra", "tara", or "" in the middle. */
export function octaveWord(octave: number): string {
  if (octave === 0) return '';
  const words: Record<number, string> = { [-2]: 'anumandra', [-1]: 'mandra', 1: 'tara', 2: 'atitara' };
  return words[octave] ?? (octave < 0 ? `${-octave} octaves down` : `${octave} octaves up`);
}
