// The chord lane: the song's chords, named once per song and notation setting, and found
// by time every frame. Pure.

import type { LaneChord, NoteNamer } from '../theory/labels';

export interface LaneEntry {
  start: number;
  end: number;
  /** The chord's name in the chosen notation ("G", "V7/V", "Sol 7"). */
  text: string;
}

/** Name every chord, giving each its successor so secondary dominants can be read. */
export function buildLane(chords: readonly (LaneChord & { start: number; end: number })[], namer: NoteNamer): LaneEntry[] {
  const sorted = [...chords].sort((a, b) => a.start - b.start);
  return sorted.map((chord, i) => ({ start: chord.start, end: chord.end, text: namer.chord(chord, sorted[i + 1]) }));
}

/** Index of the chord sounding at `seconds`, or -1. Binary search: called every frame. */
export function laneIndexAt(lane: readonly LaneEntry[], seconds: number): number {
  let lo = 0;
  let hi = lane.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((lane[mid]?.start ?? Infinity) <= seconds) lo = mid + 1;
    else hi = mid;
  }
  const index = lo - 1;
  const entry = lane[index];
  return entry && seconds < entry.end ? index : -1;
}
