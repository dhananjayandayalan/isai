import { describe, expect, it } from 'vitest';
import twinkle from '../../../schema/examples/twinkle-g-major.json';
import { buildNoteIndex, type Hand } from '../engine/activeNotes';
import { barsOfSong } from '../engine/practice/bars';
import { KEY_EXPECT_RIGHT, type PracticeView } from '../engine/practice/view';
import { FakeMidiInput } from '../midi/FakeMidiInput';
import { buildLane } from '../notation/chordLane';
import { labelNotes } from '../notation/FallingNotes';
import type { StageColors } from '../notation/stage';
import { buildStaffNotes } from '../notation/StaffRenderer';
import { parseSong } from '../song';
import { NoteNamer, type LaneChord } from '../theory/labels';
import { drawKeyboard } from './KeyboardRenderer';
import { keyNames } from './keyNames';
import { KEYBOARD_RANGES, KEYBOARD_SIZES, layoutKeys } from './layout';
import { PianoController, stageHeight, type StageSetup } from './PianoController';
import { FakeCanvas, ManualFrames, RecordingContext, TEST_COLORS, type DrawOp } from './testing';

const song = parseSong(twinkle);
const index = buildNoteIndex(song.notes);
const G = { key: 'G', mode: 'major' as const, scale: song.tonality.scale };

const STAGE_COLORS: StageColors = {
  background: 'bg',
  right: 'R',
  rightBorder: 'Rb',
  onRight: 'onR',
  left: 'L',
  leftBorder: 'Lb',
  onLeft: 'onL',
  grid: 'grid',
  gridStrong: 'gridStrong',
  ink: 'ink',
  inkMuted: 'muted',
  noteFont: '500 11px mono',
  laneFont: '600 13px mono',
  noteSize: 11,
  laneSize: 13,
};

function stageSetup(overrides: Partial<StageSetup> = {}): StageSetup {
  return {
    mode: 'falling',
    colors: STAGE_COLORS,
    lookahead: 4,
    labels: null,
    staffNotes: buildStaffNotes(index, G),
    keySignature: 1,
    beats: song.tempo.beats,
    barStarts: barsOfSong(song).bars.map((b) => b.start),
    lane: buildLane(song.chords as (LaneChord & { start: number; end: number })[], new NoteNamer(G)),
    showOtherHand: true,
    reducedMotion: false,
    ...overrides,
  };
}

function practiceView(dimHand: Hand | null = null) {
  const view = {
    revision: 0,
    keys: new Uint8Array(128),
    flashKind: new Uint8Array(128),
    flashUntil: new Float64Array(128),
    dimHand,
    now: () => 0,
  };
  return view satisfies PracticeView;
}

function setup(width = 880) {
  const canvas = new FakeCanvas(width);
  const stageCanvas = new FakeCanvas(width);
  const frames = new ManualFrames();
  const source = { seconds: 0 };
  const controller = new PianoController({ canvas, stageCanvas, colors: TEST_COLORS, range: KEYBOARD_RANGES[88], frames });
  controller.setSong(index, source);
  return { canvas, stageCanvas, frames, controller, source };
}

const texts = (ctx: RecordingContext) =>
  ctx.ops.filter((o): o is Extract<DrawOp, { op: 'text' }> => o.op === 'text').map((t) => t.text);

