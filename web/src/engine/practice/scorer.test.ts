import { describe, expect, it } from 'vitest';
import type { Hand } from '../activeNotes';
import { clampOffset, effectiveTime, MAX_OFFSET } from './latency';
import {
  phrases,
  Scorer,
  WINDOWS,
  type ExpectedNote,
  type PerformanceResult,
  type ResultOptions,
  type ScoreBar,
} from './scorer';

/** Bars of two seconds, numbered from 1. */
function barsOf(count: number, length = 2): ScoreBar[] {
  return Array.from({ length: count }, (_, i) => ({ number: i + 1, start: i * length, end: (i + 1) * length }));
}

function expected(time: number, pitch: number, hand: Hand = 'right', songTime = time): ExpectedNote {
  return { time, songTime, pitch, hand };
}

/** One note per beat (0.5 s) for `count` beats, pitches going up from C4. */
function melody(count: number, hand: Hand = 'right'): ExpectedNote[] {
  return Array.from({ length: count }, (_, i) => expected(i * 0.5, 60 + (i % 12), hand));
}

interface Run {
  notes: ExpectedNote[];
  /** [pitch, time] of each key press, in the order they arrive. */
  presses: [number, number][];
  options: ResultOptions;
}

function score(run: Run): PerformanceResult {
  const scorer = new Scorer();
  for (const note of run.notes) scorer.expect(note);
  for (const [pitch, time] of run.presses) scorer.press(pitch, time);
  return scorer.result(run.options);
}

const whole = (notes: ExpectedNote[], bars = 4): ResultOptions => ({
  startTime: 0,
  endTime: Math.max(0, ...notes.map((n) => n.time)) + 1,
  sections: [],
  bars: barsOf(bars),
});

