import { describe, expect, it } from 'vitest';
import frere from '../../../../schema/examples/frere-jacques-a-cappella.json';
import twinkle from '../../../../schema/examples/twinkle-g-major.json';
import { FakeInstrument } from '../../audio/FakeInstrument';
import { FakeTransport } from '../../audio/FakeTransport';
import { FakeMidiInput } from '../../midi/FakeMidiInput';
import { parseSong, type Note, type Song } from '../../song';
import { PracticeEngine, type PracticeSettings, type PracticeState } from './engine';
import type { PerformanceResult } from './scorer';
import { buildSteps } from './steps';
import { FLASH_CORRECT, FLASH_WRONG } from './view';

// Performance mode on the practice engine (ADR 0006). The scorer itself is tested in
// scorer.test.ts; this file checks that the engine feeds it the right notes and times.

function note(start: number, end: number, midi: number, hand: Note['hand'] = 'right'): Note {
  return { start, end, midi, velocity: 80, hand, source: 'arranged' };
}

/** Two seconds at 120 BPM in 4/4: one bar, so a count-in lasts 2 s. */
function tune(): Song {
  return {
    ...parseSong(twinkle),
    durationSec: 2,
    notes: [note(0, 0.5, 60), note(0.5, 1, 62), note(1, 1.5, 64), note(1.5, 2, 65), note(0, 2, 48, 'left')],
    tempo: { bpm: 120, beats: [0, 0.5, 1, 1.5] },
    timeSignature: { num: 4, den: 4 },
    sections: [], // so results fall back to phrases of bars
  };
}

const MELODY: [number, number][] = [
  [0, 60],
  [0.5, 62],
  [1, 64],
  [1.5, 65],
];

interface RunOptions {
  song?: Song;
  settings?: Partial<PracticeSettings>;
  lookahead?: number;
  outputLatency?: number;
}

function run(options: RunOptions = {}) {
  const transport = new FakeTransport(100);
  transport.lookahead = options.lookahead ?? 0;
  transport.outputLatency = options.outputLatency ?? 0;
  const piano = new FakeInstrument();
  const metronome = new FakeInstrument('synth');
  const midi = new FakeMidiInput();
  void midi.connect('fake-keyboard');
  const engine = new PracticeEngine({
    song: options.song ?? tune(),
    transport,
    piano,
    metronome,
    clock: transport.clock,
    midi,
    settings: { mode: 'performance', hands: 'right', ...options.settings },
  });
  const states: PracticeState[] = [];
  engine.onStateChange((s) => states.push(s));
  const results: PerformanceResult[] = [];
  engine.onResult((r) => results.push(r));
  /** Move to `at` on the transport and press `key` there. */
  const pressAt = (at: number, key: number) => {
    transport.advanceTo(at);
    midi.emitNoteOn(key, { time: transport.audioTime });
    midi.emitNoteOff(key, { time: transport.audioTime });
  };
  /** Play the melody of one pass that starts (after any count-in) at `from`, each note `late` seconds late. */
  const playMelody = (from: number, late = 0, rate = 1) => {
    for (const [time, key] of MELODY) pressAt(from + time / rate + late, key);
  };
  return { transport, piano, metronome, midi, engine, states, results, pressAt, playMelody };
}

const ons = (instrument: FakeInstrument) => instrument.calls.flatMap((c) => (c.type === 'on' ? [c.midi] : []));