describe('key names', () => {
  it('names every key in the notation, keeping octave numbers on the C keys for letters', () => {
    const letters = keyNames(new NoteNamer(G));
    expect(letters[60]?.text).toBe('C4');
    expect(letters[66]?.text).toBe('F#');
    expect(keyNames(new NoteNamer(G, { notation: 'roman' }))[48]?.text).toBe('C3');
    expect(keyNames(new NoteNamer(G, { octaves: true }))[61]?.text).toBe('C#4');
    expect(keyNames(new NoteNamer(G, { octaves: true }))[60]?.text).toBe('C4');
    const swaras = keyNames(new NoteNamer(G, { notation: 'swaras' }));
    expect(swaras[67]).toEqual({ text: 'S', dotsAbove: 0, dotsBelow: 0 });
    expect(swaras[60]?.text).toBe('M');
    expect(keyNames(new NoteNamer(G, { notation: 'solfege' }))[67]?.text).toBe('Do');
  });

  it('draws names on the C keys and on the keys to play now, white and black', () => {
    const layout = layoutKeys({ low: 60, high: 72 }, 800);
    const ctx = new RecordingContext();
    const keys = new Uint8Array(128);
    keys[67] = KEY_EXPECT_RIGHT;
    keys[66] = KEY_EXPECT_RIGHT;
    drawKeyboard(ctx, {
      layout,
      height: 200,
      colors: TEST_COLORS,
      held: new Uint8Array(128),
      song: [],
      labels: true,
      names: keyNames(new NoteNamer(G, { notation: 'solfege' })),
      practice: { keys, flashKind: new Uint8Array(128), flashUntil: new Float64Array(128), now: 0, dimHand: null },
    });
    expect(texts(ctx)).toEqual(['Fa', 'Do', 'Fa', 'Ti']); // C4, G4 (to play), C5; then F#4 on its black key
    const black = ctx.ops.find((o) => o.op === 'text' && o.text === 'Ti');
    expect(black).toMatchObject({ fill: 'right' });
  });

  it('draws swara octave dots on the keys, and leaves out a name that does not fit', () => {
    const ctx = new RecordingContext();
    drawKeyboard(ctx, {
      layout: layoutKeys({ low: 48, high: 84 }, 1000),
      height: 200,
      colors: TEST_COLORS,
      held: new Uint8Array(128),
      song: [],
      labels: true,
      names: keyNames(new NoteNamer(G, { notation: 'swaras' })),
    });
    // Madhya Sa is G4: C3 is anumandra M (two dots below), C4 mandra (one), C5 madhya (none),
    // C6 tara (one dot above).
    const dots = ctx.circles().filter((c) => c.r === 1.5);
    expect(dots).toHaveLength(4);
    const narrow = new RecordingContext();
    drawKeyboard(narrow, {
      layout: layoutKeys(KEYBOARD_RANGES[88], 300),
      height: 120,
      colors: TEST_COLORS,
      held: new Uint8Array(128),
      song: [],
      labels: true,
      names: keyNames(new NoteNamer(G, { notation: 'solfege' })),
    });
    expect(texts(narrow)).toEqual([]);
  });
});

describe('PianoController with the pedal', () => {
  it('keeps keys let go under the sustain pedal lit until the pedal comes up', async () => {
    const { canvas, frames, controller } = setup();
    const midi = new FakeMidiInput();
    await midi.connect('fake-keyboard');
    controller.attachMidi(midi);
    controller.start();
    midi.emitNoteOn(60, { velocity: 90 });
    midi.emitPedal(127);
    midi.emitNoteOff(60);
    expect(controller.heldKeys[60]).toBe(0);
    expect(controller.sustainedKeys[60]).toBe(1);
    frames.step();
    expect(canvas.ctx.rects().some((r) => r.fill === 'white-active')).toBe(true);
    // Struck again: held, no longer only sustained.
    midi.emitNoteOn(60);
    expect(controller.sustainedKeys[60]).toBe(0);
    midi.emitNoteOff(60);
    midi.emitPedal(0);
    expect(controller.sustainedKeys[60]).toBe(0);
    canvas.ctx.reset();
    frames.step();
    expect(canvas.ctx.rects().some((r) => r.fill === 'white-active')).toBe(false);
    // A key let go without the pedal is not sustained; detaching clears everything.
    midi.emitNoteOn(62);
    midi.emitNoteOff(62);
    expect(controller.sustainedKeys[62]).toBe(0);
    midi.emitPedal(127);
    midi.emitNoteOn(64);
    midi.emitNoteOff(64);
    controller.attachMidi(null);
    expect(controller.sustainedKeys[64]).toBe(0);
  });
});