describe('Scorer', () => {
  it('gives a perfect run 100', () => {
    const notes = melody(16);
    const result = score({ notes, presses: notes.map((n) => [n.pitch, n.time]), options: whole(notes) });
    expect(result.score).toBe(100);
    expect(result.total).toEqual({
      expected: 16,
      perfect: 16,
      good: 0,
      ok: 0,
      missed: 0,
      accuracy: 1,
      meanOffset: 0,
      meanAbsOffset: 0,
      spread: 0,
    });
    expect(result.wrongNotes).toBe(0);
    expect(result.troubleSpots).toEqual([]);
    expect(result.windows).toEqual(WINDOWS);
  });

  it('grades by distance: perfect to 50 ms, good to 100 ms, ok to 160 ms, then missed', () => {
    const scorer = new Scorer();
    [1, 2, 3, 4, 5, 6, 7].forEach((time) => scorer.expect(expected(time, 60)));
    expect(scorer.press(60, 1.05)).toEqual({ kind: 'hit', grade: 'perfect', offset: expect.closeTo(0.05, 9) });
    expect(scorer.press(60, 1.949)).toMatchObject({ kind: 'hit', grade: 'good' });
    expect(scorer.press(60, 3.1)).toMatchObject({ kind: 'hit', grade: 'good' });
    expect(scorer.press(60, 3.84)).toMatchObject({ kind: 'hit', grade: 'ok' });
    expect(scorer.press(60, 5.16)).toMatchObject({ kind: 'hit', grade: 'ok' });
    expect(scorer.press(60, 6.17)).toEqual({ kind: 'wrong' });
    expect(scorer.hits).toBe(5);
    expect(scorer.wrong).toBe(1);
  });

  it('scores everything 80 ms late as good, and says it was late', () => {
    const notes = melody(16);
    const result = score({ notes, presses: notes.map((n) => [n.pitch, n.time + 0.08]), options: whole(notes) });
    expect(result.total.good).toBe(16);
    expect(result.score).toBe(70);
    expect(result.total.accuracy).toBe(0.7);
    expect(result.total.meanOffset).toBe(0.08);
    expect(result.total.meanAbsOffset).toBe(0.08);
    expect(result.total.spread).toBe(0);
    // 17 bins centred on −160, −140 … 0 … +160 ms: 80 ms late is the 13th.
    expect(result.histogram.right).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 16, 0, 0, 0, 0]);
    expect(result.histogram.left.every((n) => n === 0)).toBe(true);
  });

  it('puts on-time notes in the middle histogram bin, and early and late either side', () => {
    const offsets = [0, 0.01, -0.01, 0.011, -0.011, 0.029, -0.031, 0.16, -0.16];
    const notes = offsets.map((_, i) => expected(i, 60));
    const presses = offsets.map((offset, i): [number, number] => [60, i + offset]);
    const { histogram } = score({ notes, presses, options: whole(notes, 5) });
    expect(histogram.binSec).toBe(0.02);
    expect(histogram.right).toHaveLength(17);
    // Half way between two centres (±10 ms) goes to the bin nearer 0, on both sides.
    expect(histogram.right).toEqual([1, 0, 0, 0, 0, 0, 1, 1, 3, 2, 0, 0, 0, 0, 0, 0, 1]);
    const middle = (histogram.right.length - 1) / 2;
    expect(histogram.right[middle]).toBe(3);
  });

  it('is deterministic under jitter, and jitter inside 45 ms stays perfect', () => {
    // A small fixed generator, so the "random" run is the same every time.
    let seed = 12345;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const notes = melody(64);
    const presses = notes.map((n): [number, number] => [n.pitch, n.time + (random() - 0.5) * 0.09]);
    const run = { notes, presses, options: whole(notes, 16) };
    const first = score(run);
    expect(first.total.perfect).toBe(64);
    expect(first.total.spread).toBeGreaterThan(0);
    expect(Math.abs(first.total.meanOffset ?? 1)).toBeLessThan(0.02);
    expect(score(run)).toEqual(first);
    expect(first.histogram.right.reduce((a, b) => a + b, 0)).toBe(64);
  });

  it('counts notes that were never played as missed', () => {
    const notes = melody(8);
    const presses = notes.filter((_, i) => i % 2 === 0).map((n): [number, number] => [n.pitch, n.time]);
    const result = score({ notes, presses, options: whole(notes) });
    expect(result.total).toMatchObject({ expected: 8, perfect: 4, missed: 4, accuracy: 0.5 });
    expect(result.score).toBe(50);
  });

  it('counts extra notes as wrong, and takes half a note off the score for each', () => {
    const notes = melody(8);
    const presses: [number, number][] = [...notes.map((n): [number, number] => [n.pitch, n.time]), [30, 1], [31, 2]];
    const result = score({ notes, presses, options: { ...whole(notes), endTime: 4 } });
    expect(result.wrongNotes).toBe(2);
    expect(result.total.accuracy).toBe(1);
    expect(result.score).toBe(87.5); // 100 × (8 − 0.5 × 2) ÷ 8
    expect(result.wrongPerMinute).toBe(30); // 2 in 4 seconds
  });

  it('never goes below 0', () => {
    const notes = melody(2);
    const presses: [number, number][] = [30, 31, 32, 33, 34, 35].map((pitch) => [pitch, 0.2]);
    expect(score({ notes, presses, options: whole(notes) }).score).toBe(0);
  });

  it('scores each note of a chord on its own', () => {
    const notes = [expected(1, 60, 'left'), expected(1, 64), expected(1, 67), expected(2, 72)];
    const result = score({ notes, presses: [[60, 1.01], [67, 0.98], [72, 2]], options: whole(notes) });
    expect(result.total).toMatchObject({ expected: 4, perfect: 3, missed: 1 });
    expect(result.hands.left).toMatchObject({ expected: 1, perfect: 1, accuracy: 1 });
    expect(result.hands.right).toMatchObject({ expected: 3, perfect: 2, missed: 1 });
  });

  it('matches the nearer of two notes of the same pitch, and the earlier one on a tie', () => {
    const near = new Scorer();
    near.expect(expected(1, 60));
    near.expect(expected(1.1, 60));
    expect(near.press(60, 1.07)).toMatchObject({ kind: 'hit', offset: expect.closeTo(-0.03, 9) });
    expect(near.press(60, 1.06)).toMatchObject({ kind: 'hit', offset: expect.closeTo(0.06, 9) });
    expect(near.press(60, 1.05)).toEqual({ kind: 'wrong' }); // both taken

    const tie = new Scorer();
    tie.expect(expected(1, 60));
    tie.expect(expected(1.1, 60));
    expect(tie.press(60, 1.05)).toMatchObject({ kind: 'hit', offset: expect.closeTo(0.05, 9) });
    expect(tie.press(60, 1.05)).toMatchObject({ kind: 'hit', offset: expect.closeTo(-0.05, 9) });
  });

  it('keeps expected notes in time order whatever order they arrive in', () => {
    const scorer = new Scorer();
    scorer.expect(expected(2, 60));
    scorer.expect(expected(1, 60));
    expect(scorer.press(60, 1.01)).toMatchObject({ kind: 'hit', grade: 'perfect' });
    expect(scorer.press(60, 2.2)).toEqual({ kind: 'wrong' });
  });

  it('scores across a loop pass boundary: a late last note and an early first note', () => {
    // The loop is 2 s long. Pass 1 ends on C4 at 1.9; pass 2 begins on C4 at 2.0.
    const notes = [expected(0, 60, 'right', 0), expected(1.9, 60, 'right', 1.9), expected(2, 60, 'right', 0), expected(3.9, 60, 'right', 1.9)];
    const result = score({
      notes,
      presses: [[60, 0], [60, 1.93], [60, 1.98], [60, 3.9]],
      options: { startTime: 0, endTime: 4.2, sections: [], bars: barsOf(1) },
    });
    expect(result.total).toMatchObject({ expected: 4, perfect: 4, missed: 0 });
    // Both passes land in bar 1 of the song.
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.tally.expected).toBe(4);
  });

  it('keeps the windows in heard time at half speed', () => {
    // The song's notes are 0.5 s apart; at 50% they are heard 1 s apart.
    const notes = melody(8).map((n) => expected(n.time / 0.5, n.pitch, 'right', n.time));
    const late = score({ notes, presses: notes.map((n) => [n.pitch, n.time + 0.08]), options: whole(notes) });
    expect(late.total.good).toBe(8); // 80 ms is still "good", not 40 ms of song time
    const wayLate = score({ notes, presses: notes.map((n) => [n.pitch, n.time + 0.2]), options: whole(notes) });
    expect(wayLate.total.missed).toBe(8);
    expect(wayLate.wrongNotes).toBe(8);
  });

  it('scores the corrected key time when a latency offset applies', () => {
    const scorer = new Scorer();
    scorer.expect(expected(1, 60));
    // The key arrived at 1.13 on the audio clock: 30 ms of output latency, 100 ms of device lag.
    expect(scorer.press(60, effectiveTime(1.13, 0.03, 0.1))).toMatchObject({ kind: 'hit', grade: 'perfect' });
    const uncorrected = new Scorer();
    uncorrected.expect(expected(1, 60));
    expect(uncorrected.press(60, 1.13)).toMatchObject({ kind: 'hit', grade: 'ok' });
  });

  it('handles an empty song', () => {
    const result = score({ notes: [], presses: [], options: { startTime: 0, endTime: 0, sections: [], bars: [] } });
    expect(result.score).toBe(0);
    expect(result.total).toMatchObject({ expected: 0, missed: 0, accuracy: 0, meanOffset: null, spread: null });
    expect(result.sections).toEqual([]);
    expect(result.troubleSpots).toEqual([]);
    expect(result.wrongPerMinute).toBe(0);
  });

  it('handles a single note', () => {
    const notes = [expected(0.5, 67)];
    const hit = score({ notes, presses: [[67, 0.56]], options: whole(notes, 1) });
    expect(hit.score).toBe(70);
    expect(hit.total).toMatchObject({ expected: 1, good: 1, meanOffset: 0.06 });
    const missed = score({ notes, presses: [], options: whole(notes, 1) });
    expect(missed.score).toBe(0);
    expect(missed.troubleSpots).toEqual([
      { fromBar: 1, toBar: 1, start: 0, end: 2, accuracy: 0, expected: 1, missed: 1 },
    ]);
  });

  it('leaves out what a run that ended early never reached', () => {
    const notes = melody(8); // 0, 0.5 ... 3.5
    const presses: [number, number][] = [[60, 0], [61, 0.5]];
    // Finished at 1.1: the note at 1.0 is still inside its window, so it doesn't count yet.
    const early = score({ notes, presses, options: { startTime: 0, endTime: 1.1, sections: [], bars: barsOf(2) } });
    expect(early.total).toMatchObject({ expected: 2, perfect: 2, missed: 0 });
    expect(early.durationSec).toBe(1.1);
    // Finished at 1.2: its window has closed and it was not played.
    const later = score({ notes, presses, options: { startTime: 0, endTime: 1.2, sections: [], bars: barsOf(2) } });
    expect(later.total).toMatchObject({ expected: 3, perfect: 2, missed: 1 });
    // A note hit ahead of the end still counts.
    const ahead = score({ notes, presses: [...presses, [62, 0.95]], options: { startTime: 0, endTime: 0.96, sections: [], bars: barsOf(2) } });
    expect(ahead.total).toMatchObject({ expected: 3, perfect: 3 });
  });

  it('reports named sections, and only the ones with notes', () => {
    const notes = melody(8); // 4 s
    const result = score({
      notes,
      presses: notes.slice(0, 4).map((n) => [n.pitch, n.time]),
      options: {
        ...whole(notes),
        sections: [
          { label: 'Verse', start: 0, end: 2 },
          { label: 'Bridge', start: 2, end: 4 },
          { label: 'Outro', start: 4, end: 8 },
        ],
      },
    });
    expect(result.sections.map((s) => [s.label, s.tally.expected, s.tally.accuracy])).toEqual([
      ['Verse', 4, 1],
      ['Bridge', 4, 0],
    ]);
  });

  it('falls back to four-bar phrases', () => {
    const notes = melody(40); // 20 s: 10 bars
    const result = score({ notes, presses: [], options: whole(notes, 10) });
    expect(result.sections.map((s) => s.label)).toEqual(['Bars 1–4', 'Bars 5–8', 'Bars 9–10']);
    expect(phrases(barsOf(5), 'Part').map((p) => p.label)).toEqual(['Parts 1–4', 'Part 5']);
    expect(phrases([])).toEqual([]);
  });

  it('resets', () => {
    const scorer = new Scorer();
    scorer.expect(expected(1, 60));
    scorer.press(60, 1);
    scorer.press(61, 1);
    scorer.reset();
    expect(scorer.hits).toBe(0);
    expect(scorer.wrong).toBe(0);
    expect(scorer.result({ startTime: 0, endTime: 5, sections: [], bars: [] }).total.expected).toBe(0);
  });
});

