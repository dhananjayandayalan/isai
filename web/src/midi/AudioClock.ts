// The audio clock as MIDI adapters see it (ADR 0003, ADR 0004). Implemented in
// src/audio/ on top of the AudioContext; tests use a fake.

export interface AudioClock {
  /** Current audio-clock time in seconds (`AudioContext.currentTime`). */
  now(): number;
  /**
   * Convert a DOM high-resolution timestamp in milliseconds (such as
   * `MIDIMessageEvent.timeStamp`) to audio-clock seconds.
   */
  fromDomTimestamp(ms: number): number;
}
