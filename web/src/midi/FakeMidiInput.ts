import {
  PEDAL_DOWN_AT,
  type MidiDevice,
  type MidiDevicesListener,
  type MidiInput,
  type MidiNoteEvent,
  type MidiNoteListener,
  type MidiPedalListener,
  type Unsubscribe,
} from './MidiInput';

export const FAKE_DEVICE: MidiDevice = { id: 'fake-keyboard', name: 'Fake keyboard' };

export interface FakeNoteOptions {
  velocity?: number;
  channel?: number;
  /** Audio-clock seconds. */
  time?: number;
}

/**
 * In-memory `MidiInput` for tests: `emitNoteOn`, `emitNoteOff` and `emitPedal` play it,
 * and `setDevices` plugs keyboards in or out.
 */
export class FakeMidiInput implements MidiInput {
  private readonly devices: MidiDevice[];
  private readonly noteOn = new Set<MidiNoteListener>();
  private readonly noteOff = new Set<MidiNoteListener>();
  private readonly pedal = new Set<MidiPedalListener>();
  private readonly devicesChanged = new Set<MidiDevicesListener>();
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

  onPedal(listener: MidiPedalListener): Unsubscribe {
    return subscribe(this.pedal, listener);
  }

  onDevicesChanged(listener: MidiDevicesListener): Unsubscribe {
    return subscribe(this.devicesChanged, listener);
  }

  /** Press (value 64 or more) or lift the sustain pedal. */
  emitPedal(value: number, options: Omit<FakeNoteOptions, 'velocity'> = {}): void {
    const deviceId = this.requireConnected();
    const event = {
      down: value >= PEDAL_DOWN_AT,
      value,
      channel: options.channel ?? 0,
      time: options.time ?? 0,
      deviceId,
    };
    for (const listener of [...this.pedal]) listener(event);
  }

  /**
   * Plug keyboards in or out: the list becomes `devices` and listeners hear about it. Like
   * the real adapter, a connected device that goes stays connected until the caller
   * disconnects.
   */
  setDevices(devices: MidiDevice[]): void {
    this.devices.splice(0, this.devices.length, ...devices);
    for (const listener of [...this.devicesChanged]) listener([...this.devices]);
  }

  emitNoteOn(note: number, options: FakeNoteOptions = {}): void {
    this.emit(this.noteOn, note, { velocity: 100, ...options });
  }

  emitNoteOff(note: number, options: FakeNoteOptions = {}): void {
    this.emit(this.noteOff, note, { velocity: 0, ...options });
  }

  private requireConnected(): string {
    if (this.connectedId === null) throw new Error('FakeMidiInput: connect() before emitting notes');
    return this.connectedId;
  }

  private emit(listeners: Set<MidiNoteListener>, note: number, options: FakeNoteOptions): void {
    const deviceId = this.requireConnected();
    if (!Number.isInteger(note) || note < 0 || note > 127) {
      throw new RangeError(`MIDI note must be 0-127, got ${note}`);
    }
    const event: MidiNoteEvent = {
      note,
      velocity: options.velocity ?? 0,
      channel: options.channel ?? 0,
      time: options.time ?? 0,
      deviceId,
    };
    for (const listener of [...listeners]) listener(event);
  }
}

function subscribe<T>(listeners: Set<T>, listener: T): Unsubscribe {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
