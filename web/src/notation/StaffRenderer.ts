// A scrolling grand staff: treble for the right hand, bass for the left, with clefs, the
// key signature, ledger lines and accidentals. Notes are placed by time, not engraved
// rhythm: it is a reading aid, not sheet music. Plain TypeScript on a 2D context, drawn
// from the keyboard's frame loop (rule 5).

import type { Hand, NoteIndex } from '../engine/activeNotes';
import type { Ctx2D } from '../piano/KeyboardRenderer';
import { signature, type KeySpec } from '../theory/keys';
import { Speller, staffStep } from '../theory/spelling';
import { laneIndexAt, type LaneEntry } from './chordLane';
import { GHOST_ALPHA } from './FallingNotes';
import { motionInHand } from './lines';
import type { StageColors } from './stage';

/** A note ready for the staff: where it sits and which accidental to print, if any. */
export interface StaffNote {
  start: number;
  end: number;
  hand: Hand;
  /** Diatonic step (C4 = 28). */
  step: number;
  /** "♯", "♭", "♮", "𝄪", "𝄫", or "" when the key signature already says it. */
  accidental: string;
}

/** Bottom and top line of each staff, as steps: treble E4–F5, bass G2–A3. */
export const TREBLE = { bottom: 30, top: 38 } as const;
export const BASS = { bottom: 18, top: 26 } as const;

/** Key-signature positions on the treble staff, in the order they are written. Bass is two octaves down. */
const SHARP_STEPS = [38, 35, 39, 36, 33, 37, 34];
const FLAT_STEPS = [34, 37, 33, 36, 32, 35, 31];

const ACCIDENTAL_GLYPH: Record<number, string> = { [-2]: '𝄫', [-1]: '♭', 0: '♮', 1: '♯', 2: '𝄪' };
const TREBLE_CLEF = '𝄞';
const BASS_CLEF = '𝄢';

/** Each letter's accidental in the key signature (letter index → semitones). */
function signatureByLetter(spec: KeySpec): number[] {
  const byLetter = [0, 0, 0, 0, 0, 0, 0];
  const count = signature(spec);
  // Sharps go F C G D A E B, flats B E A D G C F (as letter indices).
  const order = count > 0 ? [3, 0, 4, 1, 5, 2, 6] : [6, 2, 5, 1, 4, 0, 3];
  for (let i = 0; i < Math.min(7, Math.abs(count)); i++) byLetter[order[i] ?? 0] = Math.sign(count);
  return byLetter;
}

/**
 * Spell every note for the staff once per song. Each hand is a line, so a note outside the
 * key follows where that hand goes next. An accidental is printed whenever the note
 * differs from the key signature (the staff doesn't carry accidentals through a bar).
 */
export function buildStaffNotes(index: NoteIndex, spec: KeySpec): StaffNote[] {
  const speller = new Speller(spec);
  const keyAccidentals = signatureByLetter(spec);
  const motions = motionInHand(index);
  return index.notes.map((note, i) => {
    const spelled = speller.pitch(note.midi, motions[i]);
    const fromKey = spelled.accidental !== keyAccidentals[spelled.letter];
    return {
      start: note.start,
      end: note.end,
      hand: note.hand,
      step: staffStep(spelled),
      accidental: fromKey ? (ACCIDENTAL_GLYPH[spelled.accidental] ?? '') : '',
    };
  });
}

export interface StaffFrame {
  width: number;
  height: number;
  colors: StageColors;
  seconds: number;
  /** Song seconds shown to the right of the playhead. */
  lookahead: number;
  notes: readonly StaffNote[];
  /** Key signature: sharps (positive) or flats (negative). */
  keySignature: number;
  barStarts: readonly number[];
  lane: readonly LaneEntry[];
  /** The hand not being practised: drawn faint, or not at all. */
  otherHand: { hand: Hand; show: boolean } | null;
}

/** Where the playhead sits, as a share of the width after the clefs. */
export const PLAYHEAD_AT = 0.2;

export interface StaffGeometry {
  /** Half the distance between two staff lines: one step. */
  half: number;
  trebleTopY: number;
  bassTopY: number;
  /** Where notes start (after clef and key signature) and where the playhead is. */
  noteLeft: number;
  playheadX: number;
  pxPerSecond: number;
}

export function staffGeometry(width: number, height: number, lookahead: number, keySignature: number): StaffGeometry {
  // Two staves of 4 gaps, a gap of 6 steps between them, a lane on top and room below.
  const half = Math.max(3, Math.min(9, height / 36));
  const laneHeight = half * 6;
  const trebleTopY = laneHeight + half * 4;
  const bassTopY = trebleTopY + half * 8 + half * 6;
  const noteLeft = half * 8 + Math.min(7, Math.abs(keySignature)) * half * 2 + half * 2;
  const playheadX = noteLeft + (width - noteLeft) * PLAYHEAD_AT;
  const pxPerSecond = (width - playheadX) / lookahead;
  return { half, trebleTopY, bassTopY, noteLeft, playheadX, pxPerSecond };
}

/** The y of a step on the given staff. */
export function stepY(geometry: StaffGeometry, staff: 'treble' | 'bass', step: number): number {
  return staff === 'treble'
    ? geometry.trebleTopY + (TREBLE.top - step) * geometry.half
    : geometry.bassTopY + (BASS.top - step) * geometry.half;
}