describe('performance mode', () => {
  it('counts in, never waits, sounds only the other hand, and scores a perfect run 100', () => {
    const { transport, piano, metronome, engine, states, results, playMelody } = run();
    engine.play();
    transport.advanceTo(0.1);
    expect(engine.phase).toBe('count-in');
    playMelody(2);
    expect(results).toEqual([]); // not over yet
    transport.advanceTo(10);
    expect(states).toEqual(['playing', 'stopped']);
    expect(transport.state).toBe('stopped');
    expect(ons(metronome)).toHaveLength(4); // the count-in, though the metronome is off
    expect(ons(piano)).toEqual([48]); // Isai plays the left hand; the right is the learner's
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ version: 1, score: 100, wrongNotes: 0, durationSec: 2 });
    expect(results[0]?.total).toMatchObject({ expected: 4, perfect: 4, missed: 0 });
    expect(results[0]?.hands.left.expected).toBe(0);
    expect(results[0]?.sections.map((s) => s.label)).toEqual(['Bar 1']);
    expect(engine.notesHit).toBe(4);
  });

  it('scores a run with nobody playing as all missed, without ever pausing', () => {
    const { transport, engine, results, states } = run();
    engine.play();
    transport.advanceTo(10);
    expect(states).toEqual(['playing', 'stopped']);
    expect(results[0]?.total).toMatchObject({ expected: 4, missed: 4 });
    expect(results[0]?.score).toBe(0);
    expect(results[0]?.troubleSpots).toHaveLength(1);
  });

  it('says how late the notes were', () => {
    const { transport, engine, results, playMelody } = run();
    engine.play();
    playMelody(2, 0.08);
    transport.advanceTo(10);
    expect(results[0]?.total).toMatchObject({ good: 4, meanOffset: 0.08 });
    expect(results[0]?.score).toBe(70);
  });

  it('takes the output latency and the calibrated offset off each key time', () => {
    const corrected = run({ outputLatency: 0.03, settings: { latencyOffset: 0.05 } });
    corrected.engine.play();
    corrected.playMelody(2, 0.08);
    corrected.transport.advanceTo(10);
    expect(corrected.results[0]?.total).toMatchObject({ perfect: 4, meanOffset: 0 });

    // The offset can change during a run: it is read on every key.
    const changed = run();
    changed.engine.play();
    changed.pressAt(2.08, 60);
    changed.engine.configure({ latencyOffset: 0.08 });
    changed.pressAt(2.58, 62);
    changed.transport.advanceTo(10);
    expect(changed.results[0]?.total).toMatchObject({ perfect: 1, good: 1, missed: 2 });
  });

  it('keeps the windows in heard time at half speed', () => {
    const { transport, engine, results, playMelody } = run({ settings: { speed: 0.5 } });
    engine.play();
    playMelody(4, 0.08, 0.5); // the count-in and the notes take twice as long
    transport.advanceTo(20);
    expect(results[0]?.total.good).toBe(4);
    expect(results[0]?.durationSec).toBe(4);
  });

  it('marks a hit and a wrong note on the keys and counts them', () => {
    const { engine, pressAt } = run();
    engine.play();
    pressAt(2, 60);
    expect(engine.flashKind[60]).toBe(FLASH_CORRECT);
    pressAt(2.2, 61);
    expect(engine.flashKind[61]).toBe(FLASH_WRONG);
    expect(engine.notesHit).toBe(1);
    expect(engine.wrongNotes).toBe(1);
    // The same key again, with its note already taken, is a wrong note too.
    pressAt(2.3, 60);
    expect(engine.wrongNotes).toBe(2);
  });

  it('moves the lit keys on by time, whatever is played', () => {
    const { transport, engine } = run();
    engine.play();
    transport.advanceTo(1);
    expect(engine.expected).toEqual([{ midi: 60, hand: 'right' }]); // lit through the count-in
    transport.advanceTo(2.01);
    expect(engine.expected).toEqual([{ midi: 62, hand: 'right' }]);
    expect(engine.phase).toBe('running');
    transport.advanceTo(3.6);
    expect(engine.expected).toEqual([]); // the last one has gone by
    expect(engine.dimHand).toBe('left');
  });

  it('finish ends the run early and scores what was reached', () => {
    const { engine, results, states, pressAt, transport } = run();
    engine.play();
    pressAt(2, 60);
    pressAt(2.5, 62);
    transport.advanceTo(2.8);
    engine.finish();
    expect(states).toEqual(['playing', 'stopped']);
    expect(results).toHaveLength(1);
    expect(results[0]?.total).toMatchObject({ expected: 2, perfect: 2 });
    expect(results[0]?.durationSec).toBe(0.8);
    engine.finish(); // nothing left to finish
    expect(results).toHaveLength(1);
  });

  it('finished during the count-in, there is nothing to score', () => {
    const { engine, results, transport } = run({ lookahead: 0.1 });
    engine.play();
    engine.finish(); // before the transport has even started
    expect(results[0]?.total.expected).toBe(0);
    engine.play();
    transport.advanceTo(1);
    engine.finish();
    expect(results[1]?.total.expected).toBe(0);
    expect(results[1]?.durationSec).toBe(0);
  });

  it('has no pause (it finishes), cannot be moved, and stop abandons it', () => {
    const paused = run();
    paused.engine.play();
    paused.pressAt(2, 60);
    paused.engine.seek(1.5);
    paused.pressAt(2.5, 62); // still in time: the seek did nothing
    paused.engine.pause();
    expect(paused.states).toEqual(['playing', 'stopped']);
    expect(paused.results[0]?.total).toMatchObject({ expected: 2, perfect: 2 });

    const stopped = run();
    stopped.engine.play();
    stopped.pressAt(2, 60);
    stopped.engine.stop();
    expect(stopped.results).toEqual([]);
  });

  it('always starts from the top, even after a seek while stopped', () => {
    const { engine, transport, results, playMelody } = run();
    engine.seek(1.2);
    expect(engine.state).toBe('paused');
    engine.play();
    playMelody(2);
    transport.advanceTo(10);
    expect(results[0]?.total).toMatchObject({ expected: 4, perfect: 4 });
  });

  it('is abandoned when the speed, hands or mode change mid-run, but not for the metronome', () => {
    for (const patch of [{ speed: 0.8 }, { hands: 'both' as const }, { mode: 'training' as const }]) {
      const { engine, results, states, pressAt } = run();
      engine.play();
      pressAt(2, 60);
      engine.configure(patch);
      expect(states).toEqual(['playing', 'stopped']);
      expect(results).toEqual([]);
    }
    const { engine, results, transport, playMelody, metronome } = run();
    engine.play();
    engine.configure({ metronome: true });
    playMelody(2);
    transport.advanceTo(10);
    expect(results[0]?.score).toBe(100);
    expect(ons(metronome)).toHaveLength(8); // the count-in and the bar
  });

  it('scores every pass of a loop until finish', () => {
    const { engine, results, transport, playMelody, pressAt } = run({ settings: { loop: { start: 0, end: 2 } } });
    engine.play();
    playMelody(2); // pass 1 in time
    // Pass 2 (4 s to 6 s): only its first note, 30 ms early, across the boundary.
    pressAt(3.97, 60);
    transport.advanceTo(6.5);
    expect(engine.loopPasses).toBe(2);
    engine.finish();
    // Pass 1: 4. Pass 2: 4. Pass 3: its first note's window has closed, the second's hasn't.
    expect(results[0]?.total).toMatchObject({ expected: 9, perfect: 5, missed: 4 });
    expect(results[0]?.total.meanOffset).toBeCloseTo(-0.006, 6);
    expect(results[0]?.sections).toHaveLength(1);
    expect(results[0]?.durationSec).toBe(4.5);
  });

  it('judges a key pressed before the transport has started, without failing', () => {
    const { engine, midi, transport } = run({ lookahead: 0.1 });
    engine.play();
    // FakeTransport has already moved its clock on by the lookahead; press "before" that.
    midi.emitNoteOn(60, { time: transport.audioTime - 0.2 });
    expect(engine.wrongNotes).toBe(1);
  });

  it('expects only the notes the keyboard has', () => {
    const { engine, results, transport, playMelody } = run({ settings: { playable: { low: 61, high: 100 } } });
    engine.play();
    playMelody(2);
    transport.advanceTo(10);
    expect(results[0]?.total).toMatchObject({ expected: 3, perfect: 3 });
    expect(results[0]?.wrongNotes).toBe(1); // C4 isn't in this run
  });

  it.each([
    ['Twinkle', twinkle, 'both'],
    ['Twinkle', twinkle, 'left'],
    ['Frère Jacques', frere, 'right'],
  ] as const)('%s, %s: a clean run of the example song scores 100', (_name, json, hands) => {
    const song = parseSong(json);
    const { engine, results, transport, pressAt } = run({ song, settings: { hands } });
    const steps = buildSteps(song.notes, { hands });
    const beats = song.tempo.beats;
    const lead = ((beats[1] ?? 0) - (beats[0] ?? 0)) * song.timeSignature.num;
    engine.play();
    for (const step of steps) step.pitches.forEach((pitch, i) => pressAt(lead + (step.starts[i] ?? step.start), pitch));
    transport.advanceTo(lead + song.durationSec + 1);
    const expected = steps.reduce((sum, step) => sum + step.pitches.length, 0);
    expect(expected).toBeGreaterThan(0);
    expect(results[0]?.score).toBe(100);
    expect(results[0]?.total).toMatchObject({ expected, perfect: expected });
    expect(results[0]?.troubleSpots).toEqual([]);
    const { left, right } = results[0]?.hands ?? { left: null, right: null };
    expect((left?.expected ?? 0) + (right?.expected ?? 0)).toBe(expected);
  });
});