describe('PianoController stage', () => {
  it.each(KEYBOARD_SIZES)('draws falling notes over the keys of a %i-key keyboard, in the same frame', (size) => {
    const { canvas, stageCanvas, frames, controller } = setup();
    controller.setRange(KEYBOARD_RANGES[size]);
    controller.setStage(stageSetup());
    controller.start();
    frames.step();
    expect(stageCanvas.style.height).toBe(`${stageHeight(880)}px`);
    const layout = layoutKeys(KEYBOARD_RANGES[size], 880);
    const bars = stageCanvas.ctx.rects();
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      const key = [...layout.whites, ...layout.blacks].find((k) => bar.x >= k.x && bar.x + bar.w <= k.x + k.width + 0.01);
      expect(key).toBeDefined();
    }
    expect(canvas.ctx.ops.length).toBeGreaterThan(0);
  });

  it('draws the staff when the notation is Staff, and nothing without a stage', () => {
    const { stageCanvas, frames, controller } = setup();
    controller.setStage(stageSetup({ mode: 'staff' }));
    controller.start();
    frames.step();
    expect(texts(stageCanvas.ctx)).toContain('𝄞');
    expect(stageCanvas.ctx.circles().length).toBeGreaterThan(0);
    controller.setStage(null);
    stageCanvas.ctx.reset();
    frames.step();
    expect(stageCanvas.ctx.ops).toEqual([]);
  });

  it('moves once per beat with reduced motion', () => {
    const { stageCanvas, frames, controller, source } = setup();
    controller.setStage(stageSetup({ reducedMotion: true, lane: [] }));
    controller.start();
    const barYs = () =>
      stageCanvas.ctx.ops.filter((o): o is Extract<DrawOp, { op: 'fillRect' }> => o.op === 'fillRect' && o.h === 1).map((o) => o.y);
    source.seconds = 0.1;
    frames.step();
    const first = barYs();
    stageCanvas.ctx.reset();
    source.seconds = 0.5; // still in the first beat (0–0.6 s): the same picture
    frames.step();
    expect(barYs()).toEqual(first);
    stageCanvas.ctx.reset();
    source.seconds = 0.7;
    frames.step();
    expect(barYs()).not.toEqual(first);
  });

  it('shows the hand not practised faint, or hides it on the stage and the keys', () => {
    const { canvas, stageCanvas, frames, controller, source } = setup();
    controller.setPractice(practiceView('left'));
    controller.setStage(stageSetup({ showOtherHand: false }));
    source.seconds = 0.1; // the opening G2 and G4 are sounding
    controller.start();
    frames.step();
    expect(stageCanvas.ctx.rects().some((r) => r.fill === 'L')).toBe(false);
    expect(canvas.ctx.rects().some((r) => r.fill === 'left')).toBe(false);
    controller.setStage(stageSetup({ showOtherHand: true }));
    stageCanvas.ctx.reset();
    canvas.ctx.reset();
    frames.step();
    expect(stageCanvas.ctx.rects().filter((r) => r.fill === 'L').every((r) => r.alpha === 0.3)).toBe(true);
    expect(canvas.ctx.rects().some((r) => r.fill === 'left')).toBe(true);
  });

  it('names the falling notes and the keys from what it was given', () => {
    const { canvas, stageCanvas, frames, controller } = setup(2000);
    const namer = new NoteNamer(G, { notation: 'swaras' });
    controller.setRange(KEYBOARD_RANGES[49]);
    controller.setNames(keyNames(namer));
    controller.setStage(stageSetup({ labels: labelNotes(index, namer) }));
    controller.start();
    frames.step();
    expect(texts(stageCanvas.ctx)).toContain('S');
    expect(texts(canvas.ctx)).toContain('M'); // the C keys, in swaras
  });
});
