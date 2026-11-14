import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './engine';
import { FakeInstrument } from './FakeInstrument';
import { FakeTransport } from './FakeTransport';
import { instrumentPart } from './parts';
import { DEFAULT_SAMPLES_URL, salamanderUrls } from './tone';
import type { LoadedAudio } from './types';
import { SwitchableInstrument } from './voices';

function fakeAudio(): LoadedAudio {
  return {
    transport: new FakeTransport(),
    piano: new SwitchableInstrument(new FakeInstrument(), () => new FakeInstrument()),
    metronome: new FakeInstrument('synth'),
    clock: { now: () => 42, fromDomTimestamp: (ms) => ms / 1000 + 1 },
  };
}

/** A fake AudioContext that records when it was created and resumed. */
function fakeContext(log: string[] = []) {
  return {
    log,
    resume: vi.fn(() => {
      log.push('resume');
      return Promise.resolve();
    }),
  };
}

function engineWith(load: () => Promise<LoadedAudio>, log: string[] = []) {
  const context = fakeContext(log);
  const createContext = vi.fn(() => {
    log.push('create');
    return context;
  });
  return { engine: new AudioEngine({ createContext, load }), context, createContext, log };
}

describe('AudioEngine', () => {
  it('creates and resumes the audio context synchronously inside load()', async () => {
    // WebKit only starts audio begun inside the click, so nothing may be awaited first.
    const log: string[] = [];
    const { engine, context } = engineWith(() => {
      log.push('load');
      return Promise.resolve(fakeAudio());
    }, log);
    const pending = engine.load();
    expect(log).toEqual(['create', 'resume', 'load']); // all before load() returned
    expect(context.resume).toHaveBeenCalledTimes(1);
    await pending;
  });

  it('passes the context it created to the loader', async () => {
    const context = fakeContext();
    const load = vi.fn((given: typeof context) => {
      expect(given).toBe(context);
      return Promise.resolve(fakeAudio());
    });
    await new AudioEngine({ createContext: () => context, load }).load();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('resumes the same context again on every later call, so a second click wakes it', async () => {
    const { engine, context, createContext } = engineWith(() => Promise.resolve(fakeAudio()));
    await engine.load();
    void engine.load();
    void engine.load();
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(context.resume).toHaveBeenCalledTimes(3);
  });

  it('keeps loading when the browser refuses to resume yet', async () => {
    const context = { resume: vi.fn(() => Promise.reject(new Error('not allowed'))) };
    const engine = new AudioEngine({
      createContext: () => context,
      load: () => Promise.resolve(fakeAudio()),
    });
    await expect(engine.load()).resolves.toBeDefined();
  });

  it('rejects, and can retry, when no audio context can be created', async () => {
    const createContext = vi
      .fn<() => ReturnType<typeof fakeContext>>()
      .mockImplementationOnce(() => {
        throw new Error('no audio device');
      })
      .mockImplementation(() => fakeContext());
    const engine = new AudioEngine({ createContext, load: () => Promise.resolve(fakeAudio()) });
    await expect(engine.load()).rejects.toThrow('no audio device');
    await expect(engine.load()).resolves.toBeDefined();
    expect(createContext).toHaveBeenCalledTimes(2);
  });

  it('has a clock that reads 0 until audio loads, then delegates', async () => {
    const { engine } = engineWith(() => Promise.resolve(fakeAudio()));
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
    const { engine } = engineWith(loader);
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
    const { engine } = engineWith(loader);
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

describe('FakeTransport clocks', () => {
  it('keeps the audio clock running while paused, and through a seek', () => {
    const transport = new FakeTransport(100);
    const times: number[] = [];
    transport.schedule(1, (t) => times.push(t));
    transport.schedule(5, (t) => times.push(t));
    transport.start();
    transport.advanceTo(2);
    expect(transport.audioTime).toBe(102);
    transport.pause();
    transport.wait(3); // paused: the position stays, real time passes
    expect(transport.seconds).toBe(2);
    expect(transport.clock.now()).toBe(105);
    transport.seek(4.5);
    transport.start();
    transport.wait(1); // started: both move
    expect(transport.seconds).toBe(5.5);
    expect(times).toEqual([101, 105.5]);
  });

  it('takes its lookahead to start, once', () => {
    const transport = new FakeTransport(100);
    transport.lookahead = 0.1;
    transport.start();
    transport.start();
    expect(transport.audioTime).toBeCloseTo(100.1);
    expect(transport.clock.fromDomTimestamp(123)).toBeCloseTo(100.1);
  });

  it('fires an event again when it starts on that event', () => {
    const transport = new FakeTransport();
    let fired = 0;
    transport.schedule(1, () => {
      fired++;
      transport.pause();
    });
    transport.start();
    transport.advanceTo(3);
    expect(transport.seconds).toBe(1);
    transport.start();
    transport.advanceTo(3);
    expect(fired).toBe(2);
  });
});

describe('FakeTransport and events scheduled from a callback', () => {
  it('fires an event a callback schedules for later in the same advance', () => {
    const transport = new FakeTransport();
    const fired: number[] = [];
    transport.schedule(1, () => {
      fired.push(1);
      transport.schedule(2, () => fired.push(2));
      transport.schedule(0.5, () => fired.push(0.5)); // already passed
      transport.schedule(1, () => fired.push(1.1)); // this moment is already being processed
    });
    transport.start();
    transport.advanceTo(3);
    expect(fired).toEqual([1, 2]);
  });

  it('does not fire an event a callback clears', () => {
    const transport = new FakeTransport();
    const fired: number[] = [];
    const later = transport.schedule(2, () => fired.push(2));
    transport.schedule(1, () => transport.clear(later));
    transport.start();
    transport.advanceTo(3);
    expect(fired).toEqual([]);
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

describe('instrumentPart', () => {
  const offs = (piano: FakeInstrument) => piano.calls.filter((c) => c.type === 'off');

  it('hands back the same part for the same instrument and owner', () => {
    const piano = new FakeInstrument();
    expect(instrumentPart(piano, 'isai')).toBe(instrumentPart(piano, 'isai'));
    expect(instrumentPart(piano, 'isai')).not.toBe(instrumentPart(piano, 'learner'));
    expect(instrumentPart(new FakeInstrument(), 'isai')).not.toBe(instrumentPart(piano, 'isai'));
    expect(instrumentPart(piano, 'isai').loaded).toBe(piano.loaded);
  });

  it('plays and releases a note like the instrument itself', () => {
    const piano = new FakeInstrument();
    const isai = instrumentPart(piano, 'isai');
    isai.noteOn(60, 90, 1);
    isai.noteOff(60, 2);
    expect(piano.calls).toEqual([
      { type: 'on', midi: 60, velocity: 90, time: 1 },
      { type: 'off', midi: 60, time: 2 },
    ]);
  });

  it('keeps a key sounding until every part has let go of it', () => {
    const piano = new FakeInstrument();
    const isai = instrumentPart(piano, 'isai');
    const learner = instrumentPart(piano, 'learner');
    isai.noteOn(60, 80, 1);
    learner.noteOn(60, 100);
    isai.noteOff(60, 2); // the learner still holds the key
    expect(offs(piano)).toEqual([]);
    expect(piano.sounding.has(60)).toBe(true);
    learner.noteOff(60);
    expect(offs(piano)).toEqual([{ type: 'off', midi: 60, time: undefined }]);
    // ...and the other way round.
    learner.noteOn(62, 100);
    isai.noteOn(62, 80, 3);
    learner.noteOff(62);
    expect(piano.sounding.has(62)).toBe(true);
    isai.noteOff(62, 4);
    expect(piano.sounding.has(62)).toBe(false);
  });

  it('ignores a note-off for a key the part is not holding', () => {
    const piano = new FakeInstrument();
    const isai = instrumentPart(piano, 'isai');
    const learner = instrumentPart(piano, 'learner');
    learner.noteOn(60, 100);
    isai.noteOff(60, 1);
    isai.noteOff(200, 1);
    expect(offs(piano)).toEqual([]);
    learner.noteOff(60);
    learner.noteOff(60);
    expect(offs(piano)).toHaveLength(1);
  });

  it('counts a key struck twice by one part once', () => {
    const piano = new FakeInstrument();
    const isai = instrumentPart(piano, 'isai');
    isai.noteOn(60, 80, 1);
    isai.noteOn(60, 80, 2);
    isai.noteOff(60, 3);
    expect(piano.sounding.has(60)).toBe(false);
    expect(piano.calls.filter((c) => c.type === 'on')).toHaveLength(2);
  });

  it('releaseAll only stops what the part started', () => {
    const piano = new FakeInstrument();
    const isai = instrumentPart(piano, 'isai');
    const learner = instrumentPart(piano, 'learner');
    isai.noteOn(48, 80, 1);
    isai.noteOn(60, 80, 1);
    learner.noteOn(60, 100);
    learner.noteOn(72, 100);
    isai.releaseAll(5);
    expect(offs(piano)).toEqual([{ type: 'off', midi: 48, time: 5 }]);
    expect([...piano.sounding].sort()).toEqual([60, 72]);
    expect(piano.calls.some((c) => c.type === 'releaseAll')).toBe(false);
    learner.releaseAll();
    expect(piano.sounding.size).toBe(0);
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
