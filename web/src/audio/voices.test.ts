import { describe, expect, it } from 'vitest';
import { FakeInstrument } from './FakeInstrument';
import { instrumentPart } from './parts';
import { applyVelocityCurve, CURVE_GAMMA } from './velocity';
import { SwitchableInstrument } from './voices';

function voices() {
  const grand = new FakeInstrument('sampled');
  const electric = new FakeInstrument('sampled');
  let created = 0;
  const piano = new SwitchableInstrument(grand, () => {
    created++;
    return electric;
  });
  return { grand, electric, piano, created: () => created };
}

describe('SwitchableInstrument', () => {
  it('plays the grand piano until another voice is chosen', async () => {
    const { grand, electric, piano, created } = voices();
    expect(piano.voice).toBe('grand');
    expect(await piano.loaded).toBe('sampled');
    piano.noteOn(60, 90, 1);
    piano.noteOff(60, 2);
    expect(grand.calls).toHaveLength(2);
    expect(electric.calls).toHaveLength(0);
    expect(created()).toBe(0); // the electric piano isn't loaded until it is chosen
  });

  it('loads the electric piano when chosen, once, and releases what the old voice held', async () => {
    const { grand, electric, piano, created } = voices();
    piano.noteOn(60, 90);
    expect(await piano.select('electric')).toBe('sampled');
    expect(piano.voice).toBe('electric');
    expect(grand.sounding.size).toBe(0);
    piano.noteOn(64, 80, 3);
    piano.releaseAll(4);
    expect(electric.calls.map((c) => c.type)).toEqual(['on', 'releaseAll']);
    await piano.select('grand');
    await piano.select('electric');
    expect(created()).toBe(1);
    await piano.select('electric'); // no change: nothing released
    expect(electric.calls.filter((c) => c.type === 'releaseAll')).toHaveLength(2);
  });

  it('reports the loading state of the voice in use, through parts too', async () => {
    const grand = new FakeInstrument('sampled');
    const electric = new FakeInstrument('synth');
    const piano = new SwitchableInstrument(grand, () => electric);
    const part = instrumentPart(piano, 'learner');
    expect(await part.loaded).toBe('sampled');
    await piano.select('electric');
    expect(await part.loaded).toBe('synth');
  });
});

describe('velocity curves', () => {
  it('leaves normal alone, lifts a light touch on soft and lowers it on hard', () => {
    expect(applyVelocityCurve(64, 'normal')).toBe(64);
    expect(applyVelocityCurve(32, 'soft')).toBe(56);
    expect(applyVelocityCurve(32, 'hard')).toBe(14);
    expect(CURVE_GAMMA).toEqual({ soft: 0.6, normal: 1, hard: 1.6 });
  });

  it('keeps the ends: 127 stays 127, and nothing drops below 1', () => {
    for (const curve of ['soft', 'normal', 'hard'] as const) {
      expect(applyVelocityCurve(127, curve)).toBe(127);
      expect(applyVelocityCurve(1, curve)).toBeGreaterThanOrEqual(1);
      expect(applyVelocityCurve(0, curve)).toBeGreaterThanOrEqual(1);
      expect(applyVelocityCurve(200, curve)).toBe(127);
    }
  });

  it('never changes the order of two touches', () => {
    for (const curve of ['soft', 'hard'] as const) {
      for (let v = 1; v < 127; v++) {
        expect(applyVelocityCurve(v + 1, curve)).toBeGreaterThanOrEqual(applyVelocityCurve(v, curve));
      }
    }
  });
});
