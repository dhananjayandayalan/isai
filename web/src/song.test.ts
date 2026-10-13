import { describe, expect, it } from 'vitest';
import frere from '../../schema/examples/frere-jacques-a-cappella.json';
import invalid from '../../schema/examples/invalid-out-of-range.json';
import twinkle from '../../schema/examples/twinkle-g-major.json';
import { parseSong, SongParseError, type Song } from './song';

describe('parseSong', () => {
  it.each([
    ['twinkle-g-major', twinkle],
    ['frere-jacques-a-cappella', frere],
  ])('accepts the %s example', (_name, json) => {
    const song: Song = parseSong(json);
    expect(song.schemaVersion).toBe('0.1.0');
    expect(song.notes.length).toBeGreaterThan(0);
  });

  it('gives typed access to fields', () => {
    const song = parseSong(twinkle);
    expect(song.tonality.key).toBe('G');
    expect(song.tonality.mode).toBe('major');
    expect(song.tempo.bpm).toBe(100);
    expect(song.timeSignature.den).toBe(4);
    expect(new Set(song.notes.map((n) => n.hand))).toEqual(new Set(['left', 'right']));
  });

  it('rejects the invalid example with every problem listed', () => {
    let error: unknown;
    try {
      parseSong(invalid);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(SongParseError);
    const messages = (error as SongParseError).errors.join('\n');
    expect(messages).toMatch(/tonality/);
    expect(messages).toMatch(/\/notes\/0\/midi/);
  });

  it('rejects unknown fields and bad dates', () => {
    expect(() => parseSong({ ...twinkle, extra: true })).toThrow(SongParseError);
    const badDate = { ...twinkle, meta: { ...twinkle.meta, createdAt: 'yesterday' } };
    expect(() => parseSong(badDate)).toThrow(/createdAt/);
  });

  it('rejects things that are not songs', () => {
    expect(() => parseSong(null)).toThrow(SongParseError);
    expect(() => parseSong('song')).toThrow(SongParseError);
  });
});
