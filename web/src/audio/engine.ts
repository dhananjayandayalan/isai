// Loads the audio engine once, on demand, and hands out a clock that works before it has
// loaded. The MIDI adapter needs a clock at construction, but Tone.js only loads on the
// first user gesture (ADR 0004).

import type { AudioClock } from '../midi/AudioClock';
import type { LoadedAudio } from './types';

/** The part of an `AudioContext` the engine uses; tests pass a fake. */
export interface AudioContextLike {
  resume(): Promise<void>;
}

export interface AudioEngineOptions<C extends AudioContextLike> {
  /**
   * Create the audio context. Called synchronously inside the first `load()`, which must
   * itself be called from a click: WebKit only starts audio that begins inside the gesture.
   */
  createContext: () => C;
  /** Load everything else (Tone.js, samples) onto that context. May take a while. */
  load: (context: C) => Promise<LoadedAudio>;
}

/** What the app needs from the audio engine. */
export interface AudioSource {
  readonly clock: AudioClock;
  readonly loaded: LoadedAudio | null;
  load(): Promise<LoadedAudio>;
}

export class AudioEngine<C extends AudioContextLike = AudioContextLike> implements AudioSource {
  private readonly options: AudioEngineOptions<C>;
  private context: C | null = null;
  private audio: LoadedAudio | null = null;
  private pending: Promise<LoadedAudio> | null = null;

  /**
   * Delegates to the loaded engine's clock. Before audio has loaded there is no audio
   * clock, so times read 0; nothing is scheduled against them until then.
   */
  readonly clock: AudioClock = {
    now: () => this.audio?.clock.now() ?? 0,
    fromDomTimestamp: (ms) => this.audio?.clock.fromDomTimestamp(ms) ?? 0,
  };

  constructor(options: AudioEngineOptions<C>) {
    this.options = options;
  }

  get loaded(): LoadedAudio | null {
    return this.audio;
  }

  /**
   * Call from a click. Before anything is awaited, this creates the audio context (first
   * call) and resumes it (every call), so the browser ties audio to the gesture. A later
   * click therefore also wakes a context the browser left suspended. Loading happens
   * once; concurrent calls share it, and a failed load can be retried.
   */
  load(): Promise<LoadedAudio> {
    let context: C;
    try {
      context = this.context ??= this.options.createContext();
      // A rejected resume is not fatal: the next click tries again.
      context.resume().catch(() => undefined);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    if (!this.pending) {
      this.pending = this.options.load(context).then(
        (audio) => {
          this.audio = audio;
          return audio;
        },
        (error: unknown) => {
          this.pending = null;
          throw error;
        },
      );
    }
    return this.pending;
  }
}
