// Bars for the loop picker and the metronome. A 0.2.0 Song may carry `tempo.downbeats`
// (the pipeline's bar starts); without them the first beat is taken as a downbeat.
// Pure; no audio.

import type { Song } from '../../song';

export interface Bar {
  /** 1-based, as a musician counts. */
  number: number;
  /** Song seconds, start inclusive and end exclusive. */
  start: number;
  end: number;
}

export interface Bars {
  /**
   * `bar` when they come from the song's beats; `seconds` when the song has no beats and
   * the "bars" are fixed chunks of time.
   */
  unit: 'bar' | 'seconds';
  bars: Bar[];
}

/** Length of a loop chunk for a song with no beats. */
export const CHUNK_SECONDS = 2;

const EPSILON = 1e-6;

export interface BarInput {
  beats: readonly number[];
  beatsPerBar: number;
  durationSec: number;
  /** Bar starts, when the song knows them (P3). They override counting beats. */
  downbeats?: readonly number[] | undefined;
}

/**
 * Split a song into bars.
 * - With downbeats: one bar per downbeat.
 * - With beats only: a bar every `beatsPerBar` beats, the first beat being a downbeat.
 * - With neither: chunks of `CHUNK_SECONDS`.
 * Bars cover the whole song: the first starts at 0 and the last ends at the song's end
 * (or one bar after the last downbeat, if the song's duration is shorter than that).
 */
export function buildBars(input: BarInput): Bars {
  const { durationSec } = input;
  const beats = sortedUnique(input.beats);
  const starts = input.downbeats?.length
    ? sortedUnique(input.downbeats)
    : beats.filter((_, i) => i % Math.max(1, input.beatsPerBar) === 0);

  if (starts.length === 0) return { unit: 'seconds', bars: chunks(durationSec) };

  // Anything before the first downbeat belongs to the first bar.
  const edges = [...starts];
  edges[0] = Math.min(0, edges[0] ?? 0);
  const lastStart = edges[edges.length - 1] ?? 0;
  const end = Math.max(durationSec, lastStart + lastBarLength(starts, beats, input.beatsPerBar));
  const bars: Bar[] = [];
  for (let i = 0; i < edges.length; i++) {
    const start = edges[i] ?? 0;
    const next = edges[i + 1] ?? end;
    if (next - start > EPSILON) bars.push({ number: bars.length + 1, start, end: next });
  }
  return { unit: 'bar', bars };
}

/** The song's bars: from `tempo.downbeats` when the Song has them (schema 0.2.0), else from beats. */
export function barsOfSong(song: Song): Bars {
  return buildBars({
    beats: song.tempo.beats,
    beatsPerBar: song.timeSignature.num,
    durationSec: song.durationSec,
    ...(song.tempo.downbeats ? { downbeats: song.tempo.downbeats } : {}),
  });
}

/** Seconds per beat at `time`: the gap between the beats around it, or from the BPM. */
export function beatPeriodAt(beats: readonly number[], bpm: number, time: number): number {
  const fallback = bpm > 0 ? 60 / bpm : 0.5;
  if (beats.length < 2) return fallback;
  let i = 0;
  while (i < beats.length - 2 && (beats[i + 1] ?? Infinity) <= time) i++;
  const period = (beats[i + 1] ?? 0) - (beats[i] ?? 0);
  return period > EPSILON ? period : fallback;
}

/** The song range covered by bars `from`..`to` (1-based, inclusive), or null if invalid. */
export function barRange(bars: readonly Bar[], from: number, to: number): { start: number; end: number } | null {
  const first = bars[from - 1];
  const last = bars[to - 1];
  if (!first || !last || to < from) return null;
  return { start: first.start, end: last.end };
}

function sortedUnique(times: readonly number[]): number[] {
  const sorted = [...times].sort((a, b) => a - b);
  return sorted.filter((t, i) => i === 0 || t - (sorted[i - 1] ?? 0) > EPSILON);
}

function chunks(durationSec: number): Bar[] {
  const bars: Bar[] = [];
  for (let start = 0; start < durationSec - EPSILON; start += CHUNK_SECONDS) {
    bars.push({ number: bars.length + 1, start, end: Math.min(durationSec, start + CHUNK_SECONDS) });
  }
  return bars;
}

/** A full bar's length for the last bar: the previous bar's, or beats per bar × the last beat gap. */
function lastBarLength(starts: readonly number[], beats: readonly number[], beatsPerBar: number): number {
  if (starts.length >= 2) {
    return (starts[starts.length - 1] ?? 0) - (starts[starts.length - 2] ?? 0);
  }
  if (beats.length >= 2) {
    return ((beats[beats.length - 1] ?? 0) - (beats[beats.length - 2] ?? 0)) * Math.max(1, beatsPerBar);
  }
  return 0;
}