describe('trouble spots', () => {
  /** Four notes a bar; `played[i]` says how many of bar i's notes are hit. */
  function run(played: number[]): PerformanceResult {
    const notes: ExpectedNote[] = [];
    const presses: [number, number][] = [];
    played.forEach((count, bar) => {
      for (let beat = 0; beat < 4; beat++) {
        const note = expected(bar * 2 + beat * 0.5, 60 + beat);
        notes.push(note);
        if (beat < count) presses.push([note.pitch, note.time]);
      }
    });
    return score({ notes, presses, options: whole(notes, played.length) });
  }
  const spots = (result: PerformanceResult) => result.troubleSpots.map((s) => [s.fromBar, s.toBar, s.accuracy]);

  it('finds none in a clean run', () => {
    expect(run([4, 4, 4, 4])).toMatchObject({ troubleSpots: [] });
  });

  it('picks the worst two bars and gives their range in song seconds', () => {
    const result = run([4, 4, 0, 2, 4, 4]);
    expect(result.troubleSpots).toEqual([
      { fromBar: 3, toBar: 4, start: 4, end: 8, accuracy: 0.25, expected: 8, missed: 6 },
    ]);
  });

  it('grows a spot by weak neighbours, up to four bars', () => {
    // Bars 2 to 6 are all weak. The worst pair is 3–4; then 5 and 6 join, each weaker than 2.
    expect(spots(run([4, 3, 0, 0, 1, 2, 4]))).toEqual([
      [3, 6, 0.1875],
      [1, 2, 0.875],
    ]);
  });

  it('keeps at most three spots, worst first, never overlapping', () => {
    const result = run([0, 4, 4, 1, 4, 4, 2, 4, 4, 3, 4, 4]);
    expect(spots(result)).toEqual([
      [1, 2, 0.5],
      [3, 4, 0.625],
      [6, 7, 0.75],
    ]);
  });

  it('breaks ties by misses, then by position', () => {
    expect(spots(run([2, 2, 4, 4, 2, 2]))).toEqual([
      [1, 2, 0.5],
      [5, 6, 0.5],
    ]);
  });
});

