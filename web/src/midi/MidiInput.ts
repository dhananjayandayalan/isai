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

/** The sustain pedal (control change 64) on the connected device (ADR 0007). */
export interface MidiPedalEvent {
  /** Pedal down: `value >= 64`. */
  down: boolean;
  /** 0-127; values in between are half-pedalling. */
  value: number;
  channel: number;
  /** Audio-clock seconds, like note times. */
  time: number;
  deviceId: string;
}

export type MidiPedalListener = (event: MidiPedalEvent) => void;

/** Called with the inputs available now, after one is plugged in or unplugged. */
export type MidiDevicesListener = (devices: MidiDevice[]) => void;

/** CC 64 counts as down from this value. */
export const PEDAL_DOWN_AT = 64;

/** Call to stop listening. */
export type Unsubscribe = () => void;

export interface MidiInput {
  listDevices(): Promise<MidiDevice[]>;
  /** Start receiving notes from one device. Rejects if the device is unknown or busy. */
  connect(deviceId: string): Promise<void>;
  onNoteOn(listener: MidiNoteListener): Unsubscribe;
  onNoteOff(listener: MidiNoteListener): Unsubscribe;
  /** The sustain pedal of the connected device. Training and scoring ignore it. */
  onPedal(listener: MidiPedalListener): Unsubscribe;
  /**
   * Inputs plugged in or unplugged, once MIDI access has been granted (by `listDevices`).
   * If the connected device goes, the new list says so; the caller disconnects.
   */
  onDevicesChanged(listener: MidiDevicesListener): Unsubscribe;
  /** Stop receiving notes. Listeners stay registered for the next `connect`. */
  disconnect(): Promise<void>;
}
