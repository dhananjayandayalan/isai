// Decides when a step has been played (ADR 0005). It knows nothing about the transport:
// the engine tells it which step comes next (`setTarget`), when playback reaches that step
// (`arm`), and every key that goes down or up. Times are audio-clock seconds.

import type { Step } from './steps';

export type OctaveMatch = 'exact' | 'any';

export interface MatcherOptions {
  /** A key pressed this long before the step became current still counts. Seconds. */
  earlyGrace?: number;
  /** `exact` MIDI pitch, or `any` octave of the right note name. */
  octave?: OctaveMatch;
}

/** Learners who play just before the hold shouldn't have to play again (ADR 0005). */
export const EARLY_GRACE = 0.15;

/**
 * What a key press meant:
 * - `matched`: it was one of the notes being waited for.
 * - `early`: it is in the next step, but playback hasn't reached that step yet.
 * - `repeat`: it is in the current step and was already played.
 * - `wrong`: it is not in the step. Recorded, never blocks.
 * - `idle`: there is no step to play.
 */
export type NoteVerdict = 'matched' | 'early' | 'repeat' | 'wrong' | 'idle';

/** An expected pitch and the key that satisfied it (the same number unless any-octave). */
export interface Satisfied {
  pitch: number;
  key: number;
}

const EPSILON = 1e-9;

export class StepMatcher {
  private readonly earlyGrace: number;
  private octave: OctaveMatch;
  /** 1 for every key that is down now. */
  private readonly down = new Uint8Array(128);
  /** When each key was pressed while its step was still ahead; NaN if it wasn't. */
  private readonly early = new Float64Array(128).fill(Number.NaN);
  private target: Step | null = null;
  private pending: number[] = [];
  private armed = false;
  private wrongNotes = 0;

  constructor(options: MatcherOptions = {}) {
    this.earlyGrace = options.earlyGrace ?? EARLY_GRACE;
    this.octave = options.octave ?? 'exact';
  }

  setOctave(octave: OctaveMatch): void {
    this.octave = octave;
  }

  /** The step to play next, or null when there is none. Forgets the previous step. */
  setTarget(step: Step | null): void {
    this.target = step;
    this.pending = step ? [...step.pitches] : [];
    this.armed = false;
    this.wrongNotes = 0;
    this.early.fill(Number.NaN);
  }

  /** The pitches still needed for the current target. */
  get remaining(): readonly number[] {
    return this.pending;
  }

  /** True once every pitch of the target has been played. False with no target. */
  get done(): boolean {
    return this.target !== null && this.pending.length === 0;
  }

  /** Whether playback has reached the target (`arm` was called for it). */
  get waiting(): boolean {
    return this.armed && this.pending.length > 0;
  }

  /** Wrong notes since the target was set. */
  get wrong(): number {
    return this.wrongNotes;
  }

  isDown(key: number): boolean {
    return (this.down[key] ?? 0) > 0;
  }

  /** Forget which keys are down (the keyboard was disconnected). */
  releaseKeys(): void {
    this.down.fill(0);
  }

  /**
   * Playback reached the target at `time`. A pitch is satisfied at once if its key is
   * down (held over from before), or was pressed within the early grace. Returns those.
   */
  arm(time: number): Satisfied[] {
    this.armed = true;
    const satisfied: Satisfied[] = [];
    const used = new Set<number>();
    const stillPending: number[] = [];
    for (const pitch of this.pending) {
      const key = this.keyFor(pitch, used, time);
      if (key === null) stillPending.push(pitch);
      else {
        used.add(key);
        satisfied.push({ pitch, key });
      }
    }
    this.pending = stillPending;
    return satisfied;
  }

  noteOn(key: number, time: number): NoteVerdict {
    if (key < 0 || key > 127) return 'idle';
    this.down[key] = 1;
    const target = this.target;
    if (!target) return 'idle';

    const index = this.pending.findIndex((pitch) => this.same(pitch, key));
    if (!this.armed) {
      if (index < 0) {
        this.wrongNotes++;
        return 'wrong';
      }
      this.early[key] = time;
      return 'early';
    }
    if (index >= 0) {
      this.pending.splice(index, 1);
      return 'matched';
    }
    if (target.pitches.some((pitch) => this.same(pitch, key))) return 'repeat';
    this.wrongNotes++;
    return 'wrong';
  }

  noteOff(key: number): void {
    if (key >= 0 && key <= 127) this.down[key] = 0;
  }

  private same(pitch: number, key: number): boolean {
    return this.octave === 'any' ? pitch % 12 === key % 12 : pitch === key;
  }

  /** A key that satisfies `pitch` at arm time and isn't already used for another pitch. */
  private keyFor(pitch: number, used: Set<number>, time: number): number | null {
    const counts = (key: number) =>
      !used.has(key) &&
      ((this.down[key] ?? 0) > 0 || (this.early[key] ?? Number.NaN) >= time - this.earlyGrace - EPSILON);
    if (this.octave === 'exact') return counts(pitch) ? pitch : null;
    for (let key = pitch % 12; key <= 127; key += 12) if (counts(key)) return key;
    return null;
  }
}
