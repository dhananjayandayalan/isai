// Scores a performance (ADR 0006). Expected notes go in as the engine lays the song out,
// key presses go in as they arrive, and each press gets a verdict at once (for the mark on
// the key). `result` adds everything up. Pure and deterministic: no clock, no transport.
// All times are heard seconds on the run's own timeline (the engine's transport time), so
// speed changes nothing and a loop is just more expected notes further along.

import type { Hand } from '../activeNotes';

/** How far from a note a key press may be, in heard seconds. */
export interface Windows {
  perfect: number;
  good: number;
  ok: number;
}

export const WINDOWS: Readonly<Windows> = { perfect: 0.05, good: 0.1, ok: 0.16 };
/** What each grade is worth towards accuracy and the score. */
export const WEIGHTS = { perfect: 1, good: 0.7, ok: 0.4 } as const;
/** A wrong note costs this much of a note in the score. */
export const WRONG_PENALTY = 0.5;
/** Width of a timing-histogram bin, in seconds. The bins span the ok window. */
export const HISTOGRAM_BIN = 0.02;
/** A bar range is a trouble spot when its accuracy is below this. */
export const TROUBLE_BELOW = 0.9;
export const MAX_TROUBLE_SPOTS = 3;
const MAX_TROUBLE_BARS = 4;
const PHRASE_BARS = 4;
const EPSILON = 1e-9;

export type Grade = keyof typeof WEIGHTS;

export interface ExpectedNote {
  /** When the note is heard, on the run's timeline. */
  time: number;
  /** Where it is in the song, in song seconds (for bars and sections). */
  songTime: number;
  pitch: number;
  hand: Hand;
}

export type PressVerdict = { kind: 'hit'; grade: Grade; offset: number } | { kind: 'wrong' };

/** Counts and timing for one group of notes (a hand, a section, the whole run). */
export interface Tally {
  expected: number;
  perfect: number;
  good: number;
  ok: number;
  missed: number;
  /** Weighted hits ÷ expected, 0 to 1. */
  accuracy: number;
  /** Mean signed offset of the hits in seconds (early is negative); null with no hits. */
  meanOffset: number | null;
  /** Mean and standard deviation of the absolute offset; null with no hits. */
  meanAbsOffset: number | null;
  spread: number | null;
}

/** A stretch of the song, in song seconds. */
export interface ScoreRegion {
  label: string;
  start: number;
  end: number;
}

export interface ScoreBar {
  number: number;
  start: number;
  end: number;
}

export interface SectionResult extends ScoreRegion {
  tally: Tally;
}

export interface TroubleSpot {
  fromBar: number;
  toBar: number;
  /** Song seconds. */
  start: number;
  end: number;
  accuracy: number;
  expected: number;
  missed: number;
}

export interface PerformanceResult {
  /** Shape of this record. */
  version: 1;
  /** 0 to 100. */
  score: number;
  total: Tally;
  hands: Record<Hand, Tally>;
  sections: SectionResult[];
  /** Worst first. */
  troubleSpots: TroubleSpot[];
  wrongNotes: number;
  wrongPerMinute: number;
  /** Heard seconds from the start of the song (after the count-in) to the end of the run. */
  durationSec: number;
  /** Hits per bin of `binSec`, from −ok to +ok, for each hand. */
  histogram: { binSec: number; left: number[]; right: number[] };
  windows: Windows;
}

export interface ResultOptions {
  /** Run timeline: when the song began (after the count-in) and when the run ended. */
  startTime: number;
  endTime: number;
  /** Named sections of the song; empty to use four-bar phrases. */
  sections: readonly ScoreRegion[];
  bars: readonly ScoreBar[];
  /** What a bar is called in a phrase label: "Bars 1–4", or "Parts 1–4" with no beats. */
  barWord?: string;
}

interface Tracked extends ExpectedNote {
  matched: boolean;
  offset: number;
}

const round = (value: number, digits: number) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

function gradeOf(distance: number, windows: Windows): Grade {
  if (distance <= windows.perfect + EPSILON) return 'perfect';
  return distance <= windows.good + EPSILON ? 'good' : 'ok';
}

