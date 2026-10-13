// The audio engine as the rest of the app sees it (ADR 0004). Only src/audio/tone.ts
// implements these with Tone.js; engine, piano and UI code depend on the interfaces and
// tests use FakeTransport / FakeInstrument.

import type { AudioClock } from '../midi/AudioClock';

export type TransportState = 'started' | 'paused' | 'stopped';

/** The song clock. All song times are seconds from the start of the song. */
export interface Transport {
  readonly state: TransportState;
  /** Current song position in seconds, as heard now (read every animation frame). */
  readonly seconds: number;
  /** Start or resume from the current position. */
  start(): void;
  /** Stop advancing and keep the position. */
  pause(): void;
  /** Stop advancing and go back to 0. */
  stop(): void;
  /** Move to a song position; keeps playing if started. */
  seek(seconds: number): void;
  /**
   * Call `callback` when the song reaches `at` seconds. It receives the audio-clock time
   * the event is due, to pass on to an `Instrument`. Returns an id for `clear`.
   */
  schedule(at: number, callback: (audioTime: number) => void): number;
  clear(id: number): void;
}

export type InstrumentSound = 'sampled' | 'synth';

export interface Instrument {
  /** Resolves once the instrument can play: with samples, or with the synth fallback. */
  readonly loaded: Promise<InstrumentSound>;
  /** `velocity` is MIDI 1-127; `time` is audio-clock seconds, omitted for "now". */
  noteOn(midi: number, velocity: number, time?: number): void;
  noteOff(midi: number, time?: number): void;
  releaseAll(time?: number): void;
}

/** Everything `createToneAudio` provides once Tone.js has loaded. */
export interface LoadedAudio {
  transport: Transport;
  piano: Instrument;
  clock: AudioClock;
}
