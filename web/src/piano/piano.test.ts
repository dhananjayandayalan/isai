import { describe, expect, it } from 'vitest';
import { FakeMidiInput } from '../midi/FakeMidiInput';
import { buildNoteIndex, type Hand } from '../engine/activeNotes';
import {
  FLASH_CORRECT,
  FLASH_WRONG,
  KEY_EXPECT_LEFT,
  KEY_EXPECT_RIGHT,
  KEY_NEXT_LEFT,
  KEY_NEXT_RIGHT,
  type PracticeView,
} from '../engine/practice/view';
import type { Note } from '../song';
import {
  countFlashes,
  DIM_ALPHA,
  drawKeyboard,
  readPianoColors,
  type PracticeOverlay,
} from './KeyboardRenderer';
import {
  BLACK_WIDTH_RATIO,
  countOutOfRange,
  KEYBOARD_RANGES,
  KEYBOARD_SIZES,
  layoutKeys,
  whiteKeyCount,
  type KeyRange,
} from './layout';
import { keyboardHeight, PianoController } from './PianoController';
import { FakeCanvas, ManualFrames, RecordingContext, TEST_COLORS } from './testing';

const range88 = KEYBOARD_RANGES[88];
const octave: KeyRange = { low: 60, high: 71 + 1 }; // C4..C5

function note(start: number, end: number, midi: number, hand: Note['hand'] = 'right'): Note {
  return { start, end, midi, velocity: 80, hand, source: 'arranged' };
}

describe('layoutKeys', () => {
  it.each(KEYBOARD_SIZES)('has %i keys', (size) => {
    const range = KEYBOARD_RANGES[size];
    const layout = layoutKeys(range, 1000);
    expect(layout.whites.length + layout.blacks.length).toBe(size);
    expect(range.high - range.low + 1).toBe(size);
  });

  it.each([
    [49, 29, 20],
    [61, 36, 25],
    [76, 45, 31],
    [88, 52, 36],
  ] as const)('a %i-key keyboard has %i white and %i black keys', (size, whites, blacks) => {
    const layout = layoutKeys(KEYBOARD_RANGES[size], 1000);
    expect(layout.whites).toHaveLength(whites);
    expect(layout.blacks).toHaveLength(blacks);
    expect(whiteKeyCount(KEYBOARD_RANGES[size])).toBe(whites);
  });

  it('starts and ends the 88-key board on A0 and C8', () => {
    const layout = layoutKeys(range88, 520);
    expect(layout.whites[0]?.midi).toBe(21);
    expect(layout.whites.at(-1)?.midi).toBe(108);
    expect(layout.whiteWidth).toBe(10);
  });

  it('places white keys edge to edge and black keys on the line between', () => {
    const layout = layoutKeys(octave, 800); // C4..C5: 8 white keys, 100 px each
    expect(layout.whites.map((k) => k.x)).toEqual([0, 100, 200, 300, 400, 500, 600, 700]);
    const cSharp = layout.byMidi[61];
    expect(cSharp?.black).toBe(true);
    expect(cSharp?.width).toBeCloseTo(100 * BLACK_WIDTH_RATIO);
    expect((cSharp?.x ?? 0) + (cSharp?.width ?? 0) / 2).toBeCloseTo(100); // centred on C|D
    const fSharp = layout.byMidi[66];
    expect((fSharp?.x ?? 0) + (fSharp?.width ?? 0) / 2).toBeCloseTo(400); // centred on F|G
    expect(layout.byMidi[59]).toBeUndefined();
    expect(layout.byMidi[73]).toBeUndefined();
  });

  it('rejects ranges that start or end on a black key, or are reversed', () => {
    expect(() => layoutKeys({ low: 61, high: 72 }, 100)).toThrow(RangeError);
    expect(() => layoutKeys({ low: 60, high: 70 }, 100)).toThrow(RangeError);
    expect(() => layoutKeys({ low: 72, high: 60 }, 100)).toThrow(RangeError);
  });
});

