// Owns the keyboard's animation loop (rule 5). Each requestAnimationFrame it reads the
// song position from the practice engine (the audio clock, rule 6), looks up the sounding
// notes and redraws the canvas, and the stage above it (falling notes or the staff) in the
// same frame and from the same layout. Your MIDI notes and the sustain pedal go into typed
// arrays, never into React state.

import { activeNotesAt, type ActiveNote, type NoteIndex } from '../engine/activeNotes';
import type { PracticeView } from '../engine/practice/view';
import type { MidiInput, Unsubscribe } from '../midi/MidiInput';
import type { LaneEntry } from '../notation/chordLane';
import { drawFallingNotes, steppedPosition } from '../notation/FallingNotes';
import type { StageColors } from '../notation/stage';
import { drawStaff, type StaffNote } from '../notation/StaffRenderer';
import type { NoteLabel } from '../theory/labels';
import { countFlashes, drawKeyboard, type Ctx2D, type PianoColors } from './KeyboardRenderer';
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

/** What the controller needs from the practice engine to draw the song: just the position. */
export interface PositionSource {
  readonly seconds: number;
}

/** What the stage above the keys shows, set when the song or a setting changes (not per frame). */
export interface StageSetup {
  mode: 'falling' | 'staff';
  colors: StageColors;
  /** Song seconds of music shown ahead. */
  lookahead: number;
  /** Falling notes: a name per note of the index, or null. */
  labels: readonly NoteLabel[] | null;
  /** Staff: the notes spelled for the staff, and the key signature. */
  staffNotes: readonly StaffNote[];
  keySignature: number;
  beats: readonly number[];
  barStarts: readonly number[];
  lane: readonly LaneEntry[];
  /** Show the hand not being practised faint (true) or not at all. */
  showOtherHand: boolean;
  /** Move once per beat instead of every frame (prefers-reduced-motion). */
  reducedMotion: boolean;
}

/** Stage height from the keyboard width: room for a few seconds of falling notes or two staves. */
export function stageHeight(width: number): number {
  return Math.round(Math.min(360, Math.max(180, width * 0.3)));
}

export interface PianoControllerOptions {
  canvas: CanvasLike;
  /** The stage canvas above the keys; none for a keyboard alone. */
  stageCanvas?: CanvasLike;
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
  private practice: PracticeView | null = null;
  private lastRevision = -1;
  private lastFlashes = 0;
  private readonly held = new Uint8Array(128);
  /** Keys let go while the pedal is down. */
  private readonly sustained = new Uint8Array(128);
  private pedalDown = false;
  private names: readonly NoteLabel[] | null = null;
  private readonly stageCanvas: CanvasLike | null;
  private stageCtx: ReturnType<CanvasLike['getContext']> = null;
  private stage: StageSetup | null = null;
  private stageHeightPx = 0;
  private readonly active: ActiveNote[] = [];
  private midiUnsubscribe: Unsubscribe | null = null;
  private frameId: number | null = null;
  private dirty = true;
  private lastSeconds = Number.NaN;
  private labels = true;

