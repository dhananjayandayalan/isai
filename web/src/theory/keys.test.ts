import { describe, expect, it } from 'vitest';
import { keyPitchClass, keySpelling, pitchClassName } from './keys';

describe('keyPitchClass', () => {
  it.each([
    ['C', 0],
    ['G', 7],
    ['Bb', 10],
    ['F#', 6],
    ['Cb', 11],
    ['B#', 0],
  ])('%s is %i', (key, pc) => {
    expect(keyPitchClass(key)).toBe(pc);
  });

  it.each(['', 'H', 'c', 'Bbb', 'C4'])('rejects %j', (key) => {
    expect(() => keyPitchClass(key)).toThrow(RangeError);
  });
});

describe('keySpelling', () => {
  it.each([
    ['C', 'major', 'sharp'],
    ['G', 'major', 'sharp'],
    ['F', 'major', 'flat'],
    ['Bb', 'major', 'flat'],
    ['F#', 'major', 'sharp'],
    ['A', 'minor', 'sharp'],
    ['E', 'minor', 'sharp'],
    ['D', 'minor', 'flat'],
    ['G', 'minor', 'flat'],
    ['C', 'minor', 'flat'],
    ['F', 'minor', 'flat'],
    ['B', 'minor', 'sharp'],
    ['Eb', 'minor', 'flat'],
    ['C#', 'minor', 'sharp'],
    ['D', 'modal', 'sharp'],
    ['Bb', 'modal', 'flat'],
  ] as const)('%s %s takes %ss', (key, mode, spelling) => {
    expect(keySpelling(key, mode)).toBe(spelling);
  });
});

describe('pitchClassName', () => {
  it('names black keys in the spelling asked for', () => {
    expect(pitchClassName(10, 'flat')).toBe('Bb');
    expect(pitchClassName(10, 'sharp')).toBe('A#');
    expect(pitchClassName(0, 'flat')).toBe('C');
  });

  it('wraps pitch classes outside 0–11', () => {
    expect(pitchClassName(13, 'sharp')).toBe('C#');
    expect(pitchClassName(-2, 'flat')).toBe('Bb');
  });
});
