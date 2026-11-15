// `MidiInput` on the browser's Web MIDI API (ADR 0003). The only file that calls
// `navigator.requestMIDIAccess`. Converts event timestamps to the audio clock (rule 6).

import type { AudioClock } from './AudioClock';
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

/** The parts of the Web MIDI API this adapter uses, so tests can supply fakes. */
export interface MidiMessageLike {
  data: Uint8Array | null;
  timeStamp: number;
}

export interface MidiInputPortLike {
  id: string;
  name: string | null;
  manufacturer: string | null;
  state: string;
  onmidimessage: ((event: MidiMessageLike) => void) | null;
  open(): Promise<unknown>;
  close(): Promise<unknown>;
}

export interface MidiAccessLike {
  inputs: ReadonlyMap<string, MidiInputPortLike>;
  /** Fired when any port is plugged in, unplugged, opened or closed. */
  onstatechange?: ((event: unknown) => void) | null;
}

export type RequestMidiAccess = (options: { sysex: boolean }) => Promise<MidiAccessLike>;

/** Base class for every error this adapter raises; `kind` drives the UI state. */
export class MidiError extends Error {
  readonly kind: 'unsupported' | 'blocked' | 'unknown-device' | 'busy' | 'failed';

  constructor(kind: MidiError['kind'], message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MidiError';
    this.kind = kind;
  }
}

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;
const SUSTAIN = 64;

/** Web MIDI as the browser provides it, or undefined (Safari, iOS, Tauri on macOS). */
export function browserMidiAccess(): RequestMidiAccess | undefined {
  if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') {
    return undefined;
  }
  // The DOM types are structurally richer than MidiAccessLike; this is the one boundary.
  return (options) => navigator.requestMIDIAccess(options) as unknown as Promise<MidiAccessLike>;
}

export class WebMidiInput implements MidiInput {
  private readonly requestAccess: RequestMidiAccess | undefined;
  private readonly clock: AudioClock;
  private access: Promise<MidiAccessLike> | null = null;
  private port: MidiInputPortLike | null = null;
  private readonly noteOn = new Set<MidiNoteListener>();
  private readonly noteOff = new Set<MidiNoteListener>();
  private readonly pedal = new Set<MidiPedalListener>();
  private readonly devicesChanged = new Set<MidiDevicesListener>();
  /** The device ids last reported, so opening a port (also a state change) isn't reported. */
  private reported = '';

  constructor(clock: AudioClock, requestAccess: RequestMidiAccess | undefined = browserMidiAccess()) {
    this.clock = clock;
    this.requestAccess = requestAccess;
  }

  get connectedDeviceId(): string | null {
    return this.port?.id ?? null;
  }

  async listDevices(): Promise<MidiDevice[]> {
    const devices = connectedDevices(await this.getAccess());
    this.reported = idsOf(devices);
    return devices;
  }

  async connect(deviceId: string): Promise<void> {
    const access = await this.getAccess();
    const port = access.inputs.get(deviceId);
    if (!port || port.state !== 'connected') {
      throw new MidiError('unknown-device', `No MIDI keyboard with id "${deviceId}"`);
    }
    await this.disconnect();
    try {
      await port.open();
    } catch (cause) {
      // Windows MIDI drivers are exclusive: another app holding the port makes open() fail.
      const name = port.name || 'The MIDI keyboard';
      throw new MidiError('busy', `${name} is in use by another app`, { cause });
    }
    port.onmidimessage = (event) => this.handle(port.id, event);
    this.port = port;
  }

  async disconnect(): Promise<void> {
    const port = this.port;
    if (!port) return;
    this.port = null;
    port.onmidimessage = null;
    await port.close();
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

  /** Report the inputs when the set of them has changed. */
  private stateChanged(access: MidiAccessLike): void {
    const devices = connectedDevices(access);
    const ids = idsOf(devices);
    if (ids === this.reported) return;
    this.reported = ids;
    for (const listener of [...this.devicesChanged]) listener(devices);
  }

  private getAccess(): Promise<MidiAccessLike> {
    if (!this.requestAccess) {
      return Promise.reject(
        new MidiError('unsupported', 'This browser has no Web MIDI. Try Chrome, Edge or Firefox.'),
      );
    }
    if (!this.access) {
      this.access = this.requestAccess({ sysex: false }).then(
        (access) => {
          // What is plugged in now is the baseline; later changes are reported against it.
          this.reported = idsOf(connectedDevices(access));
          access.onstatechange = () => this.stateChanged(access);
          return access;
        },
        (cause: unknown) => {
          this.access = null; // allow a retry after the learner changes the permission
          throw toAccessError(cause);
        },
      );
    }
    return this.access;
  }

  private handle(deviceId: string, message: MidiMessageLike): void {
    const data = message.data;
    if (!data || data.length < 3) return;
    const status = data[0] ?? 0;
    const note = data[1] ?? 0;
    const velocity = data[2] ?? 0;
    const type = status & 0xf0;
    const isOn = type === NOTE_ON && velocity > 0;
    const isOff = type === NOTE_OFF || (type === NOTE_ON && velocity === 0);
    const isPedal = type === CONTROL_CHANGE && note === SUSTAIN;
    // Other controllers, pitch bend, clock, SysEx: not part of MidiInput.
    if (!isOn && !isOff && !isPedal) return;

    // Some platforms leave timeStamp at 0; then "now" on the audio clock is the best guess.
    const time =
      message.timeStamp > 0 ? this.clock.fromDomTimestamp(message.timeStamp) : this.clock.now();
    if (isPedal) {
      const pedal = { down: velocity >= PEDAL_DOWN_AT, value: velocity, channel: status & 0x0f, time, deviceId };
      for (const listener of [...this.pedal]) listener(pedal);
      return;
    }
    const event: MidiNoteEvent = { note, velocity, channel: status & 0x0f, time, deviceId };
    for (const listener of [...(isOn ? this.noteOn : this.noteOff)]) listener(event);
  }
}

function connectedDevices(access: MidiAccessLike): MidiDevice[] {
  return [...access.inputs.values()].filter((port) => port.state === 'connected').map(toDevice);
}

function idsOf(devices: readonly MidiDevice[]): string {
  return devices.map((d) => d.id).join(' ');
}

function toDevice(port: MidiInputPortLike): MidiDevice {
  const device: MidiDevice = { id: port.id, name: port.name || 'MIDI keyboard' };
  if (port.manufacturer) device.manufacturer = port.manufacturer;
  return device;
}

function toAccessError(cause: unknown): MidiError {
  const name = cause instanceof Error ? cause.name : '';
  if (name === 'SecurityError' || name === 'NotAllowedError') {
    return new MidiError('blocked', 'MIDI access was blocked for this site', { cause });
  }
  return new MidiError('failed', 'Could not start MIDI', { cause });
}

function subscribe<T>(listeners: Set<T>, listener: T): Unsubscribe {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
