import { describe, expect, it } from 'vitest';
import { isBlackKey, midiToName, octave, pitchClass } from './pitch';

describe('midiToName', () => {
  it.each([
    [0, 'C-1'],
    [21, 'A0'],
    [59, 'B3'],
    [60, 'C4'],
    [69, 'A4'],
    [108, 'C8'],
    [127, 'G9'],
  ])('names MIDI %i as %s', (midi, name) => {
    expect(midiToName(midi)).toBe(name);
  });

  it('uses sharps by default and flats on request', () => {
    expect(midiToName(61)).toBe('C#4');
    expect(midiToName(61, 'flat')).toBe('Db4');
    expect(midiToName(70, 'flat')).toBe('Bb4');
    expect(midiToName(60, 'flat')).toBe('C4');
  });

  it('matches the pipeline naming for every note (sharps)', () => {
    const names = Array.from({ length: 128 }, (_, m) => midiToName(m));
    expect(new Set(names).size).toBe(128);
    expect(names.filter((n) => n.startsWith('C') && !n.startsWith('C#'))).toHaveLength(11);
  });

  it.each([-1, 128, 60.5, Number.NaN])('rejects %s', (midi) => {
    expect(() => midiToName(midi)).toThrow(RangeError);
  });
});

describe('pitchClass and octave', () => {
  it('split a MIDI number', () => {
    expect(pitchClass(62)).toBe(2);
    expect(octave(62)).toBe(4);
    expect(octave(0)).toBe(-1);
    expect(octave(11)).toBe(-1);
    expect(octave(12)).toBe(0);
  });

  it('reject out-of-range notes', () => {
    expect(() => pitchClass(200)).toThrow(RangeError);
    expect(() => octave(-5)).toThrow(RangeError);
  });
});

describe('isBlackKey', () => {
  it('marks the five black keys of an octave', () => {
    const black = Array.from({ length: 12 }, (_, i) => 60 + i).filter(isBlackKey);
    expect(black.map((m) => midiToName(m))).toEqual(['C#4', 'D#4', 'F#4', 'G#4', 'A#4']);
  });

  it('knows A0 and C8 are white', () => {
    expect(isBlackKey(21)).toBe(false);
    expect(isBlackKey(22)).toBe(true);
    expect(isBlackKey(108)).toBe(false);
  });
});