describe('countOutOfRange', () => {
  it('counts notes below and above the keyboard', () => {
    const notes = [{ midi: 20 }, { midi: 35 }, { midi: 60 }, { midi: 85 }, { midi: 110 }];
    expect(countOutOfRange(notes, KEYBOARD_RANGES[49])).toEqual({ below: 2, above: 2 });
    expect(countOutOfRange(notes, range88)).toEqual({ below: 1, above: 1 });
    expect(countOutOfRange([], range88)).toEqual({ below: 0, above: 0 });
  });
});

describe('drawKeyboard', () => {
  const layout = layoutKeys(octave, 800);

  function draw(held: number[] = [], song: { midi: number; hand: Note['hand'] }[] = [], labels = true) {
    const ctx = new RecordingContext();
    const keys = new Uint8Array(128);
    for (const m of held) keys[m] = 100;
    drawKeyboard(ctx, { layout, height: 200, colors: TEST_COLORS, held: keys, song, labels });
    return ctx;
  }

  it('draws the frame, every key, and C labels', () => {
    const ctx = draw();
    expect(ctx.ops[0]).toEqual({ op: 'clear' });
    expect(ctx.ops[1]).toMatchObject({ op: 'fillRect', fill: 'frame' });
    const keys = ctx.rects().filter((r) => r.y === 0);
    expect(keys.filter((k) => k.fill === 'white')).toHaveLength(8);
    expect(keys.filter((k) => k.fill === 'black')).toHaveLength(5);
    const labels = ctx.ops.filter((o) => o.op === 'text');
    expect(labels.map((l) => (l.op === 'text' ? l.text : ''))).toEqual(['C4', 'C5']);
    expect(labels[0]).toMatchObject({ fill: 'label', font: '500 11px mono' });
  });

  it('can leave out the labels', () => {
    expect(draw([], [], false).ops.some((o) => o.op === 'text')).toBe(false);
  });

  it('lights the keys you hold', () => {
    const keys = draw([60, 61]).rects().filter((r) => r.y === 0);
    expect(keys.filter((k) => k.fill === 'white-active')).toHaveLength(1);
    expect(keys.filter((k) => k.fill === 'black-active')).toHaveLength(1);
  });

  it('marks song notes with a pill in the hand colour, on white and black keys', () => {
    const pills = draw([], [
      { midi: 64, hand: 'right' },
      { midi: 63, hand: 'left' },
    ])
      .rects()
      .filter((r) => r.y > 0);
    expect(pills.map((p) => p.fill).sort()).toEqual(['left', 'right']);
    const e4 = layout.byMidi[64];
    const right = pills.find((p) => p.fill === 'right');
    expect(right?.x).toBeGreaterThan(e4?.x ?? 0);
    expect((right?.x ?? 0) + (right?.w ?? 0)).toBeLessThan((e4?.x ?? 0) + (e4?.width ?? 0));
  });

  it('outlines every pill with the pill edge, so a light pill shows on a white key', () => {
    const ops = draw([], [{ midi: 72, hand: 'right' }]).ops;
    const pill = ops.findIndex((o) => o.op === 'roundRect' && o.y > 0);
    expect(ops[pill]).toMatchObject({ fill: 'right' });
    expect(ops[pill + 1]).toEqual({ op: 'stroke', stroke: 'edge', width: 2 });
  });

  it('shows both your note and the song note on the same key', () => {
    const rects = draw([64], [{ midi: 64, hand: 'right' }]).rects();
    expect(rects.some((r) => r.y === 0 && r.fill === 'white-active')).toBe(true);
    expect(rects.some((r) => r.y > 0 && r.fill === 'right')).toBe(true);
  });

  it('points a marker out of each end for song notes off the keyboard', () => {
    const ctx = draw([], [
      { midi: 30, hand: 'left' },
      { midi: 100, hand: 'right' },
    ]);
    const markers = ctx.ops.filter((o) => o.op === 'path');
    expect(markers).toHaveLength(2);
    const [low, high] = markers;
    expect(low).toMatchObject({ fill: 'left' });
    expect(high).toMatchObject({ fill: 'right' });
    // The tip (middle point) sits on the edge.
    expect(low?.op === 'path' && low.points[1]?.[0]).toBe(0);
    expect(high?.op === 'path' && high.points[1]?.[0]).toBe(800);
    expect(ctx.rects().filter((r) => r.y > 0)).toHaveLength(0);
  });
});

