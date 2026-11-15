import { describe, expect, it } from 'vitest';
import { FakeInstrument } from '../audio/FakeInstrument';
import type { Instrument } from '../audio/types';
import type { VelocityCurve } from '../audio/velocity';
import { FakeMidiInput } from '../midi/FakeMidiInput';
import { monitorMidi } from './monitor';

async function setup(initial: { enabled?: boolean; loaded?: boolean } = {}) {
  const midi = new FakeMidiInput();
  await midi.connect('fake-keyboard');
  const piano = new FakeInstrument();
  const state = { enabled: initial.enabled ?? true, loaded: initial.loaded ?? true, curve: 'normal' as VelocityCurve };
  const stop = monitorMidi(midi, {
    instrument: (): Instrument | null => (state.loaded ? piano : null),
    enabled: () => state.enabled,
    velocityCurve: () => state.curve,
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

  it('shapes your touch with the velocity curve, read on every note', async () => {
    const { midi, piano, state } = await setup();
    midi.emitNoteOn(60, { velocity: 32 });
    state.curve = 'soft';
    midi.emitNoteOn(62, { velocity: 32 });
    state.curve = 'hard';
    midi.emitNoteOn(64, { velocity: 32 });
    expect(piano.calls.map((c) => (c.type === 'on' ? c.velocity : null))).toEqual([32, 56, 14]);
  });

  it('plays at normal velocity when no curve is given', async () => {
    const midi = new FakeMidiInput();
    await midi.connect('fake-keyboard');
    const piano = new FakeInstrument();
    monitorMidi(midi, { instrument: () => piano, enabled: () => true });
    midi.emitNoteOn(60, { velocity: 32 });
    expect(piano.calls[0]).toMatchObject({ velocity: 32 });
  });
});

describe('monitorMidi with the sustain pedal', () => {
  it('holds notes let go while the pedal is down, until it comes up', async () => {
    const { midi, piano } = await setup();
    midi.emitPedal(127);
    midi.emitNoteOn(60);
    midi.emitNoteOn(64);
    midi.emitNoteOff(60);
    midi.emitNoteOff(64);
    expect([...piano.sounding]).toEqual([60, 64]);
    midi.emitPedal(0);
    expect(piano.sounding.size).toBe(0);
  });

  it('lets a key still held at pedal-up keep sounding until it is let go', async () => {
    const { midi, piano } = await setup();
    midi.emitPedal(100);
    midi.emitNoteOn(60);
    midi.emitPedal(10);
    expect(piano.sounding.has(60)).toBe(true);
    midi.emitNoteOff(60);
    expect(piano.sounding.has(60)).toBe(false);
  });

  it('ends a held note before a key struck again under the pedal', async () => {
    const { midi, piano } = await setup();
    midi.emitPedal(127);
    midi.emitNoteOn(60);
    midi.emitNoteOff(60);
    midi.emitNoteOn(60);
    expect(piano.calls.map((c) => c.type)).toEqual(['on', 'off', 'on']);
    midi.emitNoteOff(60);
    midi.emitPedal(0);
    expect(piano.sounding.size).toBe(0);
  });

  it('sustains only notes it played, and releases sustained notes when unsubscribed', async () => {
    const { midi, piano, state, stop } = await setup();
    midi.emitPedal(127);
    state.enabled = false;
    midi.emitNoteOn(62); // not played: the toggle is off
    midi.emitNoteOff(62);
    state.enabled = true;
    midi.emitNoteOn(60);
    midi.emitNoteOff(60);
    expect([...piano.sounding]).toEqual([60]);
    stop();
    expect(piano.sounding.size).toBe(0);
    expect(piano.calls.filter((c) => c.type !== 'releaseAll' && c.midi === 62)).toEqual([]);
  });
});
