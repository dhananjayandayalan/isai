import { describe, expect, it, vi } from 'vitest';
import type { AudioClock } from './AudioClock';
import type { MidiNoteEvent } from './MidiInput';
import {
  browserMidiAccess,
  MidiError,
  WebMidiInput,
  type MidiAccessLike,
  type MidiInputPortLike,
  type MidiMessageLike,
  type RequestMidiAccess,
} from './WebMidiInput';

class FakePort implements MidiInputPortLike {
  onmidimessage: ((event: MidiMessageLike) => void) | null = null;
  state = 'connected';
  opened = false;
  failOpen = false;
  readonly id: string;
  readonly name: string | null;
  readonly manufacturer: string | null;

  constructor(id: string, name: string | null = 'Digital piano', manufacturer: string | null = 'Acme') {
    this.id = id;
    this.name = name;
    this.manufacturer = manufacturer;
  }

  open(): Promise<unknown> {
    if (this.failOpen) return Promise.reject(new DOMException('busy', 'InvalidAccessError'));
    this.opened = true;
    return Promise.resolve(this);
  }

  close(): Promise<unknown> {
    this.opened = false;
    return Promise.resolve(this);
  }

  send(bytes: number[], timeStamp = 1000): void {
    this.onmidimessage?.({ data: new Uint8Array(bytes), timeStamp });
  }
}

/** Audio clock 10 s ahead of the DOM clock's origin. */
const clock: AudioClock = {
  now: () => 99,
  fromDomTimestamp: (ms) => 10 + ms / 1000,
};

function setup(ports: FakePort[] = [new FakePort('in-1')]) {
  const access: MidiAccessLike = { inputs: new Map(ports.map((p) => [p.id, p])) };
  const request = vi.fn<RequestMidiAccess>(() => Promise.resolve(access));
  const midi = new WebMidiInput(clock, request);
  const ons: MidiNoteEvent[] = [];
  const offs: MidiNoteEvent[] = [];
  midi.onNoteOn((e) => ons.push(e));
  midi.onNoteOff((e) => offs.push(e));
  return { midi, request, ports, ons, offs };
}

async function expectMidiError(promise: Promise<unknown>, kind: MidiError['kind']) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(MidiError);
  expect((error as MidiError).kind).toBe(kind);
}

describe('WebMidiInput devices', () => {
  it('lists connected inputs and requests access without SysEx, once', async () => {
    const unplugged = new FakePort('in-2', 'Old keyboard');
    unplugged.state = 'disconnected';
    const { midi, request } = setup([
      new FakePort('in-1'),
      unplugged,
      new FakePort('in-3', null, null),
    ]);
    expect(await midi.listDevices()).toEqual([
      { id: 'in-1', name: 'Digital piano', manufacturer: 'Acme' },
      { id: 'in-3', name: 'MIDI keyboard' },
    ]);
    await midi.listDevices();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({ sysex: false });
  });

  it('connects, opens the port and reports the device', async () => {
    const { midi, ports } = setup();
    await midi.connect('in-1');
    expect(ports[0]?.opened).toBe(true);
    expect(midi.connectedDeviceId).toBe('in-1');
  });

  it('switching devices closes the previous port', async () => {
    const { midi, ports } = setup([new FakePort('a'), new FakePort('b')]);
    await midi.connect('a');
    await midi.connect('b');
    expect(ports[0]?.opened).toBe(false);
    expect(ports[0]?.onmidimessage).toBeNull();
    expect(midi.connectedDeviceId).toBe('b');
  });

  it('disconnect removes the handler and keeps listeners for the next connect', async () => {
    const { midi, ports, ons } = setup();
    await midi.connect('in-1');
    await midi.disconnect();
    expect(ports[0]?.onmidimessage).toBeNull();
    expect(ports[0]?.opened).toBe(false);
    expect(midi.connectedDeviceId).toBeNull();
    await midi.disconnect(); // no-op when not connected

    await midi.connect('in-1');
    ports[0]?.send([0x90, 60, 80]);
    expect(ons).toHaveLength(1);
  });
});