describe('the other modes', () => {
  it('never report a result, and finish does nothing', () => {
    for (const mode of ['listen', 'training'] as const) {
      const { engine, results, transport } = run({ settings: { mode, hands: 'right' } });
      engine.play();
      transport.advanceTo(0.5);
      engine.finish();
      expect(engine.state).toBe('playing');
      expect(results).toEqual([]);
      engine.stop();
    }
  });

  it('listen still runs to the end with no count-in', () => {
    const { engine, results, transport, states, metronome } = run({ settings: { mode: 'listen' } });
    engine.play();
    transport.advanceTo(5);
    expect(states).toEqual(['playing', 'stopped']);
    expect(ons(metronome)).toEqual([]);
    expect(results).toEqual([]);
  });
});

describe('the sustain pedal (ADR 0007)', () => {
  it('does not move a training hold on, or count as a note', () => {
    const { engine, transport, midi, piano } = run({ settings: { mode: 'training' } });
    engine.play();
    transport.advanceTo(0.1);
    expect(engine.phase).toBe('waiting');
    midi.emitPedal(127, { time: transport.audioTime });
    midi.emitPedal(0, { time: transport.audioTime });
    expect(engine.phase).toBe('waiting');
    expect(engine.state).toBe('playing');
    expect(engine.wrongNotes).toBe(0);
    expect(ons(piano)).toEqual([]); // nothing sounds while it waits, pedal or not
    midi.emitNoteOn(60, { time: transport.audioTime }); // the step itself moves it on
    expect(engine.phase).not.toBe('waiting');
  });

  it('changes nothing in a scored run', () => {
    const plain = run();
    plain.engine.play();
    plain.playMelody(2);
    plain.transport.advanceTo(10);
    const pedalled = run();
    pedalled.engine.play();
    for (let i = 0; i < 8; i++) {
      pedalled.transport.advanceTo(2 + i * 0.25);
      pedalled.midi.emitPedal(i % 2 ? 0 : 127, { time: pedalled.transport.audioTime });
    }
    pedalled.playMelody(2);
    pedalled.transport.advanceTo(10);
    expect(pedalled.results[0]).toEqual(plain.results[0]);
    expect(pedalled.results[0]?.wrongNotes).toBe(0);
  });
});
