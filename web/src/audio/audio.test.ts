import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './engine';
import { FakeInstrument } from './FakeInstrument';
import { FakeTransport } from './FakeTransport';
import { DEFAULT_SAMPLES_URL, salamanderUrls } from './tone';
import type { LoadedAudio } from './types';

function fakeAudio(): LoadedAudio {
  return {
    transport: new FakeTransport(),
    piano: new FakeInstrument(),
    clock: { now: () => 42, fromDomTimestamp: (ms) => ms / 1000 + 1 },
  };
}

describe('AudioEngine', () => {
  it('has a clock that reads 0 until audio loads, then delegates', async () => {
    const engine = new AudioEngine(() => Promise.resolve(fakeAudio()));
    expect(engine.clock.now()).toBe(0);
    expect(engine.clock.fromDomTimestamp(5000)).toBe(0);
    expect(engine.loaded).toBeNull();
    await engine.load();
    expect(engine.clock.now()).toBe(42);
    expect(engine.clock.fromDomTimestamp(5000)).toBe(6);
    expect(engine.loaded).not.toBeNull();
  });

  it('loads once for concurrent and later calls', async () => {
    const loader = vi.fn(() => Promise.resolve(fakeAudio()));
    const engine = new AudioEngine(loader);
    const [a, b] = await Promise.all([engine.load(), engine.load()]);
    expect(a).toBe(b);
    expect(await engine.load()).toBe(a);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('can retry after a failed load', async () => {
    const loader = vi
      .fn<() => Promise<LoadedAudio>>()
      .mockRejectedValueOnce(new Error('no audio device'))
      .mockResolvedValue(fakeAudio());
    const engine = new AudioEngine(loader);
    await expect(engine.load()).rejects.toThrow('no audio device');
    expect(engine.loaded).toBeNull();
    await expect(engine.load()).resolves.toBeDefined();
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe('FakeTransport', () => {
  it('fires due events in time order with audio-clock times, only while started', () => {
    const transport = new FakeTransport(100);
    const fired: [string, number][] = [];
    transport.schedule(1, (t) => fired.push(['b', t]));
    transport.schedule(0, (t) => fired.push(['a', t]));
    transport.schedule(3, (t) => fired.push(['c', t]));

    transport.advanceTo(5); // stopped: nothing moves
    expect(fired).toEqual([]);
    transport.start();
    transport.advanceTo(2);
    expect(fired).toEqual([
      ['a', 100],
      ['b', 101],
    ]);
    expect(transport.seconds).toBe(2);
    transport.pause();
    transport.advanceBy(5);
    expect(transport.seconds).toBe(2);
  });

  it('stops an advance when a callback stops the transport', () => {
    const transport = new FakeTransport();
    const fired: number[] = [];
    transport.schedule(1, () => transport.stop());
    transport.schedule(2, () => fired.push(2));
    transport.start();
    transport.advanceTo(3);
    expect(fired).toEqual([]);
    expect(transport.state).toBe('stopped');
    expect(transport.seconds).toBe(0);
  });

  it('seeks without firing skipped events and skips cleared ones', () => {
    const transport = new FakeTransport();
    const fired: number[] = [];
    transport.schedule(1, () => fired.push(1));
    const id = transport.schedule(3, () => fired.push(3));
    transport.schedule(4, () => fired.push(4));
    transport.clear(id);
    transport.seek(2);
    transport.start();
    transport.advanceTo(5);
    expect(fired).toEqual([4]);
    expect(transport.scheduledCount).toBe(2);
  });
});

describe('FakeInstrument', () => {
  it('tracks what is sounding', async () => {
    const piano = new FakeInstrument('synth');
    expect(await piano.loaded).toBe('synth');
    piano.noteOn(60, 90, 1);
    piano.noteOn(64, 90);
    piano.noteOff(60, 2);
    expect([...piano.sounding]).toEqual([64]);
    piano.releaseAll();
    expect(piano.sounding.size).toBe(0);
    expect(piano.calls.map((c) => c.type)).toEqual(['on', 'on', 'off', 'releaseAll']);
  });
});

describe('salamanderUrls', () => {
  it('covers A0 to C8 every minor third', () => {
    const urls = salamanderUrls();
    expect(Object.keys(urls)).toHaveLength(30);
    expect(urls.A0).toBe('A0.mp3');
    expect(urls['D#4']).toBe('Ds4.mp3');
    expect(urls['F#7']).toBe('Fs7.mp3');
    expect(urls.C8).toBe('C8.mp3');
    expect(DEFAULT_SAMPLES_URL).toMatch(/^https:\/\/tonejs\.github\.io\/audio\/salamander\/$/);
  });
});
