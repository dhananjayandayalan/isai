import { describe, expect, it } from 'vitest';
import frere from '../../../schema/examples/frere-jacques-a-cappella.json';
import twinkle from '../../../schema/examples/twinkle-g-major.json';
import { buildNoteIndex } from '../engine/activeNotes';
import { barsOfSong } from '../engine/practice/bars';
import { KEYBOARD_RANGES, KEYBOARD_SIZES, layoutKeys } from '../piano/layout';
import { RecordingContext, type DrawOp } from '../piano/testing';
import { parseSong, type Note } from '../song';
import { NoteNamer, type LaneChord } from '../theory/labels';
import { buildLane, laneIndexAt } from './chordLane';
import { drawFallingNotes, GHOST_ALPHA, labelNotes, MIN_BAR, steppedPosition, type FallingFrame } from './FallingNotes';
import { readStageColors, type StageColors } from './stage';
import {
  BASS,
  buildStaffNotes,
  drawStaff,
  ledgerSteps,
  staffGeometry,
  stepY,
  TREBLE,
  type StaffFrame,
} from './StaffRenderer';

const COLORS: StageColors = {
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

const song = parseSong(twinkle);
const index = buildNoteIndex(song.notes);
const bars = barsOfSong(song).bars.map((b) => b.start);
const G_MAJOR = { key: 'G', mode: 'major' as const, scale: song.tonality.scale };

function note(start: number, end: number, midi: number, hand: Note['hand'] = 'right'): Note {
  return { start, end, midi, velocity: 80, hand, source: 'arranged' };
}

function falling(overrides: Partial<FallingFrame> = {}): FallingFrame {
  return {
    layout: layoutKeys(KEYBOARD_RANGES[88], 880),
    height: 400,
    colors: COLORS,
    seconds: 0,
    lookahead: 4,
    index,
    labels: null,
    beats: song.tempo.beats,
    barStarts: bars,
    lane: [],
    otherHand: null,
    ...overrides,
  };
}

const ofType = <K extends DrawOp['op']>(ctx: RecordingContext, op: K) =>
  ctx.ops.filter((o): o is Extract<DrawOp, { op: K }> => o.op === op);

describe('falling notes', () => {
  it.each(KEYBOARD_SIZES)('puts every bar over its own key on %i keys', (size) => {
    const layout = layoutKeys(KEYBOARD_RANGES[size], 900);
    const ctx = new RecordingContext();
    drawFallingNotes(ctx, falling({ layout }));
    const visible = song.notes.filter((n) => n.start <= 4 && n.end > 0);
    const rects = ctx.rects();
    expect(rects).toHaveLength(visible.length);
    for (const rect of rects) {
      const key = layout.whites.concat(layout.blacks).find((k) => rect.x >= k.x && rect.x + rect.w <= k.x + k.width + 0.01);
      expect(key, `bar at ${rect.x}`).toBeDefined();
      expect(rect.w).toBeGreaterThan(key ? key.width - 4 : 0);
    }
    // Both hands, in their colours.
    expect(new Set(rects.map((r) => r.fill))).toEqual(new Set(['R', 'L']));
  });

  it('drops a note from the top of the stage to the keys as time passes', () => {
    const one = buildNoteIndex([note(2, 3, 60)]);
    const at = (seconds: number) => {
      const ctx = new RecordingContext();
      drawFallingNotes(ctx, falling({ index: one, seconds, beats: [], barStarts: [] }));
      return ctx.rects()[0];
    };
    expect(at(0)).toMatchObject({ y: 100, h: 100 }); // 2–3 s ahead of a 4 s window
    expect(at(1.5)).toMatchObject({ y: 250, h: 100 });
    // Sounding: its bottom sits on the keys.
    const sounding = at(2.5);
    expect((sounding?.y ?? 0) + (sounding?.h ?? 0)).toBe(400);
    expect(at(3.5)).toBeUndefined();
    // A very short note is still a visible bar.
    const ctx = new RecordingContext();
    drawFallingNotes(ctx, falling({ index: buildNoteIndex([note(1, 1.001, 60)]), beats: [], barStarts: [] }));
    expect(ctx.rects()[0]?.h).toBeGreaterThanOrEqual(MIN_BAR);
  });

  it('draws beat lines, and bar lines stronger', () => {
    const ctx = new RecordingContext();
    drawFallingNotes(ctx, falling({ index: buildNoteIndex([]) }));
    const lines = ofType(ctx, 'fillRect').filter((r) => r.h === 1);
    // Twinkle: beats every 0.6 s, bars every 2.4 s; 0–4 s holds beats 0 … 3.6 and bars 0, 2.4.
    expect(lines.filter((l) => l.fill === 'gridStrong').map((l) => l.y)).toEqual([400, 160]);
    expect(lines.filter((l) => l.fill === 'grid')).toHaveLength(5);
  });

  it('marks notes off the keyboard at the stage edges', () => {
    const layout = layoutKeys(KEYBOARD_RANGES[49], 700);
    const ctx = new RecordingContext();
    const off = buildNoteIndex([note(0.5, 1, 30, 'left'), note(1, 2, 100), note(1, 2, 60)]);
    drawFallingNotes(ctx, falling({ layout, index: off, beats: [], barStarts: [] }));
    const markers = ofType(ctx, 'path');
    expect(markers).toHaveLength(2);
    expect(markers[0]?.fill).toBe('L');
    expect(markers[0]?.points.some(([x]) => x === 0)).toBe(true);
    expect(markers[1]?.points.some(([x]) => x === 700)).toBe(true);
    expect(ctx.rects()).toHaveLength(1);
  });

  it('draws the hand you are not playing faint, or hides it', () => {
    const ghost = new RecordingContext();
    drawFallingNotes(ghost, falling({ otherHand: { hand: 'left', show: true } }));
    const left = ghost.rects().filter((r) => r.fill === 'L');
    expect(left.length).toBeGreaterThan(0);
    expect(left.every((r) => r.alpha === GHOST_ALPHA)).toBe(true);
    expect(ghost.rects().filter((r) => r.fill === 'R').every((r) => r.alpha === undefined)).toBe(true);
    const hidden = new RecordingContext();
    drawFallingNotes(hidden, falling({ otherHand: { hand: 'left', show: false } }));
    expect(hidden.rects().some((r) => r.fill === 'L')).toBe(false);
  });

  it('names notes in the chosen notation when the name fits, with swara octave dots', () => {
    const namer = new NoteNamer(G_MAJOR, { notation: 'swaras' });
    const ctx = new RecordingContext();
    drawFallingNotes(ctx, falling({ labels: labelNotes(index, namer), height: 800, layout: layoutKeys(KEYBOARD_RANGES[49], 1400) }));
    const texts = ofType(ctx, 'text').map((t) => t.text);
    expect(texts).toContain('S');
    expect(texts).toContain('P');
    // The bass G2 is two octaves below madhya Sa: two dots under it.
    const dots = ctx.circles().filter((c) => c.r === 1.5);
    expect(dots.length).toBeGreaterThan(0);
    // On a narrow 88-key stage the names don't fit, so none are drawn.
    const narrow = new RecordingContext();
    drawFallingNotes(narrow, falling({ labels: labelNotes(index, namer), layout: layoutKeys(KEYBOARD_RANGES[88], 300) }));
    expect(ofType(narrow, 'text')).toHaveLength(0);
  });

  it('spells each hand as a line', () => {
    const line = buildNoteIndex([note(0, 1, 60), note(0, 1, 49, 'left'), note(1, 2, 61), note(1, 2, 48, 'left'), note(2, 3, 62)]);
    const labels = labelNotes(line, new NoteNamer({ key: 'C', mode: 'major' }));
    // In time order: right C, left Db (going down to C), right C# (going up to D), left C, right D.
    expect(labels.map((l) => l.text)).toEqual(['C', 'Db', 'C#', 'C', 'D']);
  });

  it('shows the chord lane: upcoming chords at their start, the one sounding at the bottom', () => {
    const chords = song.chords as (LaneChord & { start: number; end: number })[];
    const lane = buildLane(chords, new NoteNamer(G_MAJOR, { notation: 'roman' }));
    const ctx = new RecordingContext();
    drawFallingNotes(ctx, falling({ lane, seconds: 0.5, index: buildNoteIndex([]) }));
    const texts = ofType(ctx, 'text');
    expect(texts[0]).toMatchObject({ text: 'I', fill: 'ink', y: 396 });
    expect(texts.slice(1).every((t) => t.fill === 'muted')).toBe(true);
    expect(texts.map((t) => t.text)).toEqual(['I', 'IV', 'I']);
  });

  it('steps to the last beat for reduced motion', () => {
    expect(steppedPosition(1.3, [0, 0.6, 1.2, 1.8])).toBe(1.2);
    expect(steppedPosition(0.6, [0, 0.6])).toBe(0.6);
    expect(steppedPosition(0.3, [])).toBe(0.3);
    expect(steppedPosition(0.3, [0.5])).toBe(0.3);
  });
});

describe('chord lane', () => {
  const chords = [
    { start: 4, end: 6, root: 7, quality: 'maj' as const, label: 'G' },
    { start: 0, end: 2, root: 2, quality: '7' as const, label: 'D7' },
    { start: 2, end: 4, root: 7, quality: 'maj' as const, label: 'G' },
  ];

  it('names chords in time order with their successor (a secondary dominant)', () => {
    const lane = buildLane(chords, new NoteNamer({ key: 'C', mode: 'major' }, { notation: 'roman' }));
    expect(lane.map((e) => e.text)).toEqual(['V7/V', 'V', 'V']);
  });

  it('finds the chord sounding at a time, or none in a gap', () => {
    const lane = buildLane([chords[1]!, { ...chords[0]!, start: 5 }], new NoteNamer({ key: 'C', mode: 'major' }));
    expect(laneIndexAt(lane, 1)).toBe(0);
    expect(laneIndexAt(lane, 3)).toBe(-1);
    expect(laneIndexAt(lane, 5.5)).toBe(1);
    expect(laneIndexAt(lane, -1)).toBe(-1);
    expect(laneIndexAt([], 1)).toBe(-1);
  });
});

describe('stage colours', () => {
  const style = (values: Record<string, string>) => ({ getPropertyValue: (name: string) => values[name] ?? '' });

  it('reads the theme tokens and scales text with the root font size', () => {
    const colors = readStageColors(
      style({ '--hand-right': '#eee', '--text-2xs': '11px', '--text-sm': '13px', '--font-mono': 'JB Mono', '--weight-medium': '500' }),
      20,
    );
    expect(colors.right).toBe('#eee');
    expect(colors.noteSize).toBe(14);
    expect(colors.laneSize).toBe(16);
    expect(colors.noteFont).toBe('500 14px JB Mono');
  });

  it('falls back to the token sizes and a monospace font', () => {
    const colors = readStageColors(style({}), Number.NaN);
    expect(colors.noteSize).toBe(11);
    expect(colors.laneFont).toBe('600 13px monospace');
    expect(readStageColors(style({})).laneSize).toBe(13);
  });
});

describe('staff notes', () => {
  it('places each note by letter and prints only accidentals the key signature lacks', () => {
    const notes = buildNoteIndex([note(0, 1, 66), note(1, 2, 65), note(2, 3, 61), note(3, 4, 60), note(4, 5, 70), note(5, 6, 69), note(0, 1, 43, 'left')]);
    const staff = buildStaffNotes(notes, G_MAJOR);
    const right = staff.filter((n) => n.hand === 'right');
    // F#4 (in the key), F4 (natural), C#4 going down to C4 (so Db), C4, Bb4 going down (flat), A4.
    expect(right.map((n) => n.accidental)).toEqual(['', '♮', '♭', '', '♭', '']);
    expect(right.map((n) => n.step)).toEqual([31, 31, 29, 28, 34, 33]);
    expect(staff.find((n) => n.hand === 'left')).toMatchObject({ step: 18, accidental: '' });
  });

  it('knows the flats of a flat key, and double sharps', () => {
    const flat = buildStaffNotes(buildNoteIndex([note(0, 1, 70), note(1, 2, 71)]), { key: 'F', mode: 'major' });
    expect(flat.map((n) => n.accidental)).toEqual(['', '♮']);
    const sharp = buildStaffNotes(buildNoteIndex([note(0, 1, 67)]), { key: 'Fb', mode: 'major' });
    expect(sharp[0]?.accidental).toBe('♮'); // G natural against Fb major's Gb
  });

  it('gives ledger lines only outside the staff', () => {
    expect(ledgerSteps('treble', 28)).toEqual([28]); // middle C
    expect(ledgerSteps('treble', 27)).toEqual([28]);
    expect(ledgerSteps('treble', 26)).toEqual([28, 26]);
    expect(ledgerSteps('treble', 34)).toEqual([]);
    expect(ledgerSteps('treble', 42)).toEqual([40, 42]);
    expect(ledgerSteps('bass', 28)).toEqual([28]);
    expect(ledgerSteps('bass', 15)).toEqual([16]);
    expect(TREBLE.bottom - BASS.top).toBe(4);
  });
});

describe('staff', () => {
  const staffNotes = buildStaffNotes(index, G_MAJOR);
  function staff(overrides: Partial<StaffFrame> = {}): StaffFrame {
    return {
      width: 900,
      height: 300,
      colors: COLORS,
      seconds: 0,
      lookahead: 4,
      notes: staffNotes,
      keySignature: 1,
      barStarts: bars,
      lane: [],
      otherHand: null,
      ...overrides,
    };
  }

  it('draws two five-line staves, clefs and the key signature', () => {
    const ctx = new RecordingContext();
    drawStaff(ctx, staff());
    const g = staffGeometry(900, 300, 4, 1);
    const lineYs = new Set(ofType(ctx, 'fillRect').filter((r) => r.w === 900 && r.h === 1).map((r) => r.y));
    for (const s of [30, 32, 34, 36, 38]) expect(lineYs.has(Math.round(stepY(g, 'treble', s)))).toBe(true);
    for (const s of [18, 20, 22, 24, 26]) expect(lineYs.has(Math.round(stepY(g, 'bass', s)))).toBe(true);
    const texts = ofType(ctx, 'text').map((t) => t.text);
    expect(texts).toContain('𝄞');
    expect(texts).toContain('𝄢');
    expect(texts.filter((t) => t === '♯')).toHaveLength(2); // F# on both staves
    const flats = new RecordingContext();
    drawStaff(flats, staff({ keySignature: -3, notes: [] }));
    expect(ofType(flats, 'text').filter((t) => t.text === '♭')).toHaveLength(6);
  });

  it('puts right-hand notes on the treble staff and left-hand notes on the bass, by time', () => {
    const ctx = new RecordingContext();
    drawStaff(ctx, staff());
    const g = staffGeometry(900, 300, 4, 1);
    const heads = ctx.circles();
    const visible = staffNotes.filter((n) => n.start <= 4);
    expect(heads).toHaveLength(visible.length);
    const first = heads.find((h) => h.fill === 'R');
    expect(first?.x).toBeCloseTo(g.playheadX, 6);
    expect(first?.y).toBeCloseTo(stepY(g, 'treble', 32), 6); // G4
    const bass = heads.find((h) => h.fill === 'L');
    expect(bass?.y).toBeCloseTo(stepY(g, 'bass', 18), 6); // G2
    // Half a second later, everything has moved left by half a second.
    const later = new RecordingContext();
    drawStaff(later, staff({ seconds: 0.5 }));
    const moved = later.circles().find((h) => h.fill === 'R' && h.y === first?.y);
    expect(moved?.x).toBeCloseTo((first?.x ?? 0) - 0.5 * g.pxPerSecond, 6);
  });

  it('draws ledger lines, accidentals, bar lines and the playhead', () => {
    const notes = buildStaffNotes(buildNoteIndex([note(0.5, 1, 60), note(1, 2, 65)]), G_MAJOR);
    const ctx = new RecordingContext();
    drawStaff(ctx, staff({ notes }));
    const g = staffGeometry(900, 300, 4, 1);
    const ledgers = ofType(ctx, 'fillRect').filter((r) => Math.abs(r.w - g.half * 3.6) < 1e-9);
    expect(ledgers.map((r) => r.y)).toEqual([Math.round(stepY(g, 'treble', 28))]);
    expect(ofType(ctx, 'text').map((t) => t.text)).toContain('♮');
    const playhead = ofType(ctx, 'fillRect').filter((r) => r.w === 2);
    expect(playhead).toHaveLength(1);
    expect(playhead[0]?.x).toBe(Math.round(g.playheadX));
    const barLines = ofType(ctx, 'fillRect').filter((r) => r.w === 1 && r.fill === 'gridStrong');
    expect(barLines.length).toBeGreaterThan(0);
  });

  it('draws the hand you are not playing faint, or hides it', () => {
    const ghost = new RecordingContext();
    drawStaff(ghost, staff({ otherHand: { hand: 'left', show: true } }));
    expect(ghost.circles().filter((c) => c.fill === 'L').every((c) => c.alpha === 0.3)).toBe(true);
    const hidden = new RecordingContext();
    drawStaff(hidden, staff({ otherHand: { hand: 'left', show: false } }));
    expect(hidden.circles().some((c) => c.fill === 'L')).toBe(false);
  });

  it('shows the chord lane above the treble staff', () => {
    const lane = buildLane(song.chords as (LaneChord & { start: number; end: number })[], new NoteNamer(G_MAJOR));
    const ctx = new RecordingContext();
    drawStaff(ctx, staff({ lane, seconds: 0.2 }));
    const names = ofType(ctx, 'text').filter((t) => t.font === COLORS.laneFont);
    expect(names[0]).toMatchObject({ text: 'G', fill: 'ink' });
    expect(names.map((t) => t.text)).toEqual(['G', 'C', 'G']);
  });

  it('draws a song with no beats or chords (Frère Jacques has no chords)', () => {
    const frereSong = parseSong(frere);
    const ctx = new RecordingContext();
    drawStaff(ctx, staff({ notes: buildStaffNotes(buildNoteIndex(frereSong.notes), { key: 'F', mode: 'major' }), keySignature: -1, barStarts: [] }));
    expect(ctx.circles().length).toBeGreaterThan(0);
  });
});