function tally(notes: readonly Tracked[], windows: Windows): Tally {
  const counts = { perfect: 0, good: 0, ok: 0 };
  let sum = 0;
  let sumAbs = 0;
  let hits = 0;
  for (const note of notes) {
    if (!note.matched) continue;
    counts[gradeOf(Math.abs(note.offset), windows)]++;
    sum += note.offset;
    sumAbs += Math.abs(note.offset);
    hits++;
  }
  const expected = notes.length;
  const weighted = counts.perfect * WEIGHTS.perfect + counts.good * WEIGHTS.good + counts.ok * WEIGHTS.ok;
  const meanAbs = hits ? sumAbs / hits : 0;
  let variance = 0;
  for (const note of notes) if (note.matched) variance += (Math.abs(note.offset) - meanAbs) ** 2;
  return {
    expected,
    ...counts,
    missed: expected - hits,
    accuracy: expected ? round(weighted / expected, 4) : 0,
    meanOffset: hits ? round(sum / hits, 4) : null,
    meanAbsOffset: hits ? round(meanAbs, 4) : null,
    spread: hits ? round(Math.sqrt(variance / hits), 4) : null,
  };
}

/** Four-bar phrases covering `bars`, used when the Song names no sections. */
export function phrases(bars: readonly ScoreBar[], word = 'Bar'): ScoreRegion[] {
  const regions: ScoreRegion[] = [];
  for (let i = 0; i < bars.length; i += PHRASE_BARS) {
    const first = bars[i];
    const last = bars[Math.min(i + PHRASE_BARS, bars.length) - 1];
    if (!first || !last) break;
    const label = first.number === last.number ? `${word} ${first.number}` : `${word}s ${first.number}–${last.number}`;
    regions.push({ label, start: first.start, end: last.end });
  }
  return regions;
}

export class Scorer {
  private readonly windows: Windows;
  /** Expected notes of each pitch, in time order. */
  private readonly byPitch = new Map<number, Tracked[]>();
  private hitCount = 0;
  private wrongCount = 0;

  constructor(windows: Windows = WINDOWS) {
    this.windows = windows;
  }

  /** Notes hit so far. */
  get hits(): number {
    return this.hitCount;
  }

  /** Key presses so far that matched nothing. */
  get wrong(): number {
    return this.wrongCount;
  }

  reset(): void {
    this.byPitch.clear();
    this.hitCount = 0;
    this.wrongCount = 0;
  }

  expect(note: ExpectedNote): void {
    let list = this.byPitch.get(note.pitch);
    if (!list) {
      list = [];
      this.byPitch.set(note.pitch, list);
    }
    const tracked: Tracked = { ...note, matched: false, offset: 0 };
    // Almost always the latest; keep the list in time order whatever the caller does.
    let at = list.length;
    while (at > 0 && (list[at - 1]?.time ?? -Infinity) > note.time) at--;
    list.splice(at, 0, tracked);
  }

  /**
   * A key went down at `time`. It takes the nearest unmatched expected note of its pitch
   * within the ok window (the earlier one on a tie), or it is a wrong note.
   */
  press(pitch: number, time: number): PressVerdict {
    let best: Tracked | null = null;
    let bestDistance = Infinity;
    for (const note of this.byPitch.get(pitch) ?? []) {
      if (note.time > time + this.windows.ok + EPSILON) break;
      if (note.matched) continue;
      const distance = Math.abs(time - note.time);
      if (distance > this.windows.ok + EPSILON) continue;
      if (distance < bestDistance - EPSILON) {
        best = note;
        bestDistance = distance;
      }
    }
    if (!best) {
      this.wrongCount++;
      return { kind: 'wrong' };
    }
    best.matched = true;
    best.offset = time - best.time;
    this.hitCount++;
    return { kind: 'hit', grade: gradeOf(bestDistance, this.windows), offset: best.offset };
  }

