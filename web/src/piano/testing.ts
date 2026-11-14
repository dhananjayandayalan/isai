// Test helpers for the piano: a recording 2D context, a fake canvas and manual frames.

import type { Ctx2D, PianoColors } from './KeyboardRenderer';
import type { CanvasLike, FrameScheduler } from './PianoController';

export type DrawOp =
  | { op: 'roundRect'; x: number; y: number; w: number; h: number; fill: string; alpha?: number }
  | { op: 'outline'; x: number; y: number; w: number; h: number; stroke: string }
  | { op: 'circle'; x: number; y: number; r: number; fill: string; alpha?: number }
  | { op: 'fillRect'; x: number; y: number; w: number; h: number; fill: string }
  | { op: 'text'; text: string; x: number; y: number; fill: string; font: string }
  | { op: 'path'; points: [number, number][]; fill: string }
  | { op: 'clear' }
  | { op: 'stroke'; stroke: string; width: number }
  | { op: 'transform'; scale: number };

/** Records what was drawn, with the fill colour in effect, instead of drawing. */
export class RecordingContext implements Ctx2D, Pick<CanvasRenderingContext2D, 'setTransform'> {
  fillStyle: CanvasRenderingContext2D['fillStyle'] = '';
  strokeStyle: CanvasRenderingContext2D['strokeStyle'] = '';
  lineWidth = 1;
  globalAlpha = 1;
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  readonly ops: DrawOp[] = [];
  private shape: Extract<DrawOp, { op: 'roundRect' | 'circle' }> | null = null;
  private filled = false;
  private points: [number, number][] = [];

  private get colour(): string {
    return String(this.fillStyle);
  }

  clearRect(): void {
    this.ops.push({ op: 'clear' });
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.ops.push({ op: 'fillRect', x, y, w, h, fill: this.colour });
  }
  fillText(text: string, x: number, y: number): void {
    this.ops.push({ op: 'text', text, x, y, fill: this.colour, font: this.font });
  }
  beginPath(): void {
    this.shape = null;
    this.filled = false;
    this.points = [];
  }
  roundRect(x: number, y: number, w: number, h: number): void {
    this.shape = { op: 'roundRect', x, y, w, h, fill: '' };
  }
  arc(x: number, y: number, r: number): void {
    this.shape = { op: 'circle', x, y, r, fill: '' };
  }
  moveTo(x: number, y: number): void {
    this.points.push([x, y]);
  }
  lineTo(x: number, y: number): void {
    this.points.push([x, y]);
  }
  closePath(): void {}
  fill(): void {
    this.filled = true;
    const alpha = this.globalAlpha === 1 ? {} : { alpha: this.globalAlpha };
    if (this.shape) this.ops.push({ ...this.shape, fill: this.colour, ...alpha });
    else if (this.points.length) this.ops.push({ op: 'path', points: this.points, fill: this.colour });
  }
  stroke(): void {
    // A shape that was stroked but never filled is an outline.
    if (this.shape?.op === 'roundRect' && !this.filled) {
      const { x, y, w, h } = this.shape;
      this.ops.push({ op: 'outline', x, y, w, h, stroke: String(this.strokeStyle) });
    }
    this.ops.push({ op: 'stroke', stroke: String(this.strokeStyle), width: this.lineWidth });
  }
  setTransform(a?: number | DOMMatrix2DInit): void {
    this.ops.push({ op: 'transform', scale: typeof a === 'number' ? a : (a?.a ?? 1) });
  }

  reset(): void {
    this.ops.length = 0;
  }

  /** Filled key-shaped rects (y = 0) and pills (y > 0), in draw order. */
  rects(): Extract<DrawOp, { op: 'roundRect' }>[] {
    return this.ops.filter((o): o is Extract<DrawOp, { op: 'roundRect' }> => o.op === 'roundRect');
  }

  /** Outlined (not filled) pills: the step after this one. */
  outlines(): Extract<DrawOp, { op: 'outline' }>[] {
    return this.ops.filter((o): o is Extract<DrawOp, { op: 'outline' }> => o.op === 'outline');
  }

  /** Correct and wrong marks. */
  circles(): Extract<DrawOp, { op: 'circle' }>[] {
    return this.ops.filter((o): o is Extract<DrawOp, { op: 'circle' }> => o.op === 'circle');
  }
}

export class FakeCanvas implements CanvasLike {
  clientWidth: number;
  width = 0;
  height = 0;
  style = { height: '' };
  readonly ctx = new RecordingContext();
  hasContext = true;

  constructor(clientWidth = 520) {
    this.clientWidth = clientWidth;
  }

  getContext(): RecordingContext | null {
    return this.hasContext ? this.ctx : null;
  }
}

/** Frames that only run when the test calls `step()`. */
export class ManualFrames implements FrameScheduler {
  private nextId = 1;
  private readonly pending = new Map<number, () => void>();

  request(callback: () => void): number {
    const id = this.nextId++;
    this.pending.set(id, callback);
    return id;
  }

  cancel(id: number): void {
    this.pending.delete(id);
  }

  get waiting(): number {
    return this.pending.size;
  }

  /** Run every frame callback that was waiting. */
  step(count = 1): void {
    for (let i = 0; i < count; i++) {
      const due = [...this.pending.values()];
      this.pending.clear();
      for (const callback of due) callback();
    }
  }
}

export const TEST_COLORS: PianoColors = {
  frame: 'frame',
  white: 'white',
  whiteHint: 'white-hint',
  whiteActive: 'white-active',
  black: 'black',
  blackActive: 'black-active',
  label: 'label',
  pillRight: 'right',
  pillLeft: 'left',
  pillEdge: 'edge',
  correct: 'correct',
  wrong: 'wrong',
  labelFont: '500 11px mono',
  radius: 4,
};