  constructor(options: PianoControllerOptions) {
    this.canvas = options.canvas;
    this.stageCanvas = options.stageCanvas ?? null;
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

  /**
   * What practice adds: the keys to play now and next, and the correct / wrong marks. The
   * controller reads the view's typed arrays every frame; nothing goes through React.
   */
  setPractice(practice: PracticeView | null): void {
    this.practice = practice;
    this.lastRevision = -1;
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

  /** Names for every key in the chosen notation (index = MIDI), or null for C4-style C keys. */
  setNames(names: readonly NoteLabel[] | null): void {
    this.names = names;
    this.dirty = true;
  }

  /** What the stage shows; null leaves it blank. */
  setStage(stage: StageSetup | null): void {
    this.stage = stage;
    this.dirty = true;
  }

  /** Show the keys you play on `midi` (or none). Replaces any previous input. */
  attachMidi(midi: MidiInput | null): void {
    this.midiUnsubscribe?.();
    this.midiUnsubscribe = null;
    this.held.fill(0);
    this.sustained.fill(0);
    this.pedalDown = false;
    this.dirty = true;
    if (!midi) return;
    const offOn = midi.onNoteOn((e) => {
      this.held[e.note] = Math.max(1, e.velocity);
      this.sustained[e.note] = 0;
      this.dirty = true;
    });
    const offOff = midi.onNoteOff((e) => {
      if (this.pedalDown && this.held[e.note]) this.sustained[e.note] = 1;
      this.held[e.note] = 0;
      this.dirty = true;
    });
    const offPedal = midi.onPedal((e) => {
      this.pedalDown = e.down;
      if (!e.down) this.sustained.fill(0);
      this.dirty = true;
    });
    this.midiUnsubscribe = () => {
      offOn();
      offOff();
      offPedal();
    };
  }

  /** Keys the sustain pedal is holding after they were let go (read-only view, for tests). */
  get sustainedKeys(): Readonly<Uint8Array> {
    return this.sustained;
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
    this.setPractice(null);
  }

  /** Draw one frame if anything changed. Returns whether it drew. */
  renderFrame(): boolean {
    const seconds = this.source?.seconds ?? 0;
    this.onFrame?.(seconds);

    const width = this.canvas.clientWidth;
    if (width <= 0) return false;
    if (!this.layout || this.layout.width !== width) this.relayout(width);

    // Practice changes with the learner's notes, not with the song position: redraw when
    // the engine says its arrays changed, or when a correct / wrong mark appears or fades.
    const practice = this.practice;
    const now = practice ? practice.now() : 0;
    if (practice) {
      const flashes = countFlashes(practice, now);
      if (practice.revision !== this.lastRevision || flashes !== this.lastFlashes) this.dirty = true;
      this.lastRevision = practice.revision;
      this.lastFlashes = flashes;
    }
    if (!this.dirty && seconds === this.lastSeconds) return false;

    this.ctx ??= this.canvas.getContext('2d');
    const ctx = this.ctx;
    const layout = this.layout;
    if (!ctx || !layout) return false;

    // The stage first, so its context is ready before the keys' (the keys are drawn last).
    this.renderStage(seconds, layout);

    const song = this.index ? activeNotesAt(this.index, seconds, this.active) : [];
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    drawKeyboard(ctx, {
      layout,
      height: this.height,
      colors: this.colors,
      held: this.held,
      song,
      labels: this.labels,
      names: this.names,
      sustained: this.sustained,
      practice: practice
        ? {
            keys: practice.keys,
            flashKind: practice.flashKind,
            flashUntil: practice.flashUntil,
            now,
            dimHand: practice.dimHand,
            hideDimHand: this.stage ? !this.stage.showOtherHand : false,
          }
        : null,
    });
    this.dirty = false;
    this.lastSeconds = seconds;
    return true;
  }

  private renderStage(seconds: number, layout: KeyLayout): void {
    const stage = this.stage;
    const canvas = this.stageCanvas;
    if (!stage || !canvas) return;
    this.stageCtx ??= canvas.getContext('2d');
    const ctx = this.stageCtx;
    if (!ctx) return;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    const position = stage.reducedMotion ? steppedPosition(seconds, stage.beats) : seconds;
    const dim = this.practice?.dimHand ?? null;
    const otherHand = dim ? { hand: dim, show: stage.showOtherHand } : null;
    const common = {
      colors: stage.colors,
      seconds: position,
      lookahead: stage.lookahead,
      barStarts: stage.barStarts,
      lane: stage.lane,
      otherHand,
    };
    if (stage.mode === 'staff') {
      drawStaff(ctx, {
        ...common,
        width: layout.width,
        height: this.stageHeightPx,
        notes: stage.staffNotes,
        keySignature: stage.keySignature,
      });
      return;
    }
    if (!this.index) return;
    drawFallingNotes(ctx, {
      ...common,
      layout,
      height: this.stageHeightPx,
      index: this.index,
      labels: stage.labels,
      beats: stage.beats,
    });
  }

  private relayout(width: number): void {
    const layout = layoutKeys(this.range, width);
    this.layout = layout;
    this.height = keyboardHeight(layout.whiteWidth);
    this.canvas.style.height = `${this.height}px`;
    this.canvas.width = Math.round(width * this.pixelRatio);
    this.canvas.height = Math.round(this.height * this.pixelRatio);
    if (this.stageCanvas) {
      this.stageHeightPx = stageHeight(width);
      this.stageCanvas.style.height = `${this.stageHeightPx}px`;
      this.stageCanvas.width = Math.round(width * this.pixelRatio);
      this.stageCanvas.height = Math.round(this.stageHeightPx * this.pixelRatio);
    }
    this.dirty = true;
  }
}
