// The audio engine as the rest of the app sees it (ADR 0004). Only src/audio/tone.ts
// implements these with Tone.js; engine, piano and UI code depend on the interfaces and
// tests use FakeTransport / FakeInstrument.

import type { AudioClock } from '../midi/AudioClock';
import type { VoicedInstrument } from './voices';

export type TransportState = 'started' | 'paused' | 'stopped';

/**
 * The clock everything is scheduled on. Positions are seconds on the transport's own
 * timeline; the practice engine maps song time onto it (ADR 0005).
 */
export interface Transport {
  readonly state: TransportState;
  /** Current position in seconds, as heard now (read every animation frame). */
  readonly seconds: number;
  /**
   * How far ahead of the sound the transport works, in seconds. `start()` takes effect
   * this much later, and scheduled callbacks run this early (with the right audio time).
   */
  readonly lookahead: number;
  /**
   * Seconds to take off a key press's audio-clock time so it lines up with the song as it
   * was heard (ADR 0006). 0 when the clock already maps key times to what is being heard.
   */
  readonly outputLatency: number;
  /** Start or resume from the current position. */
  start(): void;
  /**
   * Stop advancing and keep the position. With `time` (audio-clock seconds, as passed to
   * a scheduled callback) the pause lands exactly there instead of "now".
   */
  pause(time?: number): void;
  /** Stop advancing and go back to 0, now or at an audio-clock `time`. */
  stop(time?: number): void;
  /** Move to a position; keeps playing if started. */
  seek(seconds: number): void;
  /**
   * Call `callback` when the transport reaches `at` seconds. It receives the audio-clock
   * time the event is due, to pass on to an `Instrument`. Returns an id for `clear`.
   * The event stays scheduled, and fires again if the position passes it again, until
   * it is cleared.
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
  /** The app's sound: the grand piano, or the electric piano once selected. */
  piano: VoicedInstrument;
  /** A short click for the metronome and count-in; `noteOn` plays one, pitch from `midi`. */
  metronome: Instrument;
  clock: AudioClock;
}
