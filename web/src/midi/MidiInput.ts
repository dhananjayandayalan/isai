// The only way the app receives MIDI (ADR 0003, CLAUDE.md rule 4). Adapters for Web MIDI
// and native platforms implement this interface; nothing else touches the MIDI APIs.

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer?: string;
}

export interface MidiNoteEvent {
  /** MIDI note number, 0-127 (60 = C4). */
  note: number;
  /** 1-127 for note-on; release velocity (often 0) for note-off. */
  velocity: number;
  /** MIDI channel, 0-15. */
  channel: number;
  /**
   * When the note happened, in seconds on the audio clock (AudioContext.currentTime).
   * Adapters convert device timestamps to this clock (CLAUDE.md rule 6).
   */
  time: number;
  deviceId: string;
}

export type MidiNoteListener = (event: MidiNoteEvent) => void;

/** Call to stop listening. */
export type Unsubscribe = () => void;

export interface MidiInput {
  listDevices(): Promise<MidiDevice[]>;
  /** Start receiving notes from one device. Rejects if the device is unknown or busy. */
  connect(deviceId: string): Promise<void>;
  onNoteOn(listener: MidiNoteListener): Unsubscribe;
  onNoteOff(listener: MidiNoteListener): Unsubscribe;
  /** Stop receiving notes. Listeners stay registered for the next `connect`. */
  disconnect(): Promise<void>;
}
