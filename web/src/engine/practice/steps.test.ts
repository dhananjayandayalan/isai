import { describe, expect, it } from 'vitest';
import frere from '../../../../schema/examples/frere-jacques-a-cappella.json';
import twinkle from '../../../../schema/examples/twinkle-g-major.json';
import { parseSong, type Note } from '../../song';
import { buildSteps, CHORD_TOLERANCE, firstStepAt, practises } from './steps';

function note(start: number, end: number, midi: number, hand: Note['hand'] = 'right', velocity = 80): Note {
  return { start, end, midi, velocity, hand, source: 'arranged' };
}

const shape = (steps: ReturnType<typeof buildSteps>) => steps.map((s) => [s.start, s.pitches]);

describe('buildSteps', () => {
  it('has no steps for an empty song', () => {
    expect(buildSteps([], { hands: 'both' })).toEqual([]);
  });

  it('makes one step from a single note', () => {
    expect(buildSteps([note(1, 2, 60)], { hands: 'both' })).toEqual([
      { index: 0, start: 1, pitches: [60], hands: ['right'] },
    ]);
  });

  it('groups a chord struck together, pitches ascending with their hands', () => {
    const steps = buildSteps([note(0, 1, 67), note(0, 1, 60, 'left'), note(0, 1, 64)], { hands: 'both' });
    expect(steps).toEqual([{ index: 0, start: 0, pitches: [60, 64, 67], hands: ['left', 'right', 'right'] }]);
  });

  it('keeps onsets within the tolerance in one step and splits those just outside', () => {
    expect(CHORD_TOLERANCE).toBe(0.035);
    const rolled = buildSteps([note(1, 2, 60), note(1.02, 2, 64), note(1.035, 2, 67)], { hands: 'both' });
    expect(shape(rolled)).toEqual([[1, [60, 64, 67]]]);
    const apart = buildSteps([note(1, 2, 60), note(1.036, 2, 64)], { hands: 'both' });
    expect(shape(apart)).toEqual([
      [1, [60]],
      [1.036, [64]],
    ]);
  });

  it('measures the tolerance from the first onset, so a slow roll does not chain forever', () => {
    const notes = [note(0, 1, 60), note(0.03, 1, 62), note(0.06, 1, 64), note(0.09, 1, 65)];
    expect(shape(buildSteps(notes, { hands: 'both' }))).toEqual([
      [0, [60, 62]],
      [0.06, [64, 65]],
    ]);
  });

  it('takes a custom tolerance', () => {
    const notes = [note(0, 1, 60), note(0.08, 1, 64)];
    expect(buildSteps(notes, { hands: 'both', tolerance: 0.1 })).toHaveLength(1);
    expect(buildSteps(notes, { hands: 'both', tolerance: 0 })).toHaveLength(2);
  });

  it('expects a repeated note again each time it is struck', () => {
    const steps = buildSteps([note(0, 0.4, 60), note(0.5, 0.9, 60), note(1, 1.4, 60)], { hands: 'both' });
    expect(shape(steps)).toEqual([
      [0, [60]],
      [0.5, [60]],
      [1, [60]],
    ]);
  });

  it('does not expect a held note again in the steps it sounds across', () => {
    // A long bass note under three melody notes: expected once, at its own onset.
    const notes = [note(0, 3, 48, 'left'), note(0, 1, 60), note(1, 2, 62), note(2, 3, 64)];
    expect(shape(buildSteps(notes, { hands: 'both' }))).toEqual([
      [0, [48, 60]],
      [1, [62]],
      [2, [64]],
    ]);
  });

  it('skips a note on a key that is still down, and expects it once the key is up', () => {
    // A sloppy transcription: the same key struck again before the first note ends.
    const notes = [note(0, 2, 60), note(1, 1.5, 60), note(2, 3, 60)];
    expect(shape(buildSteps(notes, { hands: 'both' }))).toEqual([
      [0, [60]],
      [2, [60]],
    ]);
  });

  it('lists a pitch once when both hands strike the same key together', () => {
    const steps = buildSteps([note(0, 1, 60, 'left'), note(0, 1, 60, 'right')], { hands: 'both' });
    expect(steps).toEqual([{ index: 0, start: 0, pitches: [60], hands: ['left'] }]);
  });

  it('filters by hand', () => {
    const notes = [note(0, 1, 48, 'left'), note(0, 1, 60), note(1, 2, 50, 'left'), note(1.5, 2, 62)];
    expect(shape(buildSteps(notes, { hands: 'right' }))).toEqual([
      [0, [60]],
      [1.5, [62]],
    ]);
    expect(shape(buildSteps(notes, { hands: 'left' }))).toEqual([
      [0, [48]],
      [1, [50]],
    ]);
    expect(buildSteps(notes, { hands: 'both' })).toHaveLength(3);
  });

  it('leaves out silent notes', () => {
    const steps = buildSteps([note(0, 1, 60, 'right', 0), note(0, 1, 64), note(1, 2, 62, 'right', 0)], {
      hands: 'both',
    });
    expect(shape(steps)).toEqual([[0, [64]]]);
  });

  it('keeps only onsets inside a loop range, start included and end excluded', () => {
    const notes = [note(0, 1, 60), note(1, 2, 62), note(2, 3, 64), note(3, 4, 65)];
    const steps = buildSteps(notes, { hands: 'both', range: { start: 1, end: 3 } });
    expect(shape(steps)).toEqual([
      [1, [62]],
      [2, [64]],
    ]);
    expect(steps.map((s) => s.index)).toEqual([0, 1]);
  });

  it('expects a note at the loop start even if the same key was down before the loop', () => {
    const notes = [note(0, 1.5, 60), note(1, 2, 60)];
    const steps = buildSteps(notes, { hands: 'both', range: { start: 1, end: 2 } });
    expect(shape(steps)).toEqual([[1, [60]]]);
  });

  it('does not expect notes the keyboard has no key for', () => {
    const notes = [note(0, 1, 30, 'left'), note(0, 1, 60), note(1, 2, 100)];
    const steps = buildSteps(notes, { hands: 'both', playable: { low: 36, high: 84 } });
    expect(shape(steps)).toEqual([[0, [60]]]);
  });

  it('sorts notes that arrive out of order', () => {
    const steps = buildSteps([note(2, 3, 64), note(0, 1, 60), note(1, 2, 62)], { hands: 'both' });
    expect(steps.map((s) => s.start)).toEqual([0, 1, 2]);
  });

  it('builds the example songs', () => {
    const t = parseSong(twinkle);
    const right = buildSteps(t.notes, { hands: 'right' });
    expect(right).toHaveLength(t.notes.filter((n) => n.hand === 'right').length);
    expect(right[0]).toEqual({ index: 0, start: 0, pitches: [67], hands: ['right'] });
    const both = buildSteps(t.notes, { hands: 'both' });
    expect(both[0]?.pitches).toEqual([43, 67]);
    expect(both[0]?.hands).toEqual(['left', 'right']);
    const f = parseSong(frere);
    expect(buildSteps(f.notes, { hands: 'right' })).toHaveLength(8);
    expect(buildSteps(f.notes, { hands: 'left' })).toEqual([]);
  });
});

describe('firstStepAt', () => {
  const steps = buildSteps([note(0, 1, 60), note(1, 2, 62), note(2, 3, 64)], { hands: 'both' });

  it('finds the first step at or after a time', () => {
    expect(firstStepAt(steps, 0)).toBe(0);
    expect(firstStepAt(steps, 0.5)).toBe(1);
    expect(firstStepAt(steps, 1)).toBe(1);
    expect(firstStepAt(steps, 2.0001)).toBe(3);
    expect(firstStepAt(steps, -5)).toBe(0);
    expect(firstStepAt([], 1)).toBe(0);
  });
});

describe('practises', () => {
  it('says whether a hand is being practised', () => {
    expect(practises('both', 'left')).toBe(true);
    expect(practises('right', 'right')).toBe(true);
    expect(practises('right', 'left')).toBe(false);
  });
});
