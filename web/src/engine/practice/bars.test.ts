import { describe, expect, it } from 'vitest';
import frere from '../../../../schema/examples/frere-jacques-a-cappella.json';
import twinkle from '../../../../schema/examples/twinkle-g-major.json';
import twinkle010 from '../../../../schema/examples/versions/0.1.0/twinkle-g-major.json';
import { parseSong } from '../../song';
import { barRange, barsOfSong, beatPeriodAt, buildBars, CHUNK_SECONDS } from './bars';

const every = (step: number, count: number, from = 0) =>
  Array.from({ length: count }, (_, i) => Number((from + i * step).toFixed(6)));

describe('buildBars', () => {
  it('groups beats by the time signature, the first beat being a downbeat', () => {
    const { unit, bars } = buildBars({ beats: every(0.5, 8), beatsPerBar: 4, durationSec: 4 });
    expect(unit).toBe('bar');
    expect(bars).toEqual([
      { number: 1, start: 0, end: 2 },
      { number: 2, start: 2, end: 4 },
    ]);
  });

  it('handles three in a bar', () => {
    const { bars } = buildBars({ beats: every(1, 6), beatsPerBar: 3, durationSec: 6 });
    expect(bars.map((b) => [b.start, b.end])).toEqual([
      [0, 3],
      [3, 6],
    ]);
  });

  it('keeps a whole last bar when the song ends early or the beats run out mid-bar', () => {
    // 6 beats in 4/4: the second bar has only two beats but still lasts a bar.
    const { bars } = buildBars({ beats: every(0.5, 6), beatsPerBar: 4, durationSec: 3 });
    expect(bars.at(-1)).toEqual({ number: 2, start: 2, end: 4 });
  });

  it('stretches the last bar to the end of a song that runs on after its beats', () => {
    const { bars } = buildBars({ beats: every(0.5, 8), beatsPerBar: 4, durationSec: 5.5 });
    expect(bars.at(-1)).toEqual({ number: 2, start: 2, end: 5.5 });
  });

  it('starts the first bar at 0 when the first beat comes later', () => {
    const { bars } = buildBars({ beats: every(0.5, 8, 0.3), beatsPerBar: 4, durationSec: 4.3 });
    expect(bars[0]).toEqual({ number: 1, start: 0, end: 2.3 });
    expect(bars[1]?.start).toBe(2.3);
  });

  it('uses downbeats when the song has them, whatever the beat count says', () => {
    // A one-beat pickup: bars start on beats 1, 5, ...
    const { bars } = buildBars({
      beats: every(0.5, 9),
      beatsPerBar: 4,
      durationSec: 4.5,
      downbeats: [0.5, 2.5],
    });
    expect(bars.map((b) => [b.start, b.end])).toEqual([
      [0, 2.5],
      [2.5, 4.5],
    ]);
  });

  it('sorts and de-duplicates beats', () => {
    const { bars } = buildBars({ beats: [1, 0, 0.5, 0.5, 1.5], beatsPerBar: 2, durationSec: 2 });
    expect(bars.map((b) => b.start)).toEqual([0, 1]);
  });

  it('falls back to 2-second chunks for a song with no beats', () => {
    const { unit, bars } = buildBars({ beats: [], beatsPerBar: 4, durationSec: 5 });
    expect(unit).toBe('seconds');
    expect(CHUNK_SECONDS).toBe(2);
    expect(bars).toEqual([
      { number: 1, start: 0, end: 2 },
      { number: 2, start: 2, end: 4 },
      { number: 3, start: 4, end: 5 },
    ]);
  });

  it('has no bars for an empty song', () => {
    expect(buildBars({ beats: [], beatsPerBar: 4, durationSec: 0 }).bars).toEqual([]);
  });

  it('gives a single beat one bar as long as the song', () => {
    const { bars } = buildBars({ beats: [0], beatsPerBar: 4, durationSec: 3 });
    expect(bars).toEqual([{ number: 1, start: 0, end: 3 }]);
  });
});

describe('barsOfSong', () => {
  it('finds four bars in Twinkle and two in Frère Jacques', () => {
    const t = barsOfSong(parseSong(twinkle));
    expect(t.bars.map((b) => b.start)).toEqual([0, 2.4, 4.8, 7.2]);
    expect(t.bars.at(-1)?.end).toBeCloseTo(9.6);
    const f = barsOfSong(parseSong(frere));
    expect(f.bars.map((b) => [b.start, b.end])).toEqual([
      [0, 2],
      [2, 4],
    ]);
  });

  it("uses the Song's downbeats when it has them, and beats otherwise", () => {
    const song = parseSong(twinkle);
    // A pickup: the pipeline says the first full bar starts on the second beat.
    const shifted = barsOfSong({ ...song, tempo: { ...song.tempo, downbeats: [0.6, 3.0, 5.4, 7.8] } });
    expect(shifted.bars.map((b) => b.start)).toEqual([0, 3.0, 5.4, 7.8]);
    const plain = barsOfSong({ ...song, tempo: { bpm: song.tempo.bpm, beats: song.tempo.beats } });
    expect(plain.bars.map((b) => b.start)).toEqual([0, 2.4, 4.8, 7.2]);
    // A 0.1.0 Song (no downbeats) works the same as before.
    expect(barsOfSong(parseSong(twinkle010)).bars).toEqual(plain.bars);
  });
});

describe('barRange', () => {
  const { bars } = buildBars({ beats: every(0.5, 16), beatsPerBar: 4, durationSec: 8 });

  it('covers bars from..to inclusive', () => {
    expect(barRange(bars, 1, 4)).toEqual({ start: 0, end: 8 });
    expect(barRange(bars, 2, 3)).toEqual({ start: 2, end: 6 });
    expect(barRange(bars, 3, 3)).toEqual({ start: 4, end: 6 });
  });

  it('rejects ranges that are reversed or off the song', () => {
    expect(barRange(bars, 3, 2)).toBeNull();
    expect(barRange(bars, 0, 2)).toBeNull();
    expect(barRange(bars, 2, 5)).toBeNull();
  });
});

describe('beatPeriodAt', () => {
  it('reads the gap between the beats around a time', () => {
    const beats = [0, 0.5, 1, 1.75, 2.5];
    expect(beatPeriodAt(beats, 120, 0)).toBe(0.5);
    expect(beatPeriodAt(beats, 120, 0.7)).toBe(0.5);
    expect(beatPeriodAt(beats, 120, 1.2)).toBe(0.75);
    expect(beatPeriodAt(beats, 120, 99)).toBe(0.75); // past the end: the last gap
    expect(beatPeriodAt(beats, 120, -1)).toBe(0.5);
  });

  it('falls back to the BPM without two beats, and to half a second without a BPM', () => {
    expect(beatPeriodAt([], 100, 0)).toBeCloseTo(0.6);
    expect(beatPeriodAt([1], 60, 0)).toBe(1);
    expect(beatPeriodAt([], 0, 0)).toBe(0.5);
    expect(beatPeriodAt([1, 1], 120, 1)).toBe(0.5); // a zero gap is not a tempo
  });
});
