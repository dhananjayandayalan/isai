// Loads the audio engine once, on demand, and hands out a clock that works before it has
// loaded. The MIDI adapter needs a clock at construction, but Tone.js only loads on the
// first user gesture (ADR 0004).

import type { AudioClock } from '../midi/AudioClock';
import type { LoadedAudio } from './types';

export type AudioLoader = () => Promise<LoadedAudio>;

export class AudioEngine {
  private readonly loader: AudioLoader;
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

  constructor(loader: AudioLoader) {
    this.loader = loader;
  }

  get loaded(): LoadedAudio | null {
    return this.audio;
  }

  /** Load once; concurrent calls share the load. A failed load can be retried. */
  load(): Promise<LoadedAudio> {
    if (!this.pending) {
      this.pending = this.loader().then(
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
