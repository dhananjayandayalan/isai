// Draws one keyboard frame onto a 2D canvas context. Plain TypeScript, no React: the
// controller calls it from requestAnimationFrame (rule 5). Colours come from the fixed
// --piano-* tokens (STYLE_GUIDE rule 6: piano keys never theme), read once.

import type { ActiveNote, Hand } from '../engine/activeNotes';
import {
  FLASH_CORRECT,
  FLASH_WRONG,
  KEY_EXPECT_LEFT,
  KEY_EXPECT_RIGHT,
  KEY_NEXT_LEFT,
  KEY_NEXT_RIGHT,
} from '../engine/practice/engine';
import { midiToName } from '../theory/pitch';
import { BLACK_HEIGHT_RATIO, type KeyLayout, type KeyRect } from './layout';

export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'globalAlpha'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'clearRect'
  | 'fillRect'
  | 'fillText'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'closePath'
  | 'fill'
  | 'stroke'
  | 'roundRect'
  | 'arc'
>;

export interface PianoColors {
  frame: string;
  white: string;
  /** A white key the hand you aren't practising is playing. */
  whiteHint: string;
  /** A key you are holding, or should press now. */
  whiteActive: string;
  black: string;
  blackActive: string;
  label: string;
  /** Song-note pills on the keys (and the off-keyboard markers), per hand. */
  pillRight: string;
  pillLeft: string;
  pillEdge: string;
  /** The mark on a key you played right, and on one that isn't in the step. */
  correct: string;
  wrong: string;
  /** CSS font shorthand for the C labels. */
  labelFont: string;
  /** Key corner radius in CSS pixels. */
  radius: number;
}

/** Read the piano tokens from computed style (the document root). */
export function readPianoColors(style: Pick<CSSStyleDeclaration, 'getPropertyValue'>): PianoColors {
  const v = (name: string) => style.getPropertyValue(name).trim();
  return {
    frame: v('--piano-frame'),
    white: v('--piano-white'),
    whiteHint: v('--piano-white-hint'),
    whiteActive: v('--piano-white-active'),
    black: v('--piano-black'),
    blackActive: v('--piano-black-active'),
    label: v('--piano-label'),
    pillRight: v('--piano-pill-right'),
    pillLeft: v('--piano-pill-left'),
    pillEdge: v('--piano-pill-edge'),
    correct: v('--piano-correct'),
    wrong: v('--piano-wrong'),
    labelFont: `${v('--weight-medium')} ${v('--text-2xs')} ${v('--font-mono')}`.trim(),
    radius: Number.parseFloat(v('--radius-sm')) || 0,
  };
}

/** What practice adds to the keyboard, straight from the engine's arrays (`PracticeView`). */
export interface PracticeOverlay {
  /** KEY_* flags per MIDI note: the step to play now and the one after. */
  keys: Uint8Array;
  /** FLASH_* per MIDI note, shown while `now < flashUntil`. */
  flashKind: Uint8Array;
  flashUntil: Float64Array;
  /** Audio-clock seconds. */
  now: number;
  /** Song notes of this hand are drawn dimmed. */
  dimHand: Hand | null;
}

export interface KeyboardFrame {
  layout: KeyLayout;
  /** Height in CSS pixels. */
  height: number;
  colors: PianoColors;
  /** Velocity of each key you are holding (index = MIDI note), 0 when up. */
  held: Uint8Array;
  /** Song notes sounding now. */
  song: readonly ActiveNote[];
  /** Label each C with its octave (C4). */
  labels: boolean;
  practice?: PracticeOverlay | null;
}

/** How faint the hand you aren't practising is drawn. */
export const DIM_ALPHA = 0.45;

const EXPECT = KEY_EXPECT_RIGHT | KEY_EXPECT_LEFT;
const NEXT = KEY_NEXT_RIGHT | KEY_NEXT_LEFT;

