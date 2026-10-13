// Draws one keyboard frame onto a 2D canvas context. Plain TypeScript, no React: the
// controller calls it from requestAnimationFrame (rule 5). Colours come from the design
// tokens (STYLE_GUIDE §4 Music), read once and re-read when the theme changes.

import type { ActiveNote, Hand } from '../engine/activeNotes';
import { midiToName } from '../theory/pitch';
import { BLACK_HEIGHT_RATIO, type KeyLayout, type KeyRect } from './layout';

export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
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
>;

export interface PianoColors {
  frame: string;
  white: string;
  whiteActive: string;
  black: string;
  blackActive: string;
  label: string;
  right: string;
  rightBorder: string;
  left: string;
  leftBorder: string;
  /** CSS font shorthand for the C labels. */
  labelFont: string;
  /** Key corner radius in CSS pixels. */
  radius: number;
}

/** Read the piano and hand tokens from computed style (the document root). */
export function readPianoColors(style: Pick<CSSStyleDeclaration, 'getPropertyValue'>): PianoColors {
  const v = (name: string) => style.getPropertyValue(name).trim();
  return {
    frame: v('--piano-frame'),
    white: v('--piano-white'),
    whiteActive: v('--piano-white-active'),
    black: v('--piano-black'),
    blackActive: v('--piano-black-active'),
    label: v('--piano-label'),
    right: v('--hand-right'),
    rightBorder: v('--hand-right-border'),
    left: v('--hand-left'),
    leftBorder: v('--hand-left-border'),
    labelFont: `${v('--weight-medium')} ${v('--text-2xs')} ${v('--font-mono')}`.trim(),
    radius: Number.parseFloat(v('--radius-sm')) || 0,
  };
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
}

export function drawKeyboard(ctx: Ctx2D, frame: KeyboardFrame): void {
  const { layout, height, colors, held } = frame;
  const songHands = new Map<number, Hand>();
  let below: Hand | null = null;
  let above: Hand | null = null;
  for (const note of frame.song) {
    if (note.midi < layout.range.low) below = note.hand;
    else if (note.midi > layout.range.high) above = note.hand;
    else songHands.set(note.midi, note.hand);
  }

  ctx.clearRect(0, 0, layout.width, height);
  ctx.fillStyle = colors.frame;
  ctx.fillRect(0, 0, layout.width, height);

  const gap = Math.max(1, layout.whiteWidth * 0.04);
  const blackHeight = height * BLACK_HEIGHT_RATIO;
  const pill = Math.min(layout.whiteWidth * 0.7, height * 0.16);

  for (const key of layout.whites) {
    const fill = (held[key.midi] ?? 0) > 0 ? colors.whiteActive : colors.white;
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
  for (const key of layout.whites) {
    const hand = songHands.get(key.midi);
    if (hand) drawPill(ctx, key, gap, height - gap * 2 - pill, pill, hand, colors);
  }
  for (const key of layout.blacks) {
    const fill = (held[key.midi] ?? 0) > 0 ? colors.blackActive : colors.black;
    drawKey(ctx, key, 0, blackHeight, fill, colors.radius);
    const hand = songHands.get(key.midi);
    if (hand) drawPill(ctx, key, gap, blackHeight - gap * 2 - pill, pill, hand, colors);
  }
  if (below) drawMarker(ctx, 'below', layout.width, height, layout.whiteWidth, below, colors);
  if (above) drawMarker(ctx, 'above', layout.width, height, layout.whiteWidth, above, colors);
}

function drawKey(ctx: Ctx2D, key: KeyRect, gap: number, height: number, fill: string, radius: number) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(key.x + gap / 2, 0, key.width - gap, height, [0, 0, radius, radius]);
  ctx.fill();
}

/** The song's note on a key: a bar in the hand's colour near the front of the key. */
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
  ctx.fillStyle = hand === 'right' ? colors.right : colors.left;
  ctx.strokeStyle = hand === 'right' ? colors.rightBorder : colors.leftBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(key.x + inset, y, key.width - inset * 2, size, colors.radius);
  ctx.fill();
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
  ctx.fillStyle = hand === 'right' ? colors.right : colors.left;
  ctx.beginPath();
  ctx.moveTo(base, y - size / 2);
  ctx.lineTo(tip, y);
  ctx.lineTo(base, y + size / 2);
  ctx.closePath();
  ctx.fill();
}
