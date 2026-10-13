import type { MidiDevice, MidiInput, MidiNoteEvent, MidiNoteListener, Unsubscribe } from './MidiInput';

export const FAKE_DEVICE: MidiDevice = { id: 'fake-keyboard', name: 'Fake keyboard' };

export interface FakeNoteOptions {
  velocity?: number;
  channel?: number;
  /** Audio-clock seconds. */
  time?: number;
}

/** In-memory `MidiInput` for tests: call `emitNoteOn` / `emitNoteOff` to play it. */
export class FakeMidiInput implements MidiInput {
  private readonly devices: MidiDevice[];
  private readonly noteOn = new Set<MidiNoteListener>();
  private readonly noteOff = new Set<MidiNoteListener>();
  private connectedId: string | null = null;

  constructor(devices: MidiDevice[] = [FAKE_DEVICE]) {
    this.devices = devices;
  }

  get connectedDeviceId(): string | null {
    return this.connectedId;
  }

  listDevices(): Promise<MidiDevice[]> {
    return Promise.resolve([...this.devices]);
  }

  connect(deviceId: string): Promise<void> {
    if (!this.devices.some((d) => d.id === deviceId)) {
      return Promise.reject(new Error(`No MIDI device with id "${deviceId}"`));
    }
    this.connectedId = deviceId;
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.connectedId = null;
    return Promise.resolve();
  }

  onNoteOn(listener: MidiNoteListener): Unsubscribe {
    return subscribe(this.noteOn, listener);
  }

  onNoteOff(listener: MidiNoteListener): Unsubscribe {
    return subscribe(this.noteOff, listener);
  }

  emitNoteOn(note: number, options: FakeNoteOptions = {}): void {
    this.emit(this.noteOn, note, { velocity: 100, ...options });
  }

  emitNoteOff(note: number, options: FakeNoteOptions = {}): void {
    this.emit(this.noteOff, note, { velocity: 0, ...options });
  }

  private emit(listeners: Set<MidiNoteListener>, note: number, options: FakeNoteOptions): void {
    if (this.connectedId === null) {
      throw new Error('FakeMidiInput: connect() before emitting notes');
    }
    if (!Number.isInteger(note) || note < 0 || note > 127) {
      throw new RangeError(`MIDI note must be 0-127, got ${note}`);
    }
    const event: MidiNoteEvent = {
      note,
      velocity: options.velocity ?? 0,
      channel: options.channel ?? 0,
      time: options.time ?? 0,
      deviceId: this.connectedId,
    };
    for (const listener of [...listeners]) listener(event);
  }
}

function subscribe(listeners: Set<MidiNoteListener>, listener: MidiNoteListener): Unsubscribe {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