export function drawKeyboard(ctx: Ctx2D, frame: KeyboardFrame): void {
  const { layout, height, colors, held } = frame;
  const practice = frame.practice ?? null;
  const flags = practice?.keys;
  const songHands = new Map<number, Hand>();
  let below: Hand | null = null;
  let above: Hand | null = null;
  for (const note of frame.song) {
    if (note.midi < layout.range.low) below = note.hand;
    else if (note.midi > layout.range.high) above = note.hand;
    // When both hands sound the same key, show the one being practised.
    else if (songHands.get(note.midi) === undefined || note.hand !== practice?.dimHand) {
      songHands.set(note.midi, note.hand);
    }
  }

  ctx.clearRect(0, 0, layout.width, height);
  ctx.fillStyle = colors.frame;
  ctx.fillRect(0, 0, layout.width, height);

  const gap = Math.max(1, layout.whiteWidth * 0.04);
  const blackHeight = height * BLACK_HEIGHT_RATIO;
  const pill = Math.min(layout.whiteWidth * 0.7, height * 0.16);
  const whiteY = height - gap * 2 - pill;
  const blackY = blackHeight - gap * 2 - pill;

  /** The pill, outline or nothing for one key, by priority: play now, sounding, up next. */
  const mark = (key: KeyRect, y: number) => {
    const flag = flags?.[key.midi] ?? 0;
    const hand = songHands.get(key.midi);
    if (flag & EXPECT) {
      drawPill(ctx, key, gap, y, pill, flag & KEY_EXPECT_RIGHT ? 'right' : 'left', colors);
    } else if (hand) {
      const dim = hand === practice?.dimHand;
      if (dim) ctx.globalAlpha = DIM_ALPHA;
      drawPill(ctx, key, gap, y, pill, hand, colors);
      if (dim) ctx.globalAlpha = 1;
    } else if (flag & NEXT) {
      drawOutline(ctx, key, gap, y, pill, key.black ? colors.pillRight : colors.pillLeft, colors.radius);
    }
  };

  for (const key of layout.whites) {
    const flag = flags?.[key.midi] ?? 0;
    let fill = colors.white;
    if ((held[key.midi] ?? 0) > 0 || flag & EXPECT) fill = colors.whiteActive;
    else if (practice?.dimHand && songHands.get(key.midi) === practice.dimHand) fill = colors.whiteHint;
    drawKey(ctx, key, gap, height, fill, colors.radius);
  }
  if (frame.labels) {
    ctx.font = colors.labelFont;
    ctx.fillStyle = colors.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (const key of layout.whites) {
      if (key.midi % 12 === 0) {
        ctx.fillText(midiToName(key.midi), key.x + key.width / 2, height - pill - gap * 4);
      }
    }
  }
  for (const key of layout.whites) mark(key, whiteY);
  for (const key of layout.blacks) {
    const flag = flags?.[key.midi] ?? 0;
    const fill = (held[key.midi] ?? 0) > 0 || flag & EXPECT ? colors.blackActive : colors.black;
    drawKey(ctx, key, 0, blackHeight, fill, colors.radius);
    mark(key, blackY);
  }
  if (below) drawMarker(ctx, 'below', layout.width, height, layout.whiteWidth, below, colors);
  if (above) drawMarker(ctx, 'above', layout.width, height, layout.whiteWidth, above, colors);

  if (practice) {
    for (let midi = layout.range.low; midi <= layout.range.high; midi++) {
      const kind = practice.flashKind[midi] ?? 0;
      if (kind === 0 || (practice.flashUntil[midi] ?? 0) <= practice.now) continue;
      const key = layout.byMidi[midi];
      if (!key) continue;
      const y = (key.black ? blackY : whiteY) + pill / 2;
      drawFlash(ctx, key, y, Math.min(key.width * 0.38, pill * 0.6), kind, colors);
    }
  }
}

/** How many correct or wrong marks are showing at `now`. The controller redraws when it changes. */
export function countFlashes(practice: Pick<PracticeOverlay, 'flashKind' | 'flashUntil'>, now: number): number {
  let count = 0;
  for (let midi = 0; midi < 128; midi++) {
    if ((practice.flashKind[midi] ?? 0) !== 0 && (practice.flashUntil[midi] ?? 0) > now) count++;
  }
  return count;
}

function drawKey(ctx: Ctx2D, key: KeyRect, gap: number, height: number, fill: string, radius: number) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(key.x + gap / 2, 0, key.width - gap, height, [0, 0, radius, radius]);
  ctx.fill();
}

/** A note on a key: a pill in the hand's colour near the front of the key. */
function drawPill(
  ctx: Ctx2D,
  key: KeyRect,
  gap: number,
  y: number,
  size: number,
  hand: Hand,
  colors: PianoColors,
) {
  const inset = gap + key.width * 0.12;
  ctx.fillStyle = hand === 'right' ? colors.pillRight : colors.pillLeft;
  // The edge keeps a light right-hand pill visible on a white key (as in the prototype).
  ctx.strokeStyle = colors.pillEdge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(key.x + inset, y, key.width - inset * 2, size, colors.radius);
  ctx.fill();
  ctx.stroke();
}

/** The step after this one: the same pill shape, outlined only. */
function drawOutline(ctx: Ctx2D, key: KeyRect, gap: number, y: number, size: number, stroke: string, radius: number) {
  const inset = gap + key.width * 0.12;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(key.x + inset, y, key.width - inset * 2, size, radius);
  ctx.stroke();
}

/**
 * The key you just pressed: a plain disc if it was right, a disc with a cross if it
 * isn't in the step. Shape, not hue, tells them apart (STYLE_GUIDE rule 3: greys only).
 */
function drawFlash(ctx: Ctx2D, key: KeyRect, y: number, radius: number, kind: number, colors: PianoColors) {
  const x = key.x + key.width / 2;
  ctx.fillStyle = kind === FLASH_CORRECT ? colors.correct : colors.wrong;
  ctx.strokeStyle = colors.pillEdge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (kind !== FLASH_WRONG) return;
  const arm = radius * 0.45;
  ctx.strokeStyle = colors.pillRight;
  ctx.beginPath();
  ctx.moveTo(x - arm, y - arm);
  ctx.lineTo(x + arm, y + arm);
  ctx.moveTo(x + arm, y - arm);
  ctx.lineTo(x - arm, y + arm);
  ctx.stroke();
}

/** A song note below or above this keyboard: a triangle pointing out of that end. */
function drawMarker(
  ctx: Ctx2D,
  side: 'below' | 'above',
  width: number,
  height: number,
  whiteWidth: number,
  hand: Hand,
  colors: PianoColors,
) {
  const size = Math.min(whiteWidth * 0.8, height * 0.2);
  const y = height * 0.2;
  const tip = side === 'below' ? 0 : width;
  const base = side === 'below' ? size : width - size;
  ctx.fillStyle = hand === 'right' ? colors.pillRight : colors.pillLeft;
  ctx.beginPath();
  ctx.moveTo(base, y - size / 2);
  ctx.lineTo(tip, y);
  ctx.lineTo(base, y + size / 2);
  ctx.closePath();
  ctx.fill();
}
