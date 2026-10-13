// Owns the keyboard's animation loop (rule 5). Each requestAnimationFrame it reads the
// song position from the player (the audio clock, rule 6), looks up the sounding notes and
// redraws the canvas. Your MIDI notes go into a typed array, never into React state.

import { activeNotesAt, type ActiveNote, type NoteIndex } from '../engine/activeNotes';
import type { MidiInput, Unsubscribe } from '../midi/MidiInput';
import { drawKeyboard, type Ctx2D, type PianoColors } from './KeyboardRenderer';
import { layoutKeys, type KeyLayout, type KeyRange } from './layout';

export interface FrameScheduler {
  request(callback: () => void): number;
  cancel(id: number): void;
}

export interface CanvasLike {
  readonly clientWidth: number;
  width: number;
  height: number;
  style: { height: string };
  getContext(type: '2d'): (Ctx2D & Pick<CanvasRenderingContext2D, 'setTransform'>) | null;
}

/** What the controller needs from a player: just the position. */
export interface PositionSource {
  readonly seconds: number;
}

export interface PianoControllerOptions {
  canvas: CanvasLike;
  colors: PianoColors;
  range: KeyRange;
  frames?: FrameScheduler;
  pixelRatio?: number;
  /** Called every frame with the song position, for readouts updated through refs. */
  onFrame?: (seconds: number) => void;
}

/** Keyboard height from key width, so the keys keep a piano's proportions. */
export function keyboardHeight(whiteWidth: number): number {
  return Math.round(Math.min(220, Math.max(96, whiteWidth * 5.2)));
}

export const browserFrames: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
};

export class PianoController {
  private readonly canvas: CanvasLike;
  private readonly frames: FrameScheduler;
  private readonly pixelRatio: number;
  private readonly onFrame: ((seconds: number) => void) | undefined;
  private colors: PianoColors;
  private range: KeyRange;
  private layout: KeyLayout | null = null;
  private height = 0;
  private ctx: ReturnType<CanvasLike['getContext']> = null;
  private index: NoteIndex | null = null;
  private source: PositionSource | null = null;
  private readonly held = new Uint8Array(128);
  private readonly active: ActiveNote[] = [];
  private midiUnsubscribe: Unsubscribe | null = null;
  private frameId: number | null = null;
  private dirty = true;
  private lastSeconds = Number.NaN;
  private labels = true;

  constructor(options: PianoControllerOptions) {
    this.canvas = options.canvas;
    this.colors = options.colors;
    this.range = options.range;
    this.frames = options.frames ?? browserFrames;
    this.pixelRatio = options.pixelRatio ?? 1;
    this.onFrame = options.onFrame;
  }

  /** The song to show and where to read its position; null shows only your notes. */
  setSong(index: NoteIndex | null, source: PositionSource | null): void {
    this.index = index;
    this.source = source;
    this.dirty = true;
  }

  setRange(range: KeyRange): void {
    this.range = range;
    this.layout = null;
    this.dirty = true;
  }

  setColors(colors: PianoColors): void {
    this.colors = colors;
    this.dirty = true;
  }

  setLabels(labels: boolean): void {
    this.labels = labels;
    this.dirty = true;
  }

  /** Show the keys you play on `midi` (or none). Replaces any previous input. */
  attachMidi(midi: MidiInput | null): void {
    this.midiUnsubscribe?.();
    this.midiUnsubscribe = null;
    this.held.fill(0);
    this.dirty = true;
    if (!midi) return;
    const offOn = midi.onNoteOn((e) => {
      this.held[e.note] = Math.max(1, e.velocity);
      this.dirty = true;
    });
    const offOff = midi.onNoteOff((e) => {
      this.held[e.note] = 0;
      this.dirty = true;
    });
    this.midiUnsubscribe = () => {
      offOn();
      offOff();
    };
  }

  /** Velocity of each key you're holding (read-only view, for tests and future modes). */
  get heldKeys(): Readonly<Uint8Array> {
    return this.held;
  }

  get running(): boolean {
    return this.frameId !== null;
  }

  start(): void {
    if (this.frameId !== null) return;
    const tick = () => {
      this.frameId = this.frames.request(tick);
      this.renderFrame();
    };
    this.frameId = this.frames.request(tick);
    this.dirty = true;
  }

  stop(): void {
    if (this.frameId === null) return;
    this.frames.cancel(this.frameId);
    this.frameId = null;
  }

  dispose(): void {
    this.stop();
    this.attachMidi(null);
    this.setSong(null, null);
  }

  /** Draw one frame if anything changed. Returns whether it drew. */
  renderFrame(): boolean {
    const seconds = this.source?.seconds ?? 0;
    this.onFrame?.(seconds);

    const width = this.canvas.clientWidth;
    if (width <= 0) return false;
    if (!this.layout || this.layout.width !== width) this.relayout(width);
    if (!this.dirty && seconds === this.lastSeconds) return false;

    this.ctx ??= this.canvas.getContext('2d');
    const ctx = this.ctx;
    const layout = this.layout;
    if (!ctx || !layout) return false;

    const song = this.index ? activeNotesAt(this.index, seconds, this.active) : [];
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    drawKeyboard(ctx, {
      layout,
      height: this.height,
      colors: this.colors,
      held: this.held,
      song,
      labels: this.labels,
    });
    this.dirty = false;
    this.lastSeconds = seconds;
    return true;
  }

  private relayout(width: number): void {
    const layout = layoutKeys(this.range, width);
    this.layout = layout;
    this.height = keyboardHeight(layout.whiteWidth);
    this.canvas.style.height = `${this.height}px`;
    this.canvas.width = Math.round(width * this.pixelRatio);
    this.canvas.height = Math.round(this.height * this.pixelRatio);
    this.dirty = true;
  }
}
