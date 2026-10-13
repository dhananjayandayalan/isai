import { describe, expect, it } from 'vitest';
import { FakeInstrument } from '../audio/FakeInstrument';
import type { Instrument } from '../audio/types';
import { FakeMidiInput } from '../midi/FakeMidiInput';
import { monitorMidi } from './monitor';

async function setup(initial: { enabled?: boolean; loaded?: boolean } = {}) {
  const midi = new FakeMidiInput();
  await midi.connect('fake-keyboard');
  const piano = new FakeInstrument();
  const state = { enabled: initial.enabled ?? true, loaded: initial.loaded ?? true };
  const stop = monitorMidi(midi, {
    instrument: (): Instrument | null => (state.loaded ? piano : null),
    enabled: () => state.enabled,
  });
  return { midi, piano, state, stop };
}

describe('monitorMidi', () => {
  it('plays your notes now, at your velocity', async () => {
    const { midi, piano } = await setup();
    midi.emitNoteOn(60, { velocity: 70, time: 5 });
    midi.emitNoteOff(60);
    expect(piano.calls).toEqual([
      { type: 'on', midi: 60, velocity: 70, time: undefined },
      { type: 'off', midi: 60, time: undefined },
    ]);
  });

  it('stays quiet when turned off or before audio loads', async () => {
    const off = await setup({ enabled: false });
    off.midi.emitNoteOn(60);
    off.midi.emitNoteOff(60);
    expect(off.piano.calls).toEqual([]);

    const unloaded = await setup({ loaded: false });
    unloaded.midi.emitNoteOn(60);
    unloaded.midi.emitNoteOff(60);
    expect(unloaded.piano.calls).toEqual([]);
  });

  it('still releases a held note after being turned off', async () => {
    const { midi, piano, state } = await setup();
    midi.emitNoteOn(60);
    state.enabled = false;
    midi.emitNoteOff(60);
    expect(piano.sounding.size).toBe(0);
  });

  it('releases held notes and stops listening when unsubscribed', async () => {
    const { midi, piano, stop } = await setup();
    midi.emitNoteOn(60);
    midi.emitNoteOn(64);
    stop();
    expect(piano.sounding.size).toBe(0);
    midi.emitNoteOn(67);
    expect(piano.sounding.size).toBe(0);
  });
});
