// Words and numbers for results and latency readouts. Pure.

import type { Tally } from './engine/practice/scorer';

/** "+14 ms", "−8 ms", "0 ms". */
export function formatMs(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  if (ms === 0) return '0 ms';
  return `${ms > 0 ? '+' : '−'}${Math.abs(ms)} ms`;
}

/** The timing in words: which way it leans, and whether it was steady. */
export function timingWords(tally: Tally): string {
  if (tally.meanOffset === null || tally.spread === null) return 'no notes in time';
  const ms = tally.meanOffset * 1000;
  let lean = 'on the beat';
  if (ms >= 40) lean = 'late';
  else if (ms >= 10) lean = 'slightly late';
  else if (ms <= -40) lean = 'early';
  else if (ms <= -10) lean = 'slightly early';
  return `${lean}, ${tally.spread < 0.03 ? 'steady' : 'uneven'}`;
}