describe('drawKeyboard in practice', () => {
  const layout = layoutKeys(octave, 800);

  function overlay(patch: Partial<PracticeOverlay> = {}): PracticeOverlay {
    return {
      keys: new Uint8Array(128),
      flashKind: new Uint8Array(128),
      flashUntil: new Float64Array(128),
      now: 10,
      dimHand: null,
      ...patch,
    };
  }

  function draw(practice: PracticeOverlay, song: { midi: number; hand: Hand }[] = [], held: number[] = []) {
    const ctx = new RecordingContext();
    const keys = new Uint8Array(128);
    for (const m of held) keys[m] = 100;
    drawKeyboard(ctx, { layout, height: 200, colors: TEST_COLORS, held: keys, song, labels: false, practice });
    return ctx;
  }

  const keyFill = (ctx: RecordingContext, midi: number) => {
    const key = layout.byMidi[midi];
    const inset = key?.black ? 0 : Math.max(1, layout.whiteWidth * 0.04) / 2;
    return ctx.rects().find((r) => r.y === 0 && r.x === (key?.x ?? -1) + inset)?.fill;
  };
  const pills = (ctx: RecordingContext) => ctx.rects().filter((r) => r.y > 0);
  const within = (x: number, midi: number) => {
    const key = layout.byMidi[midi];
    return key !== undefined && x >= key.x && x <= key.x + key.width;
  };

  it('lights the keys to press now and gives each a pill in its hand colour', () => {
    const practice = overlay();
    practice.keys[64] = KEY_EXPECT_RIGHT;
    practice.keys[61] = KEY_EXPECT_LEFT;
    const ctx = draw(practice);
    expect(keyFill(ctx, 64)).toBe('white-active');
    expect(keyFill(ctx, 61)).toBe('black-active');
    expect(keyFill(ctx, 60)).toBe('white');
    const marks = pills(ctx);
    expect(marks.map((p) => p.fill).sort()).toEqual(['left', 'right']);
    expect(within(marks.find((p) => p.fill === 'right')?.x ?? -1, 64)).toBe(true);
    expect(within(marks.find((p) => p.fill === 'left')?.x ?? -1, 61)).toBe(true);
    expect(ctx.outlines()).toHaveLength(0);
  });

  it('outlines the step after this one without lighting the key', () => {
    const practice = overlay();
    practice.keys[67] = KEY_NEXT_RIGHT;
    practice.keys[66] = KEY_NEXT_LEFT;
    const ctx = draw(practice);
    expect(keyFill(ctx, 67)).toBe('white');
    expect(keyFill(ctx, 66)).toBe('black');
    expect(pills(ctx)).toHaveLength(0);
    const outlines = ctx.outlines();
    expect(outlines).toHaveLength(2);
    // The stroke contrasts with the key, whichever hand it is for.
    const centredOn = (midi: number) => {
      const key = layout.byMidi[midi];
      const centre = (key?.x ?? 0) + (key?.width ?? 0) / 2;
      return outlines.find((o) => Math.abs(o.x + o.w / 2 - centre) < 1e-6);
    };
    expect(centredOn(67)?.stroke).toBe('left');
    expect(centredOn(66)?.stroke).toBe('right');
  });

  it('shows a key that is both now and next as now', () => {
    const practice = overlay();
    practice.keys[64] = KEY_EXPECT_RIGHT | KEY_NEXT_RIGHT;
    const ctx = draw(practice);
    expect(pills(ctx).map((p) => p.fill)).toEqual(['right']);
    expect(ctx.outlines()).toHaveLength(0);
  });

  it('draws the hand you are not practising faintly', () => {
    const ctx = draw(overlay({ dimHand: 'left' }), [
      { midi: 60, hand: 'left' },
      { midi: 63, hand: 'left' },
      { midi: 67, hand: 'right' },
    ]);
    expect(keyFill(ctx, 60)).toBe('white-hint');
    expect(keyFill(ctx, 63)).toBe('black');
    expect(keyFill(ctx, 67)).toBe('white');
    const marks = pills(ctx);
    expect(marks.filter((p) => p.fill === 'left').map((p) => p.alpha)).toEqual([DIM_ALPHA, DIM_ALPHA]);
    expect(marks.find((p) => p.fill === 'right')?.alpha).toBeUndefined();
    // Alpha is put back, so nothing drawn afterwards is faint.
    expect(ctx.globalAlpha).toBe(1);
  });

  it('prefers the practised hand when both hands sound the same key', () => {
    for (const song of [
      [
        { midi: 64, hand: 'left' as const },
        { midi: 64, hand: 'right' as const },
      ],
      [
        { midi: 64, hand: 'right' as const },
        { midi: 64, hand: 'left' as const },
      ],
    ]) {
      const ctx = draw(overlay({ dimHand: 'left' }), song);
      expect(keyFill(ctx, 64)).toBe('white');
      expect(pills(ctx)).toEqual([expect.objectContaining({ fill: 'right' })]);
      expect(pills(ctx)[0]?.alpha).toBeUndefined();
    }
  });

  it('puts the key to press now above a sounding note, and a sounding note above the next step', () => {
    const practice = overlay({ dimHand: 'left' });
    practice.keys[60] = KEY_EXPECT_RIGHT;
    practice.keys[62] = KEY_NEXT_RIGHT;
    const ctx = draw(practice, [
      { midi: 60, hand: 'left' },
      { midi: 62, hand: 'left' },
    ]);
    expect(keyFill(ctx, 60)).toBe('white-active');
    const marks = pills(ctx);
    expect(marks.find((p) => within(p.x, 60))).toMatchObject({ fill: 'right' });
    expect(marks.find((p) => within(p.x, 60))?.alpha).toBeUndefined();
    expect(marks.find((p) => within(p.x, 62))).toMatchObject({ fill: 'left', alpha: DIM_ALPHA });
    expect(ctx.outlines()).toHaveLength(0);
  });

  it('marks a key you played right with a disc, and a wrong one with a disc and a cross', () => {
    const practice = overlay();
    practice.flashKind[64] = FLASH_CORRECT;
    practice.flashUntil[64] = 10.2;
    practice.flashKind[61] = FLASH_WRONG;
    practice.flashUntil[61] = 10.2;
    const ctx = draw(practice);
    const circles = ctx.circles();
    expect(circles.map((c) => c.fill).sort()).toEqual(['correct', 'wrong']);
    const correct = circles.find((c) => c.fill === 'correct');
    const wrong = circles.find((c) => c.fill === 'wrong');
    expect(within(correct?.x ?? -1, 64)).toBe(true);
    expect(within(wrong?.x ?? -1, 61)).toBe(true);
    // The wrong mark sits on the black key, higher up than the white key's mark.
    expect(wrong?.y ?? 0).toBeLessThan(correct?.y ?? 0);
    // One cross, drawn after the wrong disc in the light pill colour.
    const afterWrong = ctx.ops.slice(ctx.ops.findIndex((o) => o.op === 'circle' && o.fill === 'wrong') + 1);
    expect(afterWrong.slice(0, 2)).toEqual([
      { op: 'stroke', stroke: 'edge', width: 2 },
      { op: 'stroke', stroke: 'right', width: 2 },
    ]);
    const afterCorrect = ctx.ops.slice(ctx.ops.findIndex((o) => o.op === 'circle' && o.fill === 'correct') + 1);
    expect(afterCorrect[0]).toEqual({ op: 'stroke', stroke: 'edge', width: 2 });
    expect(afterCorrect[1]?.op).not.toBe('stroke');
  });

  it('draws the marks on top of everything else', () => {
    const practice = overlay();
    practice.keys[64] = KEY_EXPECT_RIGHT;
    practice.flashKind[64] = FLASH_CORRECT;
    practice.flashUntil[64] = 11;
    const ops = draw(practice, [{ midi: 100, hand: 'right' }]).ops;
    const circle = ops.findIndex((o) => o.op === 'circle');
    expect(circle).toBeGreaterThan(ops.findLastIndex((o) => o.op === 'roundRect'));
    expect(circle).toBeGreaterThan(ops.findLastIndex((o) => o.op === 'path'));
  });

  it('drops a mark once its time is up, and ignores marks off this keyboard', () => {
    const practice = overlay({ now: 10.5 });
    practice.flashKind[64] = FLASH_CORRECT;
    practice.flashUntil[64] = 10.5; // over exactly now
    practice.flashKind[30] = FLASH_WRONG;
    practice.flashUntil[30] = 99;
    practice.flashKind[100] = FLASH_WRONG;
    practice.flashUntil[100] = 99;
    expect(draw(practice).circles()).toHaveLength(0);
  });

  it('draws as before when there is no practice', () => {
    const plain = new RecordingContext();
    const withNull = new RecordingContext();
    const frame = {
      layout,
      height: 200,
      colors: TEST_COLORS,
      held: new Uint8Array(128),
      song: [{ midi: 64, hand: 'left' as const }],
      labels: true,
    };
    drawKeyboard(plain, frame);
    drawKeyboard(withNull, { ...frame, practice: null });
    expect(withNull.ops).toEqual(plain.ops);
    expect(plain.rects().some((r) => r.fill === 'white-hint')).toBe(false);
  });
});

