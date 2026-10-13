import { describe, expect, it, vi } from 'vitest';
import { FAKE_DEVICE, FakeMidiInput, type MidiInput, type MidiNoteEvent } from './index';

async function connected(): Promise<FakeMidiInput> {
  const midi = new FakeMidiInput();
  await midi.connect(FAKE_DEVICE.id);
  return midi;
}

describe('FakeMidiInput', () => {
  it('implements MidiInput and lists its devices', async () => {
    const midi: MidiInput = new FakeMidiInput();
    expect(await midi.listDevices()).toEqual([FAKE_DEVICE]);
  });

  it('rejects unknown devices', async () => {
    const midi = new FakeMidiInput();
    await expect(midi.connect('nope')).rejects.toThrow(/nope/);
    expect(midi.connectedDeviceId).toBeNull();
  });

  it('emits note-on and note-off events to listeners', async () => {
    const midi = await connected();
    const on = vi.fn<(e: MidiNoteEvent) => void>();
    const off = vi.fn<(e: MidiNoteEvent) => void>();
    midi.onNoteOn(on);
    midi.onNoteOff(off);

    midi.emitNoteOn(60, { velocity: 90, time: 1.25 });
    midi.emitNoteOff(60, { time: 1.75 });

    expect(on).toHaveBeenCalledExactlyOnceWith({
      note: 60,
      velocity: 90,
      channel: 0,
      time: 1.25,
      deviceId: FAKE_DEVICE.id,
    });
    expect(off).toHaveBeenCalledExactlyOnceWith({
      note: 60,
      velocity: 0,
      channel: 0,
      time: 1.75,
      deviceId: FAKE_DEVICE.id,
    });
  });

  it('uses a default velocity for note-on', async () => {
    const midi = await connected();
    const on = vi.fn<(e: MidiNoteEvent) => void>();
    midi.onNoteOn(on);
    midi.emitNoteOn(64);
    expect(on.mock.calls[0]?.[0].velocity).toBe(100);
  });

  it('stops calling a listener after unsubscribe', async () => {
    const midi = await connected();
    const on = vi.fn<(e: MidiNoteEvent) => void>();
    const unsubscribe = midi.onNoteOn(on);
    midi.emitNoteOn(60);
    unsubscribe();
    midi.emitNoteOn(62);
    expect(on).toHaveBeenCalledTimes(1);
  });

  it('refuses to emit when disconnected', async () => {
    const midi = await connected();
    await midi.disconnect();
    expect(midi.connectedDeviceId).toBeNull();
    expect(() => midi.emitNoteOn(60)).toThrow(/connect/);
  });

  it('rejects notes outside 0-127', async () => {
    const midi = await connected();
    expect(() => midi.emitNoteOn(128)).toThrow(RangeError);
    expect(() => midi.emitNoteOff(-1)).toThrow(RangeError);
  });
});
