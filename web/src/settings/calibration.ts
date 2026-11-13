// Latency calibration (ADR 0006). Isai plays clicks, the learner taps any key in time, and
// the usual distance between tap and click is the offset for that keyboard and those
// speakers. Clicks run on the transport and taps come from MidiInput, both on the audio
// clock (rule 6). Plain TypeScript: the page only hears about the end, or about each tap
// through a callback that writes to a ref (rule 5).

import type { Instrument, Transport } from '../audio/types';
import { clampOffset, effectiveTime } from '../engine/practice/latency';
import type { AudioClock } from '../midi/AudioClock';
import type { MidiInput } from '../midi/MidiInput';

export const CALIBRATION = {
  /** Clicks in one calibration. */
  clicks: 16,
  bpm: 90,
  /** The first clicks only set the pulse; taps on them don't count. */
  leadIn: 4,
  /** Fewer steady taps than this is not a measurement. */
  minTaps: 6,
  /** A tap this far from the median tap is a slip, in seconds. */
  outlier: 0.15,
  /** Silence before the first click, in seconds. */
  start: 0.5,
  /** How long "play any key to test" keeps clicking, in clicks. */
  testClicks: 90,
} as const;

const CLICK_ACCENT = { midi: 91, velocity: 112 };
const CLICK_BEAT = { midi: 84, velocity: 84 };

export interface Measurement {
  /** Seconds a tap usually lands after its click (negative: before). */
  offset: number;
  /** Taps the offset is based on. */
  taps: number;
  /** Largest distance of a kept tap from the offset, in seconds. */
  spread: number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Distance from `time` to the nearest click, and which click that is. */
function nearest(clicks: readonly number[], time: number): { index: number; offset: number } | null {
  let best: { index: number; offset: number } | null = null;
  clicks.forEach((click, index) => {
    const offset = time - click;
    if (!best || Math.abs(offset) < Math.abs(best.offset)) best = { index, offset };
  });
  return best;
}

/**
 * The offset between taps and clicks: one tap per click (the closest), none on the
 * lead-in clicks, slips dropped, then the median. Null with too few steady taps.
 */
export function measureOffset(
  clicks: readonly number[],
  taps: readonly number[],
  options: { leadIn?: number; minTaps?: number; outlier?: number } = {},
): Measurement | null {
  const leadIn = options.leadIn ?? CALIBRATION.leadIn;
  const minTaps = options.minTaps ?? CALIBRATION.minTaps;
  const outlier = options.outlier ?? CALIBRATION.outlier;
  const perClick = new Map<number, number>();
  for (const tap of taps) {
    const hit = nearest(clicks, tap);
    if (!hit || hit.index < leadIn) continue;
    const kept = perClick.get(hit.index);
    if (kept === undefined || Math.abs(hit.offset) < Math.abs(kept)) perClick.set(hit.index, hit.offset);
  }
  const offsets = [...perClick.values()];
  if (offsets.length < minTaps) return null;
  const centre = median(offsets);
  const steady = offsets.filter((offset) => Math.abs(offset - centre) <= outlier);
  if (steady.length < minTaps) return null;
  const offset = clampOffset(median(steady));
  return {
    offset,
    taps: steady.length,
    spread: Math.max(...steady.map((value) => Math.abs(value - offset))),
  };
}

export interface CalibrationDeps {
  transport: Transport;
  metronome: Instrument;
  clock: AudioClock;
  midi: MidiInput;
}

export interface CalibrationOptions {
  /**
   * `calibrate`: 16 clicks, then `onDone` with the measurement (null if the taps were too
   * few or too ragged). `test`: clicks keep coming and each tap is reported through `onTap`
   * with the offset already applied, so a calibrated setup reads near 0.
   */
  mode: 'calibrate' | 'test';
  /** The offset in use now, in seconds. Only `test` applies it. */
  userOffset?: number;
  /** Seconds between a tap and its nearest click. Called per tap: write to a ref, not to state. */
  onTap?: (offset: number) => void;
  /** Called once when the clicks run out. Not called after `cancel`. */
  onDone: (measurement: Measurement | null) => void;
}

/**
 * Start clicking and listening. The transport must be free (nothing else playing): this
 * takes it over from position 0. Returns `cancel`, which stops everything at once.
 */
export function runCalibration(deps: CalibrationDeps, options: CalibrationOptions): () => void {
  const { transport, metronome, clock, midi } = deps;
  const period = 60 / CALIBRATION.bpm;
  const count = options.mode === 'calibrate' ? CALIBRATION.clicks : CALIBRATION.testClicks;
  const userOffset = options.mode === 'test' ? (options.userOffset ?? 0) : 0;

  transport.stop();
  transport.seek(0);
  // Position 0 is heard one lookahead from now, so every click's audio time is known ahead:
  // a tap just before a click can be matched to it before the transport has reached it.
  const anchor = clock.now() + transport.lookahead;
  const clicks = Array.from({ length: count }, (_, i) => anchor + CALIBRATION.start + i * period);
  const taps: number[] = [];
  let live = true;

  const ids = clicks.map((_, i) =>
    transport.schedule(CALIBRATION.start + i * period, (time) => {
      if (!live) return;
      const click = i % 4 === 0 ? CLICK_ACCENT : CLICK_BEAT;
      metronome.noteOn(click.midi, click.velocity, time);
    }),
  );

  const stopListening = midi.onNoteOn((event) => {
    if (!live) return;
    const now = clock.now();
    const time = Number.isFinite(event.time) && Math.abs(event.time - now) <= 1 ? event.time : now;
    const heard = effectiveTime(time, transport.outputLatency, userOffset);
    taps.push(heard);
    const hit = nearest(clicks, heard);
    if (hit) options.onTap?.(hit.offset);
  });

  const end = () => {
    if (!live) return;
    live = false;
    stopListening();
    for (const id of ids) transport.clear(id);
    transport.clear(doneId);
    transport.stop();
  };

  const doneId = transport.schedule(CALIBRATION.start + count * period, () => {
    if (!live) return;
    end();
    options.onDone(options.mode === 'calibrate' ? measureOffset(clicks, taps) : null);
  });

  transport.start();
  return end;
}