describe('countFlashes', () => {
  it('counts the marks still showing', () => {
    const flashKind = new Uint8Array(128);
    const flashUntil = new Float64Array(128);
    expect(countFlashes({ flashKind, flashUntil }, 0)).toBe(0);
    flashKind[60] = FLASH_CORRECT;
    flashUntil[60] = 1;
    flashKind[61] = FLASH_WRONG;
    flashUntil[61] = 2;
    flashUntil[62] = 5; // a time but no kind: not a mark
    expect(countFlashes({ flashKind, flashUntil }, 0.5)).toBe(2);
    expect(countFlashes({ flashKind, flashUntil }, 1)).toBe(1);
    expect(countFlashes({ flashKind, flashUntil }, 2)).toBe(0);
  });
});

describe('readPianoColors', () => {
  it('reads tokens from computed style', () => {
    const values: Record<string, string> = {
      '--piano-white': ' ivory ',
      '--piano-white-hint': 'mist',
      '--piano-correct': 'snow',
      '--piano-wrong': 'coal',
      '--piano-pill-left': 'grey',
      '--piano-pill-edge': 'ink',
      '--text-2xs': '11px',
      '--font-mono': "'JetBrains Mono', monospace",
      '--weight-medium': '500',
      '--radius-sm': '4px',
    };
    const colors = readPianoColors({ getPropertyValue: (name: string) => values[name] ?? '' });
    expect(colors.white).toBe('ivory');
    expect(colors.whiteHint).toBe('mist');
    expect(colors.correct).toBe('snow');
    expect(colors.wrong).toBe('coal');
    expect(colors.pillLeft).toBe('grey');
    expect(colors.pillEdge).toBe('ink');
    expect(colors.labelFont).toBe("500 11px 'JetBrains Mono', monospace");
    expect(colors.radius).toBe(4);
    expect(readPianoColors({ getPropertyValue: () => '' }).radius).toBe(0);
  });
});