/** Ledger-line steps a note needs on its staff (none inside it). */
export function ledgerSteps(staff: 'treble' | 'bass', step: number): number[] {
  const { bottom, top } = staff === 'treble' ? TREBLE : BASS;
  const steps: number[] = [];
  for (let s = bottom - 2; s >= step; s -= 2) steps.push(s);
  for (let s = top + 2; s <= step; s += 2) steps.push(s);
  return steps;
}

export function drawStaff(ctx: Ctx2D, frame: StaffFrame): void {
  const { width, height, colors, seconds, lookahead } = frame;
  const g = staffGeometry(width, height, lookahead, frame.keySignature);
  const xAt = (t: number) => g.playheadX + (t - seconds) * g.pxPerSecond;
  const from = seconds - (g.playheadX - g.noteLeft) / g.pxPerSecond;

  ctx.globalAlpha = 1;
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, width, height);

  // Staff lines.
  ctx.fillStyle = colors.inkMuted;
  for (const staff of ['treble', 'bass'] as const) {
    const { bottom, top } = staff === 'treble' ? TREBLE : BASS;
    for (let s = bottom; s <= top; s += 2) ctx.fillRect(0, Math.round(stepY(g, staff, s)), width, 1);
  }

  // Bar lines across both staves.
  ctx.fillStyle = colors.gridStrong;
  const barTop = stepY(g, 'treble', TREBLE.top);
  const barBottom = stepY(g, 'bass', BASS.bottom);
  for (const bar of frame.barStarts) {
    const x = xAt(bar);
    if (x < g.noteLeft || x > width) continue;
    ctx.fillRect(Math.round(x), barTop, 1, barBottom - barTop);
  }

  // Notes: a duration line, ledger lines, the accidental and the notehead. Glyph sizes
  // (accidentals, clefs, key signature) follow the staff's line spacing, not the font
  // size: they must fit between the lines. Only the chord lane is text that scales.
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(g.half * 2.4)}px serif`;
  for (const note of frame.notes) {
    if (note.end < from || note.start > seconds + lookahead) continue;
    const other = frame.otherHand?.hand === note.hand ? frame.otherHand : null;
    if (other && !other.show) continue;
    const staff = note.hand === 'right' ? 'treble' : 'bass';
    const x = xAt(note.start);
    if (x < g.noteLeft) continue;
    const y = stepY(g, staff, note.step);
    const fill = note.hand === 'right' ? colors.right : colors.left;
    ctx.globalAlpha = other ? GHOST_ALPHA : 1;
    ctx.fillStyle = fill;
    ctx.fillRect(x, y - 1, Math.max(0, xAt(note.end) - x), 2);
    ctx.fillStyle = colors.ink;
    for (const ledger of ledgerSteps(staff, note.step)) {
      ctx.fillRect(x - g.half * 1.8, Math.round(stepY(g, staff, ledger)), g.half * 3.6, 1);
    }
    if (note.accidental) ctx.fillText(note.accidental, x - g.half * 1.4, y);
    ctx.fillStyle = fill;
    ctx.strokeStyle = note.hand === 'right' ? colors.rightBorder : colors.leftBorder;
    ctx.beginPath();
    ctx.arc(x, y, g.half * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Clefs and key signature over anything that scrolled under them.
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, g.noteLeft, height);
  ctx.fillStyle = colors.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(g.half * 7)}px serif`;
  ctx.fillText(TREBLE_CLEF, g.half, stepY(g, 'treble', 32));
  ctx.font = `${Math.round(g.half * 5)}px serif`;
  ctx.fillText(BASS_CLEF, g.half, stepY(g, 'bass', 24));
  drawKeySignature(ctx, g, frame.keySignature);

  // The playhead, and the chord lane above the treble staff.
  ctx.fillStyle = colors.ink;
  ctx.fillRect(Math.round(g.playheadX), barTop - g.half * 2, 2, barBottom - barTop + g.half * 4);
  drawLane(ctx, frame, g, xAt);
}

function drawKeySignature(ctx: Ctx2D, g: StaffGeometry, count: number) {
  const steps = count > 0 ? SHARP_STEPS : FLAT_STEPS;
  const glyph = count > 0 ? '♯' : '♭';
  ctx.font = `${Math.round(g.half * 2.6)}px serif`;
  ctx.textAlign = 'center';
  for (let i = 0; i < Math.min(7, Math.abs(count)); i++) {
    const x = g.half * 8 + i * g.half * 2 + g.half;
    const step = steps[i] ?? 34;
    ctx.fillText(glyph, x, stepY(g, 'treble', step));
    ctx.fillText(glyph, x, stepY(g, 'bass', step - 14));
  }
}

function drawLane(ctx: Ctx2D, frame: StaffFrame, g: StaffGeometry, xAt: (t: number) => number) {
  const { lane, colors, seconds, lookahead, width } = frame;
  if (lane.length === 0) return;
  const now = laneIndexAt(lane, seconds);
  ctx.font = colors.laneFont;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const y = g.half * 3;
  lane.forEach((entry, i) => {
    const x = i === now ? Math.max(g.noteLeft, xAt(entry.start)) : xAt(entry.start);
    if (i !== now && (entry.start < seconds || entry.start > seconds + lookahead || x > width)) return;
    ctx.fillStyle = i === now ? colors.ink : colors.inkMuted;
    ctx.fillText(entry.text, x + 2, y);
  });
}