  /**
   * Add the run up. A note counts if it was hit, or if its window had closed by `endTime`;
   * a note the run never reached, or was still waiting on, is left out.
   */
  result(options: ResultOptions): PerformanceResult {
    const { windows } = this;
    const scored: Tracked[] = [];
    for (const list of this.byPitch.values()) {
      for (const note of list) {
        if (note.matched || note.time + windows.ok <= options.endTime + EPSILON) scored.push(note);
      }
    }
    scored.sort((a, b) => a.time - b.time || a.pitch - b.pitch);

    const total = tally(scored, windows);
    const weighted = total.perfect * WEIGHTS.perfect + total.good * WEIGHTS.good + total.ok * WEIGHTS.ok;
    const raw = total.expected ? (100 * (weighted - WRONG_PENALTY * this.wrongCount)) / total.expected : 0;
    const durationSec = Math.max(0, options.endTime - options.startTime);

    const bins = Math.round((2 * windows.ok) / HISTOGRAM_BIN);
    const histogram = { binSec: HISTOGRAM_BIN, left: new Array<number>(bins).fill(0), right: new Array<number>(bins).fill(0) };
    for (const note of scored) {
      if (!note.matched) continue;
      const bin = Math.floor((note.offset + windows.ok) / HISTOGRAM_BIN + EPSILON);
      const row = histogram[note.hand];
      const index = Math.min(bins - 1, Math.max(0, bin));
      row[index] = (row[index] ?? 0) + 1;
    }

    const inRegion = (region: { start: number; end: number }) =>
      scored.filter((n) => n.songTime >= region.start - EPSILON && n.songTime < region.end - EPSILON);
    const regions = options.sections.length > 0 ? options.sections : phrases(options.bars, options.barWord);
    const sections: SectionResult[] = [];
    for (const region of regions) {
      const notes = inRegion(region);
      if (notes.length > 0) sections.push({ label: region.label, start: region.start, end: region.end, tally: tally(notes, windows) });
    }

    return {
      version: 1,
      score: round(Math.max(0, raw), 1),
      total,
      hands: {
        left: tally(scored.filter((n) => n.hand === 'left'), windows),
        right: tally(scored.filter((n) => n.hand === 'right'), windows),
      },
      sections,
      troubleSpots: troubleSpots(options.bars.map((bar) => ({ bar, tally: tally(inRegion(bar), windows) }))),
      wrongNotes: this.wrongCount,
      wrongPerMinute: durationSec > 0 ? round((this.wrongCount * 60) / durationSec, 2) : 0,
      durationSec: round(durationSec, 3),
      histogram,
      windows: { ...windows },
    };
  }
}

interface BarTally {
  bar: ScoreBar;
  tally: Tally;
}

/** Accuracy of several bars taken together (their weighted hits ÷ their expected notes). */
function joined(bars: readonly BarTally[]): { accuracy: number; expected: number; missed: number } {
  let expected = 0;
  let missed = 0;
  let weighted = 0;
  for (const { tally: t } of bars) {
    expected += t.expected;
    missed += t.missed;
    weighted += t.perfect * WEIGHTS.perfect + t.good * WEIGHTS.good + t.ok * WEIGHTS.ok;
  }
  return { accuracy: expected ? round(weighted / expected, 4) : 1, expected, missed };
}

/**
 * The bar ranges that went worst (ADR 0006): two-bar windows under 90% are ranked by
 * accuracy; up to three that don't overlap are kept, and as each is kept it grows by its
 * weak neighbouring bars, up to four bars.
 */
function troubleSpots(all: readonly BarTally[]): TroubleSpot[] {
  const withNotes = all.filter((b) => b.tally.expected > 0).length;
  const width = withNotes >= 2 && all.length >= 2 ? 2 : 1;
  const windows: { from: number; to: number; accuracy: number; missed: number }[] = [];
  for (let from = 0; from + width <= all.length; from++) {
    const stats = joined(all.slice(from, from + width));
    if (stats.expected > 0 && stats.accuracy < TROUBLE_BELOW - EPSILON) {
      windows.push({ from, to: from + width - 1, accuracy: stats.accuracy, missed: stats.missed });
    }
  }
  windows.sort((a, b) => a.accuracy - b.accuracy || b.missed - a.missed || a.from - b.from);

  const taken = new Uint8Array(all.length);
  const weak = (index: number): number | null => {
    const bar = all[index];
    if (!bar || taken[index] || bar.tally.expected === 0 || bar.tally.accuracy >= TROUBLE_BELOW - EPSILON) return null;
    return bar.tally.accuracy;
  };
  const picked: { from: number; to: number }[] = [];
  for (const window of windows) {
    if (picked.length === MAX_TROUBLE_SPOTS) break;
    let free = true;
    for (let i = window.from; i <= window.to; i++) if (taken[i]) free = false;
    if (!free) continue;
    for (let i = window.from; i <= window.to; i++) taken[i] = 1;
    const spot = { from: window.from, to: window.to };
    while (spot.to - spot.from + 1 < MAX_TROUBLE_BARS) {
      const after = weak(spot.to + 1);
      const before = weak(spot.from - 1);
      if (after === null && before === null) break;
      // The weaker neighbour joins; the later one on a tie.
      if (before === null || (after !== null && after <= before)) taken[++spot.to] = 1;
      else taken[--spot.from] = 1;
    }
    picked.push(spot);
  }

  return picked.flatMap((spot) => {
    const first = all[spot.from];
    const last = all[spot.to];
    if (!first || !last) return [];
    const stats = joined(all.slice(spot.from, spot.to + 1));
    return [{ fromBar: first.bar.number, toBar: last.bar.number, start: first.bar.start, end: last.bar.end, ...stats }];
  });
}
