import { describe, expect, it } from 'vitest';
import { FakeInstrument } from '../audio/FakeInstrument';
import { FakeTransport } from '../audio/FakeTransport';
import { FakeMidiInput } from '../midi/FakeMidiInput';
import { CALIBRATION, measureOffset, runCalibration, type Measurement } from './calibration';
import {
  DEFAULT_APP_SETTINGS,
  LocalSettingsStore,
  MemorySettingsStore,
  readSettings,
  SETTINGS_KEY,
  SETTINGS_VERSION,
} from './store';

/** A `Storage` that keeps values in a map, or throws on every call. */
function fakeStorage(initial: Record<string, string> = {}, broken = false) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key: string): string | null {
      if (broken) throw new Error('storage is disabled');
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      if (broken) throw new Error('storage is disabled');
      values.set(key, value);
    },
  };
}

describe('settings store', () => {
  it('gives the defaults when nothing is stored', () => {
    const store = new LocalSettingsStore(() => fakeStorage());
    expect(store.load()).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('saves and reads back through a new store (a reload)', () => {
    const storage = fakeStorage();
    const first = new LocalSettingsStore(() => storage);
    first.save({ keyboardSize: 61, lastDeviceId: 'usb-1', appSound: 'electric', velocityCurve: 'hard' });
    first.save({ latencyOffsets: { 'usb-1': 0.022 } });
    first.save({ notation: 'swaras', octaves: true, swaraDetail: 'detailed', minorSolfege: 'la' });
    first.save({ lookahead: 6, metronome: true, showOtherHand: false });
    expect(JSON.parse(storage.values.get(SETTINGS_KEY) ?? '{}')).toMatchObject({ version: 2, keyboardSize: 61 });
    expect(SETTINGS_VERSION).toBe(2);
    const second = new LocalSettingsStore(() => storage);
    expect(second.load()).toEqual({
      keyboardSize: 61,
      lastDeviceId: 'usb-1',
      appSound: 'electric',
      velocityCurve: 'hard',
      latencyOffsets: { 'usb-1': 0.022 },
      notation: 'swaras',
      octaves: true,
      swaraDetail: 'detailed',
      minorSolfege: 'la',
      lookahead: 6,
      metronome: true,
      showOtherHand: false,
    });
  });

  it('migrates a version 1 record: "play my notes" off becomes app sound Off', () => {
    const v1 = { version: 1, keyboardSize: 49, lastDeviceId: 'k', monitor: false, latencyOffsets: { k: 0.01 } };
    const store = new LocalSettingsStore(() => fakeStorage({ [SETTINGS_KEY]: JSON.stringify(v1) }));
    expect(store.load()).toEqual({
      ...DEFAULT_APP_SETTINGS,
      keyboardSize: 49,
      lastDeviceId: 'k',
      appSound: 'off',
      latencyOffsets: { k: 0.01 },
    });
    expect(readSettings({ version: 1, monitor: true }).appSound).toBe('grand');
    // A version 2 app sound wins over a leftover monitor flag.
    expect(readSettings({ appSound: 'electric', monitor: false }).appSound).toBe('electric');
  });

  it('starts from the defaults when the stored text is corrupt', () => {
    const store = new LocalSettingsStore(() => fakeStorage({ [SETTINGS_KEY]: '{not json' }));
    expect(store.load()).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('keeps the good fields of a damaged record and repairs the rest', () => {
    expect(
      readSettings({
        keyboardSize: 73,
        lastDeviceId: 5,
        monitor: 'yes',
        appSound: 'organ',
        velocityCurve: 3,
        notation: 'tabs',
        octaves: 'no',
        swaraDetail: 'long',
        minorSolfege: 'ti',
        lookahead: 'far',
        metronome: 1,
        showOtherHand: null,
        latencyOffsets: { a: 0.05, b: 'slow', c: 9, d: Number.NaN },
      }),
    ).toEqual({ ...DEFAULT_APP_SETTINGS, latencyOffsets: { a: 0.05, c: 0.3 } });
    // The look-ahead is kept within 2-8 seconds.
    expect(readSettings({ lookahead: 30 }).lookahead).toBe(8);
    expect(readSettings({ lookahead: 0.5 }).lookahead).toBe(2);
    expect(readSettings({ lookahead: Number.POSITIVE_INFINITY }).lookahead).toBe(4);
    expect(readSettings('nonsense')).toEqual(DEFAULT_APP_SETTINGS);
    expect(readSettings({ latencyOffsets: null, keyboardSize: 49 }).keyboardSize).toBe(49);
  });

  it('still works when storage throws: settings last for the visit', () => {
    const store = new LocalSettingsStore(() => fakeStorage({}, true));
    expect(store.load()).toEqual(DEFAULT_APP_SETTINGS);
    expect(store.save({ keyboardSize: 49 }).keyboardSize).toBe(49);
    expect(store.load().keyboardSize).toBe(49);
  });

  it('still works when even reaching storage throws (some private modes)', () => {
    const store = new LocalSettingsStore(() => {
      throw new Error('SecurityError');
    });
    expect(store.load()).toEqual(DEFAULT_APP_SETTINGS);
    expect(store.save({ appSound: 'off' }).appSound).toBe('off');
    expect(store.save({ notation: 'staff' })).toMatchObject({ appSound: 'off', notation: 'staff' });
  });

  it('has an in-memory store for tests and static renders', () => {
    const store = new MemorySettingsStore({ keyboardSize: 76 });
    expect(store.load().keyboardSize).toBe(76);
    expect(store.save({ lastDeviceId: 'x' })).toMatchObject({ keyboardSize: 76, lastDeviceId: 'x' });
    expect(store.load().lastDeviceId).toBe('x');
  });
});

const PERIOD = 60 / CALIBRATION.bpm;
const clicksFrom = (first: number, count: number = CALIBRATION.clicks) =>
  Array.from({ length: count }, (_, i) => first + i * PERIOD);

describe('measureOffset', () => {
  it('finds a steady offset, ignoring the lead-in clicks', () => {
    const clicks = clicksFrom(10);
    // Wild taps on the lead-in, then 37 ms late on every click.
    const taps = clicks.map((click, i) => click + (i < CALIBRATION.leadIn ? 0.2 : 0.037));
    const measured = measureOffset(clicks, taps);
    expect(measured?.offset).toBeCloseTo(0.037, 9);
    expect(measured?.taps).toBe(12);
    expect(measured?.spread).toBeCloseTo(0, 9);
  });

  it('measures early taps as a negative offset', () => {
    const clicks = clicksFrom(10);
    expect(measureOffset(clicks, clicks.map((click) => click - 0.02))?.offset).toBeCloseTo(-0.02, 9);
  });

  it('drops slips and takes the median of the rest', () => {
    const clicks = clicksFrom(10);
    const jitter = [0.03, 0.05, 0.04, 0.045, 0.035, 0.04, 0.3, 0.04, -0.2, 0.04, 0.05, 0.03];
    const taps = clicks.slice(CALIBRATION.leadIn).map((click, i) => click + (jitter[i] ?? 0.04));
    const measured = measureOffset(clicks, taps);
    expect(measured?.taps).toBe(10); // the +300 ms and −200 ms slips are out
    expect(measured?.offset).toBeCloseTo(0.04, 9);
    expect(measured?.spread).toBeCloseTo(0.01, 9);
  });

  it('counts one tap per click: the closest', () => {
    const clicks = clicksFrom(10);
    const taps = clicks.slice(CALIBRATION.leadIn).flatMap((click) => [click + 0.01, click + 0.25]);
    const measured = measureOffset(clicks, taps);
    expect(measured?.taps).toBe(12);
    expect(measured?.offset).toBeCloseTo(0.01, 9);
  });

  it('gives nothing with too few taps, or taps all over the place', () => {
    const clicks = clicksFrom(10);
    expect(measureOffset(clicks, [])).toBeNull();
    expect(measureOffset(clicks, clicks.slice(4, 9).map((click) => click + 0.02))).toBeNull();
    const ragged = clicks.slice(4).map((click, i) => click + (i % 2 ? 0.3 : -0.3));
    expect(measureOffset(clicks, ragged)).toBeNull();
    expect(measureOffset([], [1, 2, 3])).toBeNull();
  });

  it('limits the offset to 300 ms', () => {
    const clicks = clicksFrom(10);
    // Everything 320 ms late is nearer the click than the next one (667 ms apart).
    expect(measureOffset(clicks, clicks.map((click) => click + 0.32))?.offset).toBe(0.3);
  });
});

describe('runCalibration', () => {
  function rig(lookahead = 0, outputLatency = 0) {
    const transport = new FakeTransport(100);
    transport.lookahead = lookahead;
    transport.outputLatency = outputLatency;
    const metronome = new FakeInstrument('synth');
    const midi = new FakeMidiInput();
    void midi.connect('fake-keyboard');
    const done: (Measurement | null)[] = [];
    const deps = { transport, metronome, clock: transport.clock, midi };
    /** Run to each click in turn and tap `late(i)` seconds after it (null: no tap). */
    const tapAlong = (count: number, late: (i: number) => number | null) => {
      for (let i = 0; i < count; i++) {
        const offset = late(i);
        if (offset === null) continue;
        transport.advanceTo(CALIBRATION.start + i * PERIOD + Math.max(0, offset));
        midi.emitNoteOn(60, { time: transport.audioTime - Math.max(0, offset) + offset });
      }
    };
    return { transport, metronome, midi, done, deps, tapAlong };
  }
  const clicksOf = (metronome: FakeInstrument) => metronome.calls.filter((c) => c.type === 'on');

  it.each([0.043, -0.025, 0.12, 0])('measures an injected offset of %f s within 5 ms', (injected) => {
    const { transport, metronome, done, deps, tapAlong } = rig();
    runCalibration(deps, { mode: 'calibrate', onDone: (m) => done.push(m) });
    // A learner who is never exactly on it: ±4 ms of wobble around the injected offset.
    tapAlong(CALIBRATION.clicks, (i) => injected + ((i % 3) - 1) * 0.004);
    transport.advanceTo(60);
    expect(done).toHaveLength(1);
    expect(Math.abs((done[0]?.offset ?? 99) - injected)).toBeLessThanOrEqual(0.005);
    expect(done[0]?.taps).toBe(CALIBRATION.clicks - CALIBRATION.leadIn);
    expect(clicksOf(metronome)).toHaveLength(CALIBRATION.clicks);
    expect(transport.state).toBe('stopped');
    expect(transport.scheduledCount).toBe(0);
  });

  it('plays the clicks on the audio clock at 90 BPM, the first of every four accented', () => {
    const { transport, metronome, deps } = rig();
    runCalibration(deps, { mode: 'calibrate', onDone: () => undefined });
    transport.advanceTo(60);
    const clicks = clicksOf(metronome);
    expect(clicks[0]?.time).toBeCloseTo(100 + CALIBRATION.start, 9);
    expect((clicks[1]?.time ?? 0) - (clicks[0]?.time ?? 0)).toBeCloseTo(PERIOD, 9);
    expect(clicks.map((c) => c.midi).slice(0, 5)).toEqual([91, 84, 84, 84, 91]);
  });

  it('allows for the transport lookahead and the output latency', () => {
    const { transport, done, deps, tapAlong } = rig(0.1, 0.03);
    runCalibration(deps, { mode: 'calibrate', onDone: (m) => done.push(m) });
    // Keys arrive 80 ms after each click; 30 ms of that is output latency the transport knows.
    tapAlong(CALIBRATION.clicks, () => 0.08);
    transport.advanceTo(60);
    expect(done[0]?.offset).toBeCloseTo(0.05, 6);
  });

  it('reports no measurement when the learner barely taps', () => {
    const { transport, done, deps, tapAlong } = rig();
    runCalibration(deps, { mode: 'calibrate', onDone: (m) => done.push(m) });
    tapAlong(CALIBRATION.clicks, (i) => (i > 12 ? 0.02 : null));
    transport.advanceTo(60);
    expect(done).toEqual([null]);
  });

  it('uses "now" for a key with no usable timestamp', () => {
    const { transport, midi, deps } = rig();
    const seen: number[] = [];
    runCalibration(deps, { mode: 'test', onTap: (offset) => seen.push(offset), onDone: () => undefined });
    transport.advanceTo(CALIBRATION.start + 0.05);
    midi.emitNoteOn(60, { time: 0 });
    expect(seen[0]).toBeCloseTo(0.05, 9);
  });

  it('in test mode reports every tap with the current offset applied', () => {
    const { transport, metronome, done, deps, tapAlong } = rig();
    const seen: number[] = [];
    const cancel = runCalibration(deps, {
      mode: 'test',
      userOffset: 0.04,
      onTap: (offset) => seen.push(offset),
      onDone: (m) => done.push(m),
    });
    tapAlong(6, () => 0.05);
    expect(seen).toHaveLength(6);
    for (const offset of seen) expect(offset).toBeCloseTo(0.01, 9); // 50 ms late, 40 ms of it known
    cancel();
    expect(transport.state).toBe('stopped');
    expect(transport.scheduledCount).toBe(0);
    const before = clicksOf(metronome).length;
    transport.start();
    transport.advanceTo(60);
    expect(clicksOf(metronome)).toHaveLength(before); // no more clicks
    expect(done).toEqual([]); // cancel is not "done"
    cancel(); // harmless twice
  });

  it('test mode stops by itself in the end', () => {
    const { transport, done, deps, metronome } = rig();
    runCalibration(deps, { mode: 'test', onDone: (m) => done.push(m) });
    transport.advanceTo(200);
    expect(clicksOf(metronome)).toHaveLength(CALIBRATION.testClicks);
    expect(done).toEqual([null]);
    expect(transport.state).toBe('stopped');
  });
});
