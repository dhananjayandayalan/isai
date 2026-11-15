// Falling notes: bars drop onto the keyboard in hand colours, with beat and bar lines and
// a chord lane. Drawn from the keyboard's own layout, so every column sits over its key at
// every keyboard size. Plain TypeScript on a 2D context, called from the keyboard's frame
// loop (rule 5); the song position comes from the engine (rule 6).

import type { Hand, NoteIndex } from '../engine/activeNotes';
import type { Ctx2D } from '../piano/KeyboardRenderer';
import type { KeyLayout } from '../piano/layout';
import type { NoteLabel, NoteNamer } from '../theory/labels';
import { laneIndexAt, type LaneEntry } from './chordLane';
import { motionInHand } from './lines';
import type { StageColors } from './stage';

export interface FallingFrame {
  layout: KeyLayout;
  /** Stage height in CSS pixels; its bottom edge is "now", on top of the keys. */
  height: number;
  colors: StageColors;
  /** Song seconds at the bottom edge. */
  seconds: number;
  /** Song seconds shown above the keys. */
  lookahead: number;
  index: NoteIndex;
  /** A name for each note of `index.notes` (same order), or null for no names. */
  labels: readonly NoteLabel[] | null;
  /** Beat times (song seconds); bar lines are drawn stronger. */
  beats: readonly number[];
  barStarts: readonly number[];
  lane: readonly LaneEntry[];
  /** The hand not being practised: drawn faint, or not at all. */
  otherHand: { hand: Hand; show: boolean } | null;
}

/** How faint the hand you aren't playing is drawn, on the falling notes and the staff. */
export const GHOST_ALPHA = 0.3;
/** Bars are never drawn thinner than this, so short notes stay visible. */
export const MIN_BAR = 3;

/** For reduced motion: the position held at the last beat, so the view moves once per beat. */
export function steppedPosition(seconds: number, beats: readonly number[]): number {
  let lo = 0;
  let hi = beats.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((beats[mid] ?? Infinity) <= seconds) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 ? (beats[lo - 1] ?? seconds) : seconds;
}

/**
 * Name every note once per song: each hand is spelled as a line, so a note outside the key
 * follows where that hand goes next.
 */
export function labelNotes(index: NoteIndex, namer: NoteNamer): NoteLabel[] {
  const motions = motionInHand(index);
  return index.notes.map((note, i) => namer.note(note.midi, motions[i]));
}

/** First note that may still be on screen at `seconds` (every earlier one has ended). */
function firstVisible(index: NoteIndex, seconds: number): number {
  let lo = 0;
  let hi = index.maxEnd.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((index.maxEnd[mid] ?? Infinity) <= seconds) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function drawFallingNotes(ctx: Ctx2D, frame: FallingFrame): void {
  const { layout, height, colors, seconds, lookahead, index } = frame;
  const width = layout.width;
  const yAt = (t: number) => height - ((t - seconds) / lookahead) * height;
  const until = seconds + lookahead;

  ctx.globalAlpha = 1;
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, width, height);

  // Beat lines, then bar lines over them.
  const bars = new Set(frame.barStarts);
  for (const strong of [false, true]) {
    ctx.fillStyle = strong ? colors.gridStrong : colors.grid;
    for (const beat of strong ? frame.barStarts : frame.beats) {
      if (beat < seconds || beat > until || (!strong && bars.has(beat))) continue;
      ctx.fillRect(0, Math.round(yAt(beat)), width, 1);
    }
  }

  ctx.font = colors.noteFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (let i = firstVisible(index, seconds); i < index.notes.length; i++) {
    const note = index.notes[i];
    if (!note || note.start > until) break;
    if (note.end <= seconds) continue;
    const other = frame.otherHand?.hand === note.hand ? frame.otherHand : null;
    if (other && !other.show) continue;
    ctx.globalAlpha = other ? GHOST_ALPHA : 1;
    const bottom = Math.min(height, yAt(note.start));
    const top = Math.max(0, Math.min(bottom - MIN_BAR, yAt(note.end)));
    const right = note.hand === 'right';
    const key = layout.byMidi[note.midi];
    if (!key) {
      drawEdgeMarker(ctx, note.midi < layout.range.low ? 'below' : 'above', width, bottom, layout.whiteWidth, right ? colors.right : colors.left);
      continue;
    }
    const inset = key.black ? 0.5 : 1.5;
    ctx.fillStyle = right ? colors.right : colors.left;
    ctx.strokeStyle = right ? colors.rightBorder : colors.leftBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(key.x + inset, top, key.width - inset * 2, bottom - top, Math.min(4, key.width / 4));
    ctx.fill();
    ctx.stroke();
    const label = frame.labels?.[i];
    if (label) drawLabel(ctx, label, key.x + key.width / 2, bottom, key.width, bottom - top, right ? colors.onRight : colors.onLeft, colors.noteSize);
  }
  ctx.globalAlpha = 1;

  drawLane(ctx, frame, yAt);
}

/** A note's name at the bottom of its bar, when it fits; swara octave dots above or below. */
function drawLabel(ctx: Ctx2D, label: NoteLabel, x: number, bottom: number, width: number, barHeight: number, fill: string, size: number) {
  const textWidth = label.text.length * size * 0.62;
  const dots = label.dotsAbove + label.dotsBelow;
  if (textWidth > width - 2 || barHeight < size + 4 + dots * 4) return;
  ctx.fillStyle = fill;
  const baseline = bottom - 2 - label.dotsBelow * 4;
  ctx.fillText(label.text, x, baseline);
  for (let d = 0; d < label.dotsBelow; d++) dot(ctx, x, baseline + 2 + d * 4);
  for (let d = 0; d < label.dotsAbove; d++) dot(ctx, x, baseline - size - 2 - d * 4);
}

function dot(ctx: Ctx2D, x: number, y: number) {
  ctx.beginPath();
  ctx.arc(x, y, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

/** A note off the keyboard: a triangle at that end of the stage, at the note's height. */
function drawEdgeMarker(ctx: Ctx2D, side: 'below' | 'above', width: number, y: number, whiteWidth: number, fill: string) {
  const size = Math.max(6, Math.min(12, whiteWidth * 0.8));
  const tip = side === 'below' ? 0 : width;
  const base = side === 'below' ? size : width - size;
  const at = Math.max(size / 2, y - size / 2);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(base, at - size / 2);
  ctx.lineTo(tip, at);
  ctx.lineTo(base, at + size / 2);
  ctx.closePath();
  ctx.fill();
}

/** The chord lane down the left edge: each chord at its start, the one sounding now at the bottom. */
function drawLane(ctx: Ctx2D, frame: FallingFrame, yAt: (t: number) => number) {
  const { lane, colors, seconds, lookahead, height } = frame;
  if (lane.length === 0) return;
  const now = laneIndexAt(lane, seconds);
  const laneWidth = colors.laneSize * 6;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, laneWidth, height);
  ctx.globalAlpha = 1;
  ctx.font = colors.laneFont;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  lane.forEach((entry, i) => {
    if (i !== now && (entry.start < seconds || entry.start > seconds + lookahead)) return;
    const y = i === now ? height - 4 : yAt(entry.start) - 4;
    ctx.fillStyle = i === now ? colors.ink : colors.inkMuted;
    ctx.fillText(entry.text, 6, y);
  });
}