describe('latency', () => {
  it('moves a key press back by the output latency and the device offset', () => {
    expect(effectiveTime(10, 0.02, 0.05)).toBeCloseTo(9.93, 9);
    expect(effectiveTime(10, 0, -0.03)).toBeCloseTo(10.03, 9);
  });

  it('only accepts offsets within the limit', () => {
    expect(clampOffset(0.12)).toBe(0.12);
    expect(clampOffset(1)).toBe(MAX_OFFSET);
    expect(clampOffset(-1)).toBe(-MAX_OFFSET);
    expect(clampOffset(Number.NaN)).toBe(0);
    expect(clampOffset('0.1')).toBe(0);
    expect(clampOffset(undefined)).toBe(0);
  });
});

// Golden files: a fixed stream of expected notes and key presses gives a fixed result.
// Each `<name>.run.json` in fixtures/ has a hand-checked `<name>.result.json` next to it.
// After a deliberate change to the scorer, work the new numbers out and edit the result.
describe('golden files', () => {
  const runs = import.meta.glob<Run>('./fixtures/*.run.json', { eager: true, import: 'default' });
  const results = import.meta.glob<PerformanceResult>('./fixtures/*.result.json', { eager: true, import: 'default' });
  const names = Object.keys(runs).map((path) => path.replace('.run.json', ''));

  it('has fixtures', () => {
    expect(names.length).toBeGreaterThanOrEqual(2);
  });

  it.each(names)('%s', (name) => {
    const run = runs[`${name}.run.json`];
    const result = results[`${name}.result.json`];
    expect(run).toBeDefined();
    expect(result).toBeDefined();
    if (run) expect(score(run)).toEqual(result);
  });
});