describe('keyboardHeight', () => {
  it('keeps piano proportions within limits', () => {
    expect(keyboardHeight(10)).toBe(96);
    expect(keyboardHeight(30)).toBe(156);
    expect(keyboardHeight(100)).toBe(220);
  });
});

describe('PianoController', () => {
  function setup(width = 520) {
    const canvas = new FakeCanvas(width);
    const frames = new ManualFrames();
    const positions: number[] = [];
    const controller = new PianoController({
      canvas,
      colors: TEST_COLORS,
      range: range88,
      frames,
      pixelRatio: 2,
      onFrame: (s) => positions.push(s),
    });
    return { canvas, frames, controller, positions };
  }

  it('sizes the canvas for the pixel ratio and draws on the first frame', () => {
    const { canvas, frames, controller } = setup();
    controller.start();
    frames.step();
    expect(canvas.width).toBe(1040);
    expect(canvas.style.height).toBe('96px');
    expect(canvas.height).toBe(192);
    expect(canvas.ctx.ops).toContainEqual({ op: 'transform', scale: 2 });
  });

  it('runs one frame loop and skips frames when nothing changed', () => {
    const { canvas, frames, controller } = setup();
    controller.start();
    controller.start();
    expect(frames.waiting).toBe(1);
    frames.step();
    canvas.ctx.reset();
    frames.step(3);
    expect(canvas.ctx.ops).toEqual([]);
  });

  it('follows the song position and reports it every frame', () => {
    const { canvas, frames, controller, positions } = setup();
    const source = { seconds: 0 };
    controller.setSong(buildNoteIndex([note(1, 2, 60, 'left')]), source);
    controller.start();
    frames.step();
    expect(canvas.ctx.rects().filter((r) => r.y > 0)).toHaveLength(0);
    source.seconds = 1.5;
    canvas.ctx.reset();
    frames.step();
    expect(canvas.ctx.rects().filter((r) => r.y > 0).map((r) => r.fill)).toEqual(['left']);
    source.seconds = 2;
    canvas.ctx.reset();
    frames.step();
    expect(canvas.ctx.rects().filter((r) => r.y > 0)).toHaveLength(0);
    expect(positions).toEqual([0, 1.5, 2]);
  });

  it('lights your MIDI notes from the typed array and stops after detaching', async () => {
    const { canvas, frames, controller } = setup();
    const midi = new FakeMidiInput();
    await midi.connect('fake-keyboard');
    controller.attachMidi(midi);
    controller.start();
    midi.emitNoteOn(60, { velocity: 90 });
    frames.step();
    expect(controller.heldKeys[60]).toBe(90);
    expect(canvas.ctx.rects().some((r) => r.fill === 'white-active')).toBe(true);
    midi.emitNoteOff(60);
    expect(controller.heldKeys[60]).toBe(0);

    midi.emitNoteOn(62);
    controller.attachMidi(null); // clears held keys and unsubscribes
    expect(controller.heldKeys[62]).toBe(0);
    midi.emitNoteOn(64);
    expect(controller.heldKeys[64]).toBe(0);
  });

  it('relayouts when the range or width changes', () => {
    const { canvas, frames, controller } = setup(520);
    controller.start();
    frames.step();
    controller.setRange(KEYBOARD_RANGES[49]);
    canvas.ctx.reset();
    frames.step();
    expect(canvas.ctx.rects().filter((r) => r.y === 0)).toHaveLength(49);
    canvas.clientWidth = 1160; // 29 white keys at 40 px
    frames.step();
    expect(canvas.style.height).toBe('208px');
  });

  it('redraws after colour and label changes', () => {
    const { canvas, frames, controller } = setup();
    controller.start();
    frames.step();
    controller.setColors({ ...TEST_COLORS, white: 'cream' });
    controller.setLabels(false);
    canvas.ctx.reset();
    frames.step();
    expect(canvas.ctx.rects().some((r) => r.fill === 'cream')).toBe(true);
    expect(canvas.ctx.ops.some((o) => o.op === 'text')).toBe(false);
  });

  describe('with practice', () => {
    /** A hand-driven PracticeView: the test plays the engine's part. */
    function fakePractice() {
      const view = {
        revision: 0,
        keys: new Uint8Array(128),
        flashKind: new Uint8Array(128),
        flashUntil: new Float64Array(128),
        dimHand: null as Hand | null,
        time: 0,
        now() {
          return this.time;
        },
      };
      return view satisfies PracticeView;
    }

    it('redraws when the engine says its arrays changed, and only then', () => {
      const { canvas, frames, controller } = setup();
      const practice = fakePractice();
      controller.setPractice(practice);
      controller.start();
      frames.step();
      canvas.ctx.reset();
      frames.step(3);
      expect(canvas.ctx.ops).toEqual([]);

      practice.keys[60] = KEY_EXPECT_RIGHT;
      practice.keys[64] = KEY_NEXT_RIGHT;
      practice.revision++;
      frames.step();
      expect(canvas.ctx.rects().filter((r) => r.y > 0).map((r) => r.fill)).toEqual(['right']);
      expect(canvas.ctx.outlines()).toHaveLength(1);
      canvas.ctx.reset();
      frames.step(3);
      expect(canvas.ctx.ops).toEqual([]);
    });

    it('redraws when a mark appears and again when it fades, with the song standing still', () => {
      const { canvas, frames, controller } = setup();
      const practice = fakePractice();
      controller.setSong(buildNoteIndex([note(0, 4, 60)]), { seconds: 1 });
      controller.setPractice(practice);
      controller.start();
      frames.step();

      // The engine flashes a key without bumping the revision.
      practice.flashKind[62] = FLASH_WRONG;
      practice.flashUntil[62] = 0.35;
      practice.time = 0.1;
      canvas.ctx.reset();
      frames.step();
      expect(canvas.ctx.circles().map((c) => c.fill)).toEqual(['wrong']);
      canvas.ctx.reset();
      practice.time = 0.2;
      frames.step();
      expect(canvas.ctx.ops).toEqual([]);

      practice.time = 0.4;
      frames.step();
      expect(canvas.ctx.ops.length).toBeGreaterThan(0);
      expect(canvas.ctx.circles()).toHaveLength(0);
    });

    it('passes the dimmed hand through, and forgets practice when it is taken away', () => {
      const { canvas, frames, controller } = setup();
      const practice = fakePractice();
      practice.dimHand = 'left';
      practice.keys[64] = KEY_EXPECT_RIGHT;
      controller.setSong(buildNoteIndex([note(0, 4, 48, 'left')]), { seconds: 1 });
      controller.setPractice(practice);
      controller.start();
      frames.step();
      expect(canvas.ctx.rects().some((r) => r.fill === 'white-hint')).toBe(true);
      expect(canvas.ctx.rects().find((r) => r.fill === 'left')?.alpha).toBe(DIM_ALPHA);

      controller.setPractice(null);
      canvas.ctx.reset();
      frames.step();
      expect(canvas.ctx.rects().some((r) => r.fill === 'white-hint')).toBe(false);
      expect(canvas.ctx.rects().filter((r) => r.y > 0).map((r) => r.fill)).toEqual(['left']);
      expect(canvas.ctx.rects().find((r) => r.fill === 'left')?.alpha).toBeUndefined();

      // Changes to the old view no longer cause a redraw.
      practice.revision++;
      canvas.ctx.reset();
      frames.step();
      expect(canvas.ctx.ops).toEqual([]);
    });
  });

  it('does not draw with no width or no 2D context', () => {
    const hidden = setup(0);
    expect(hidden.controller.renderFrame()).toBe(false);
    const noCtx = setup();
    noCtx.canvas.hasContext = false;
    expect(noCtx.controller.renderFrame()).toBe(false);
  });

  it('stops and disposes its frame loop and MIDI listeners', async () => {
    const { frames, controller } = setup();
    const midi = new FakeMidiInput();
    await midi.connect('fake-keyboard');
    controller.attachMidi(midi);
    controller.start();
    expect(controller.running).toBe(true);
    controller.stop();
    controller.stop();
    expect(frames.waiting).toBe(0);
    controller.start();
    controller.dispose();
    expect(controller.running).toBe(false);
    expect(frames.waiting).toBe(0);
    midi.emitNoteOn(60);
    expect(controller.heldKeys[60]).toBe(0);
  });
});
