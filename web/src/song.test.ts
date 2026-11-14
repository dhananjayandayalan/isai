import { describe, expect, it } from 'vitest';
import frere from '../../schema/examples/frere-jacques-a-cappella.json';
import invalid from '../../schema/examples/invalid-out-of-range.json';
import twinkle from '../../schema/examples/twinkle-g-major.json';
import frere010 from '../../schema/examples/versions/0.1.0/frere-jacques-a-cappella.json';
import twinkle010 from '../../schema/examples/versions/0.1.0/twinkle-g-major.json';
import frere020 from '../../schema/examples/versions/0.2.0/frere-jacques-a-cappella.json';
import twinkle020 from '../../schema/examples/versions/0.2.0/twinkle-g-major.json';
import schema from '../../schema/song.schema.json';
import { parseSong, SongParseError, type Song } from './song';

describe('parseSong', () => {
  it.each([
    ['twinkle-g-major', twinkle],
    ['frere-jacques-a-cappella', frere],
  ])('accepts the %s example', (_name, json) => {
    const song: Song = parseSong(json);
    expect(song.schemaVersion).toBe('0.3.0');
    expect(song.notes.length).toBeGreaterThan(0);
  });

  it.each([
    ['twinkle-g-major', twinkle010],
    ['frere-jacques-a-cappella', frere010],
  ])('still accepts the frozen 0.1.0 %s example (ADR 0008)', (_name, json) => {
    const song = parseSong(json);
    expect(song.schemaVersion).toBe('0.1.0');
    expect(song.tempo.downbeats).toBeUndefined();
  });

  it.each([
    ['twinkle-g-major', twinkle020],
    ['frere-jacques-a-cappella', frere020],
  ])('still accepts the frozen 0.2.0 %s example (ADR 0008)', (_name, json) => {
    const song = parseSong(json);
    expect(song.schemaVersion).toBe('0.2.0');
    expect(song.meta.confidence.notes).toBeUndefined();
  });

  it('reads every version the schema lists, and no other', () => {
    expect(schema.properties.schemaVersion.enum).toEqual(['0.1.0', '0.2.0', '0.3.0']);
    expect(parseSong(twinkle).meta.confidence.notes).toBe(1);
    expect(parseSong(twinkle).tempo.downbeats).toEqual([0, 2.4, 4.8, 7.2]);
    expect(() => parseSong({ ...twinkle, schemaVersion: '9.9.9' })).toThrow(SongParseError);
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

  it('accepts an empty song with no notes, chords or beats', () => {
    const empty = { ...frere, durationSec: 0, notes: [], chords: [], tempo: { bpm: 120, beats: [] } };
    const song = parseSong(empty);
    expect(song.notes).toEqual([]);
    expect(song.chords).toEqual([]);
  });

  it('rejects things that are not songs', () => {
    expect(() => parseSong(null)).toThrow(SongParseError);
    expect(() => parseSong('song')).toThrow(SongParseError);
  });
});

describe('precompiled validator', () => {
  const sources = import.meta.glob<string>(['./song.ts', './generated/song.validate.js'], {
    query: '?raw',
    import: 'default',
    eager: true,
  });

  it('is what song.ts uses, with no runtime ajv compiler', () => {
    const songTs = sources['./song.ts'] ?? '';
    expect(songTs).toContain("from './generated/song.validate.js'");
    // Only a type import from ajv is allowed; it is erased at build time.
    const ajvImports = songTs.match(/^import .*from 'ajv[^']*';$/gm) ?? [];
    expect(ajvImports.every((line) => line.startsWith('import type '))).toBe(true);
  });

  it('contains no eval or new Function and no leftover require()', () => {
    const code = sources['./generated/song.validate.js'] ?? '';
    expect(code.length).toBeGreaterThan(1000);
    expect(code).not.toMatch(/new Function|\beval\(|require\(/);
  });

  it('agrees with a runtime-compiled validator', async () => {
    const { default: Ajv2020 } = await import('ajv/dist/2020');
    const { default: addFormats } = await import('ajv-formats');
    const { default: schema } = await import('../../schema/song.schema.json');
    const ajv = new Ajv2020({ allErrors: true });
    addFormats(ajv);
    const reference = ajv.compile(schema);

    const surrogateTitle = { ...twinkle, title: '𝄞' };
    const docs: unknown[] = [
      twinkle,
      frere,
      invalid,
      { ...twinkle, title: '' },
      surrogateTitle,
      { ...twinkle, meta: { ...twinkle.meta, createdAt: '2026-02-30T00:00:00Z' } },
      { ...twinkle, tonality: { ...twinkle.tonality, scale: [7, 7] } },
    ];
    for (const doc of docs) {
      const ours = (() => {
        try {
          parseSong(doc);
          return true;
        } catch {
          return false;
        }
      })();
      expect(ours).toBe(reference(doc));
    }
  });
});