describe('WebMidiInput notes', () => {
  it('emits note-on and note-off with channel, velocity and audio-clock time', async () => {
    const { midi, ports, ons, offs } = setup();
    await midi.connect('in-1');
    ports[0]?.send([0x93, 60, 100], 2500);
    ports[0]?.send([0x83, 60, 40], 3000);
    expect(ons).toEqual([{ note: 60, velocity: 100, channel: 3, time: 12.5, deviceId: 'in-1' }]);
    expect(offs).toEqual([{ note: 60, velocity: 40, channel: 3, time: 13, deviceId: 'in-1' }]);
  });

  it('treats note-on with velocity 0 as note-off', async () => {
    const { midi, ports, ons, offs } = setup();
    await midi.connect('in-1');
    ports[0]?.send([0x90, 64, 0]);
    expect(ons).toHaveLength(0);
    expect(offs.map((e) => [e.note, e.velocity])).toEqual([[64, 0]]);
  });

  it('listens on every channel', async () => {
    const { midi, ports, ons } = setup();
    await midi.connect('in-1');
    for (let ch = 0; ch < 16; ch++) ports[0]?.send([0x90 | ch, 60, 1]);
    expect(ons.map((e) => e.channel)).toEqual([...Array(16).keys()]);
  });

  it('ignores CC, pitch bend, clock, SysEx, short and empty messages', async () => {
    const { midi, ports, ons, offs } = setup();
    await midi.connect('in-1');
    const port = ports[0];
    port?.send([0xb0, 64, 127]); // sustain pedal
    port?.send([0xe0, 0, 64]); // pitch bend
    port?.send([0xf8]); // clock
    port?.send([0xf0, 0x7e, 0x7f, 0xf7]); // SysEx
    port?.send([0x90, 60]); // truncated
    port?.onmidimessage?.({ data: null, timeStamp: 1 });
    expect(ons).toHaveLength(0);
    expect(offs).toHaveLength(0);
  });

  it('falls back to the current audio time when the event has no timestamp', async () => {
    const { midi, ports, ons } = setup();
    await midi.connect('in-1');
    ports[0]?.send([0x90, 60, 90], 0);
    expect(ons[0]?.time).toBe(99);
  });

  it('stops delivering to unsubscribed listeners', async () => {
    const { midi, ports } = setup();
    const seen: number[] = [];
    const unsubscribe = midi.onNoteOn((e) => seen.push(e.note));
    await midi.connect('in-1');
    ports[0]?.send([0x90, 60, 90]);
    unsubscribe();
    ports[0]?.send([0x90, 62, 90]);
    expect(seen).toEqual([60]);
  });
});

describe('browserMidiAccess', () => {
  it('is undefined without Web MIDI (Safari, iOS)', () => {
    vi.stubGlobal('navigator', {});
    expect(browserMidiAccess()).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('wraps navigator.requestMIDIAccess', async () => {
    const access: MidiAccessLike = { inputs: new Map() };
    const requestMIDIAccess = vi.fn(() => Promise.resolve(access));
    vi.stubGlobal('navigator', { requestMIDIAccess });
    const request = browserMidiAccess();
    expect(await request?.({ sysex: false })).toBe(access);
    expect(requestMIDIAccess).toHaveBeenCalledWith({ sysex: false });
    vi.unstubAllGlobals();
  });
});

describe('WebMidiInput errors', () => {
  it('reports an unsupported browser', async () => {
    const midi = new WebMidiInput(clock, undefined);
    await expectMidiError(midi.listDevices(), 'unsupported');
    await expectMidiError(midi.connect('x'), 'unsupported');
  });

  it('reports blocked permission and retries on the next call', async () => {
    const access: MidiAccessLike = { inputs: new Map([['in-1', new FakePort('in-1')]]) };
    const request = vi
      .fn<RequestMidiAccess>()
      .mockRejectedValueOnce(new DOMException('denied', 'SecurityError'))
      .mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
      .mockResolvedValue(access);
    const midi = new WebMidiInput(clock, request);
    await expectMidiError(midi.listDevices(), 'blocked');
    await expectMidiError(midi.listDevices(), 'blocked');
    expect(await midi.listDevices()).toHaveLength(1);
  });

  it('reports other access failures as failed', async () => {
    const midi = new WebMidiInput(clock, () => Promise.reject(new Error('driver crashed')));
    await expectMidiError(midi.listDevices(), 'failed');
  });

  it('rejects unknown and unplugged devices', async () => {
    const unplugged = new FakePort('gone');
    const { midi } = setup([new FakePort('in-1'), unplugged]);
    await expectMidiError(midi.connect('nope'), 'unknown-device');
    unplugged.state = 'disconnected';
    await expectMidiError(midi.connect('gone'), 'unknown-device');
  });

  it('reports a busy device and stays disconnected', async () => {
    const busy = new FakePort('in-1');
    busy.failOpen = true;
    const { midi } = setup([busy]);
    await expectMidiError(midi.connect('in-1'), 'busy');
    expect(midi.connectedDeviceId).toBeNull();
    expect(busy.onmidimessage).toBeNull();
  });
});
