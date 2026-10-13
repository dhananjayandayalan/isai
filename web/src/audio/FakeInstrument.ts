import type { Instrument, InstrumentSound } from './types';

export type InstrumentCall =
  | { type: 'on'; midi: number; velocity: number; time: number | undefined }
  | { type: 'off'; midi: number; time: number | undefined }
  | { type: 'releaseAll'; time: number | undefined };

/** Records every call so tests can check what would have sounded, and when. */
export class FakeInstrument implements Instrument {
  readonly loaded: Promise<InstrumentSound>;
  readonly calls: InstrumentCall[] = [];
  /** Notes currently sounding. */
  readonly sounding = new Set<number>();

  constructor(sound: InstrumentSound | Promise<InstrumentSound> = 'sampled') {
    this.loaded = Promise.resolve(sound);
  }

  noteOn(midi: number, velocity: number, time?: number): void {
    this.calls.push({ type: 'on', midi, velocity, time });
    this.sounding.add(midi);
  }

  noteOff(midi: number, time?: number): void {
    this.calls.push({ type: 'off', midi, time });
    this.sounding.delete(midi);
  }

  releaseAll(time?: number): void {
    this.calls.push({ type: 'releaseAll', time });
    this.sounding.clear();
  }
}
