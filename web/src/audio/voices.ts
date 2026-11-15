// The app's sound: the grand piano or the electric piano behind one Instrument, so the
// practice engine and the monitor never know which is playing (ADR 0004's second
// instrument). The electric piano loads only when it is first chosen.

import type { Instrument, InstrumentSound } from './types';

export type Voice = 'grand' | 'electric';

/** An Instrument that plays through whichever voice is selected. */
export interface VoicedInstrument extends Instrument {
  readonly voice: Voice;
  /** Switch voice (loading it the first time). Notes still sounding on the old voice are released. */
  select(voice: Voice): Promise<InstrumentSound>;
}

export class SwitchableInstrument implements VoicedInstrument {
  private readonly voices: { grand: Instrument; electric: Instrument | null };
  private readonly createElectric: () => Instrument;
  private current: Voice = 'grand';

  constructor(grand: Instrument, createElectric: () => Instrument) {
    this.voices = { grand, electric: null };
    this.createElectric = createElectric;
  }

  get voice(): Voice {
    return this.current;
  }

  get loaded(): Promise<InstrumentSound> {
    return this.instrument().loaded;
  }

  select(voice: Voice): Promise<InstrumentSound> {
    if (voice !== this.current) {
      this.instrument().releaseAll();
      if (voice === 'electric') this.voices.electric ??= this.createElectric();
      this.current = voice;
    }
    return this.instrument().loaded;
  }

  noteOn(midi: number, velocity: number, time?: number): void {
    this.instrument().noteOn(midi, velocity, time);
  }

  noteOff(midi: number, time?: number): void {
    this.instrument().noteOff(midi, time);
  }

  releaseAll(time?: number): void {
    this.instrument().releaseAll(time);
  }

  private instrument(): Instrument {
    return this.current === 'electric' && this.voices.electric ? this.voices.electric : this.voices.grand;
  }
}
