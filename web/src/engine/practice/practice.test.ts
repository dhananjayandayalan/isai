import { describe, expect, it } from 'vitest';
import frere from '../../../../schema/examples/frere-jacques-a-cappella.json';
import twinkle from '../../../../schema/examples/twinkle-g-major.json';
import { FakeInstrument } from '../../audio/FakeInstrument';
import { FakeTransport } from '../../audio/FakeTransport';
import { FakeMidiInput } from '../../midi/FakeMidiInput';
import { parseSong, type Note, type Song } from '../../song';
import {
  FLASH_CORRECT,
  FLASH_SECONDS,
  FLASH_WRONG,
  HOLD_LEAD,
  KEY_EXPECT_LEFT,
  KEY_EXPECT_RIGHT,
  KEY_NEXT_LEFT,
  KEY_NEXT_RIGHT,
  PracticeEngine,
  type PracticeSettings,
  type PracticeState,
  type StepEvent,
} from './engine';

function note(start: number, end: number, midi: number, hand: Note['hand'] = 'right', velocity = 80): Note {
  return { start, end, midi, velocity, hand, source: 'arranged' };
}

interface SongOptions {
  durationSec?: number;
  /** Beat times; defaults to one every half second (120 BPM), four in a bar. */
  beats?: number[];
  bpm?: number;
  beatsPerBar?: number;
}

function songWith(notes: Note[], options: SongOptions = {}): Song {
  const base = parseSong(twinkle);
  const durationSec = options.durationSec ?? 10;
  const beats = options.beats ?? Array.from({ length: Math.ceil(durationSec / 0.5) }, (_, i) => i * 0.5);
  return {
    ...base,
    durationSec,
    notes,
    tempo: { bpm: options.bpm ?? 120, beats },
    timeSignature: { num: options.beatsPerBar ?? 4, den: 4 },
  };
}

interface SetupOptions extends SongOptions {
  settings?: Partial<PracticeSettings>;
  lookahead?: number;
  song?: Song;
}

function setup(notes: Note[], options: SetupOptions = {}) {
  const transport = new FakeTransport(100);
  transport.lookahead = options.lookahead ?? 0;
  const piano = new FakeInstrument();
  const metronome = new FakeInstrument('synth');
  const midi = new FakeMidiInput();
  void midi.connect('fake-keyboard');
  const engine = new PracticeEngine({
    song: options.song ?? songWith(notes, options),
    transport,
    piano,
    metronome,
    clock: transport.clock,
    midi,
    ...(options.settings ? { settings: options.settings } : {}),
  });
  const states: PracticeState[] = [];
  engine.onStateChange((s) => states.push(s));
  const steps: StepEvent[] = [];
  engine.onStep((e) => steps.push(e));
  /** Press and release a key now (or `ago` seconds ago). */
  const press = (key: number, ago = 0) => {
    midi.emitNoteOn(key, { time: transport.audioTime - ago });
    midi.emitNoteOff(key, { time: transport.audioTime - ago });
  };
  return { transport, piano, metronome, midi, engine, states, steps, press };
}

const round = (n: number | undefined) => (n === undefined ? undefined : Math.round(n * 1000) / 1000);

/** [midi, audio time] of every note-on, in order. */
function ons(piano: FakeInstrument): [number, number | undefined][] {
  return piano.calls.flatMap((c) => (c.type === 'on' ? [[c.midi, round(c.time)] as [number, number | undefined]] : []));
}

function offs(piano: FakeInstrument): [number, number | undefined][] {
  return piano.calls.flatMap((c) => (c.type === 'off' ? [[c.midi, round(c.time)] as [number, number | undefined]] : []));
}

const training = (extra: Partial<PracticeSettings> = {}): Partial<PracticeSettings> => ({
  mode: 'training',
  hands: 'right',
  ...extra,
});

// The learner's keys sound through the same piano ("Play my notes through Isai"). The
// engine may only stop the notes it started.
describe('a note the engine did not start', () => {
  const LEARNER = 72;
  /** A song with a long note, so the engine always has something of its own to cut. */
  const playing = (settings: Partial<PracticeSettings> = {}) => {
    const made = setup([note(0, 8, 48, 'left'), note(0, 1, 60), note(1, 2, 62), note(2, 3, 64)], { settings });
    made.engine.play();
    made.transport.advanceTo(1.2);
    made.piano.noteOn(LEARNER, 90); // as `monitorMidi` does for a key the learner holds
    return made;
  };
  const stillRinging = (piano: FakeInstrument) => {
    expect(piano.sounding.has(LEARNER)).toBe(true);
    expect(piano.calls.some((c) => c.type === 'releaseAll')).toBe(false);
  };

  it('rings on through a seek, which cuts the engine notes', () => {
    const { piano, engine } = playing();
    engine.seek(9);
    expect(piano.sounding.has(48)).toBe(false);
    stillRinging(piano);
  });

  it('rings on through a change of speed', () => {
    const { piano, engine, transport } = playing();
    engine.configure({ speed: 0.5 });
    transport.advanceBy(0.5);
    stillRinging(piano);
  });

  it('rings on through pause and stop', () => {
    const { piano, engine } = playing();
    engine.pause();
    expect(piano.sounding.has(48)).toBe(false);
    stillRinging(piano);
    engine.stop();
    stillRinging(piano);
  });

  it('rings on through a loop wrap', () => {
    const { piano, engine, transport } = playing({ loop: { start: 1, end: 3 } });
    transport.advanceBy(4);
    expect(engine.loopPasses).toBeGreaterThan(1);
    stillRinging(piano);
  });

  it('rings on past the end of the song', () => {
    const { piano, engine, transport } = playing();
    transport.advanceBy(20);
    expect(engine.state).toBe('stopped');
    expect(piano.sounding.has(48)).toBe(false);
    stillRinging(piano);
  });
});

describe('listening (the P1 player, on the practice engine)', () => {
  it('sounds note-on and note-off on the audio clock with velocity', () => {
    const { transport, piano, engine } = setup([note(1, 2, 60, 'right', 90), note(0, 1.5, 48, 'left', 50)]);
    engine.play();
    transport.advanceTo(3);
    expect(piano.calls.filter((c) => c.type !== 'releaseAll')).toEqual([
      { type: 'on', midi: 48, velocity: 50, time: 100 },
      { type: 'on', midi: 60, velocity: 90, time: 101 },
      { type: 'off', midi: 48, time: 101.5 },
      { type: 'off', midi: 60, time: 102 },
    ]);
  });

  it('moves through play, pause and stop, notifying only on changes', () => {
    const { transport, engine, states, piano } = setup([note(0, 5, 60)]);
    expect(engine.state).toBe('stopped');
    expect(engine.phase).toBe('idle');
    engine.play();
    engine.play();
    expect(engine.phase).toBe('running');
    transport.advanceTo(2);
    engine.pause();
    engine.pause();
    expect(engine.seconds).toBe(2);
    expect(piano.sounding.size).toBe(0); // pause silences
    engine.play();
    transport.advanceBy(1);
    expect(engine.seconds).toBe(3);
    engine.stop();
    expect(engine.seconds).toBe(0);
    expect(states).toEqual(['playing', 'paused', 'playing', 'stopped']);
  });

  it('stops notifying unsubscribed listeners', () => {
    const { engine } = setup([note(0, 1, 60)]);
    const seen: PracticeState[] = [];
    const unsubscribe = engine.onStateChange((s) => seen.push(s));
    engine.play();
    unsubscribe();
    engine.pause();
    expect(seen).toEqual(['playing']);
  });

  it('resumes from the paused position without replaying earlier notes', () => {
    const { transport, piano, engine } = setup([note(1, 2, 60), note(3, 4, 62)]);
    engine.play();
    transport.advanceTo(2.5);
    engine.pause();
    engine.play();
    transport.advanceBy(2.5);
    expect(ons(piano).map(([midi]) => midi)).toEqual([60, 62]);
  });

  it('strikes a note again when playback resumes in the middle of it', () => {
    const { transport, piano, engine } = setup([note(0, 3, 60), note(4, 5, 62)]);
    engine.play();
    transport.advanceTo(1);
    engine.pause(); // 60 is cut...
    transport.wait(5);
    engine.play();
    transport.advanceBy(0.5); // ...and heard again from here
    expect(ons(piano)).toEqual([
      [60, 100],
      [60, 106],
    ]);
    transport.advanceBy(2);
    expect(offs(piano)).toEqual([
      [60, undefined], // the pause, at once
      [60, 108],
    ]);
    expect(piano.sounding.size).toBe(0);
  });

  it('seeking mid-note leaves nothing hanging, re-sounds what is held there and skips earlier notes', () => {
    const { transport, piano, engine } = setup([note(0, 1, 59), note(0, 3, 60), note(4, 5, 62)]);
    engine.play();
    transport.advanceTo(0.5); // 59 and 60 are sounding
    engine.seek(2);
    expect(piano.sounding.size).toBe(0);
    expect(engine.seconds).toBe(2);
    transport.advanceBy(4);
    // 60 is still held at 2, so it sounds again there; 59 ended before 2 and does not.
    expect(ons(piano).map(([midi]) => midi)).toEqual([59, 60, 60, 62]);
    // The seek cuts 59 and 60; then 60 and 62 end in the song.
    expect(offs(piano).map(([midi]) => midi)).toEqual([59, 60, 60, 62]);
    expect(piano.sounding.size).toBe(0);
  });

  it('seeking while stopped positions the song for the next play', () => {
    const { transport, piano, engine, states } = setup([note(1, 2, 60), note(3, 4, 62)]);
    engine.seek(2.5);
    expect(engine.state).toBe('paused');
    expect(states).toEqual(['paused']);
    engine.play();
    transport.advanceBy(2);
    expect(ons(piano).map(([midi]) => midi)).toEqual([62]);
  });

  it('clamps seeks to the song, just short of the end so the end still arrives', () => {
    const { engine, transport, states } = setup([note(0, 1, 60)], { durationSec: 4 });
    engine.seek(-3);
    expect(engine.seconds).toBe(0);
    engine.seek(99);
    expect(engine.seconds).toBeCloseTo(3.99);
    engine.seek(Number.NaN);
    expect(engine.seconds).toBe(0);
    engine.seek(4);
    engine.play();
    transport.advanceBy(0.1);
    expect(engine.state).toBe('stopped');
    expect(states.at(-1)).toBe('stopped');
  });

  it('keeps an overlapping note on the same key sounding until its own end', () => {
    const { transport, piano, engine } = setup([note(0, 2, 60), note(1, 3, 60)]);
    engine.play();
    transport.advanceTo(2.5);
    expect(offs(piano)).toEqual([]);
    expect(piano.sounding.has(60)).toBe(true);
    transport.advanceTo(4);
    expect(offs(piano)).toEqual([[60, 103]]);
  });

  it('stops at the end of the song, releasing at the scheduled time', () => {
    // The note runs past the end of the song.
    const { transport, engine, states, piano } = setup([note(0, 2.5, 60)], { durationSec: 2 });
    engine.play();
    transport.advanceTo(10);
    expect(engine.state).toBe('stopped');
    expect(engine.seconds).toBe(0);
    expect(states).toEqual(['playing', 'stopped']);
    expect(piano.calls.at(-1)).toEqual({ type: 'off', midi: 60, time: 102 });
    expect(piano.sounding.size).toBe(0);
    expect(transport.state).toBe('stopped');
    expect(transport.scheduledCount).toBe(0);
    // ...and it can be played again from the top.
    engine.play();
    transport.advanceBy(0.5);
    expect(ons(piano)).toHaveLength(2);
  });

  it('plays an empty song and stops at once', () => {
    const { transport, piano, engine } = setup([], { durationSec: 0 });
    expect(engine.duration).toBe(0);
    engine.play();
    transport.advanceTo(0.1);
    expect(engine.state).toBe('stopped');
    expect(ons(piano)).toEqual([]);
  });

  it('plays a single note', () => {
    const { transport, piano, engine } = setup([note(0.5, 1, 67)], { durationSec: 1 });
    engine.play();
    transport.advanceTo(2);
    expect(piano.calls.filter((c) => c.type !== 'releaseAll').map((c) => c.type)).toEqual(['on', 'off']);
  });

  it('does not sound velocity-0 notes', () => {
    const { transport, piano, engine } = setup([note(0, 1, 60, 'right', 0), note(0, 1, 64)]);
    engine.play();
    transport.advanceTo(2);
    expect(ons(piano).map(([midi]) => midi)).toEqual([64]);
  });

  it('ignores the keyboard: nothing is expected and nothing is judged', () => {
    const { transport, engine, press } = setup([note(1, 2, 60)]);
    engine.play();
    transport.advanceTo(0.5);
    press(61);
    expect(engine.wrongNotes).toBe(0);
    expect(engine.expected).toEqual([]);
    expect(engine.stepCount).toBe(0);
    expect(engine.dimHand).toBeNull();
    transport.advanceTo(3);
    expect(transport.state).toBe('started'); // never held
  });

  it('puts only the next few seconds on the transport, and clears what has played', () => {
    const many = Array.from({ length: 200 }, (_, i) => note(i, i + 0.5, 60 + (i % 12)));
    const { transport, piano, engine } = setup(many, { durationSec: 200, beats: [] });
    engine.play();
    expect(transport.scheduledCount).toBeLessThan(10);
    let most = 0;
    for (let t = 1; t <= 150; t++) {
      transport.advanceTo(t);
      most = Math.max(most, transport.scheduledCount);
    }
    expect(most).toBeLessThan(20);
    expect(ons(piano)).toHaveLength(150);
    engine.dispose();
    expect(transport.scheduledCount).toBe(0);
  });

  it('dispose clears everything it scheduled and drops its listeners', () => {
    const { transport, engine, states, midi } = setup([note(0, 1, 60), note(1, 2, 62)], {
      settings: training(),
    });
    engine.play();
    expect(transport.scheduledCount).toBeGreaterThan(0);
    engine.dispose();
    expect(transport.scheduledCount).toBe(0);
    expect(transport.state).toBe('stopped');
    states.length = 0;
    engine.play();
    expect(states).toEqual([]);
    midi.emitNoteOn(61); // no longer listening
    expect(engine.wrongNotes).toBe(0);
  });
});

describe('speed', () => {
  it('stretches the song on the transport: half speed takes twice as long', () => {
    const { transport, piano, engine } = setup([note(1, 2, 60)], { settings: { speed: 0.5 } });
    engine.play();
    transport.advanceTo(5);
    expect(ons(piano)).toEqual([[60, 102]]);
    expect(offs(piano)).toEqual([[60, 104]]);
    expect(engine.seconds).toBe(2.5);
  });

  it('plays faster above 100%', () => {
    const { transport, piano, engine } = setup([note(1.2, 2.4, 60)], { settings: { speed: 1.2 } });
    engine.play();
    transport.advanceTo(3);
    expect(ons(piano)).toEqual([[60, 101]]);
    expect(offs(piano)).toEqual([[60, 102]]);
  });

  it('keeps the speed between 40% and 120%', () => {
    const { engine } = setup([note(0, 1, 60)]);
    engine.configure({ speed: 0.1 });
    expect(engine.settings.speed).toBe(0.4);
    engine.configure({ speed: 3 });
    expect(engine.settings.speed).toBe(1.2);
    engine.configure({ speed: Number.NaN });
    expect(engine.settings.speed).toBe(1);
    engine.configure({ speed: 0.85000001 });
    expect(engine.settings.speed).toBe(0.85);
  });

  it('changes mid-song from where the song is, re-sounding a held note', () => {
    const { transport, piano, engine } = setup([note(0, 5, 48, 'left'), note(3, 4, 60)]);
    engine.play();
    transport.advanceTo(2);
    engine.configure({ speed: 0.5 });
    expect(engine.seconds).toBe(2);
    expect(engine.state).toBe('playing');
    transport.advanceBy(1); // one transport second is half a song second now
    expect(engine.seconds).toBe(2.5);
    transport.advanceBy(1.5);
    expect(ons(piano)).toEqual([
      [48, 100],
      [48, 102], // struck again at the change
      [60, 104], // song 3.0 is two transport seconds after song 2.0
    ]);
  });

  it('changes while paused and while stopped without starting anything', () => {
    const { transport, piano, engine } = setup([note(1, 2, 60)]);
    engine.configure({ speed: 0.5 });
    expect(engine.state).toBe('stopped');
    engine.play();
    transport.advanceTo(1);
    engine.pause();
    engine.configure({ speed: 1 });
    expect(engine.state).toBe('paused');
    expect(engine.seconds).toBe(0.5);
    engine.play();
    transport.advanceBy(0.6);
    expect(ons(piano)).toEqual([[60, 101.5]]);
  });
});

describe('training: holding at each step', () => {
  // Right hand: C4 at 1, D4 at 2. Left hand: C3 under both.
  const duet = () => [note(1, 3, 48, 'left'), note(1, 2, 60), note(2, 3, 62)];

  it('lights the step to play and outlines the one after', () => {
    const { engine } = setup(duet(), { settings: training() });
    expect(engine.expected).toEqual([{ midi: 60, hand: 'right' }]);
    expect(engine.keys[60]).toBe(KEY_EXPECT_RIGHT);
    expect(engine.keys[62]).toBe(KEY_NEXT_RIGHT);
    expect(engine.keys[48]).toBe(0); // not the hand being practised
    expect(engine.dimHand).toBe('left');
    expect(engine.stepNumber).toBe(1);
    expect(engine.stepCount).toBe(2);

    const left = setup(duet(), { settings: training({ hands: 'left' }) }).engine;
    expect(left.keys[48]).toBe(KEY_EXPECT_LEFT);
    expect(left.dimHand).toBe('right');
    const both = setup([...duet(), note(4, 5, 36, 'left')], { settings: training({ hands: 'both' }) }).engine;
    expect(both.keys[48]).toBe(KEY_EXPECT_LEFT);
    expect(both.keys[60]).toBe(KEY_EXPECT_RIGHT);
    expect(both.keys[62]).toBe(KEY_NEXT_RIGHT);
    expect(both.dimHand).toBeNull();
    expect(both.stepCount).toBe(3);
    expect(both.keys[36]).toBe(0); // two steps ahead
    void KEY_NEXT_LEFT;
  });

  it('holds just before the step, with nothing new sounding', () => {
    const { transport, piano, engine, states } = setup(duet(), { settings: training() });
    engine.play();
    transport.advanceTo(5);
    expect(transport.state).toBe('paused');
    expect(transport.seconds).toBeCloseTo(1 - HOLD_LEAD);
    expect(engine.seconds).toBeCloseTo(1 - HOLD_LEAD);
    expect(engine.phase).toBe('waiting');
    expect(engine.state).toBe('playing'); // a hold is not a pause: no state change
    expect(states).toEqual(['playing']);
    expect(ons(piano)).toEqual([]);
    transport.wait(30); // however long the learner takes
    expect(engine.phase).toBe('waiting');
    expect(ons(piano)).toEqual([]);
  });

  it('resumes on the right note, and then the other hand sounds', () => {
    const { transport, piano, engine, press, steps } = setup(duet(), { settings: training() });
    engine.play();
    transport.advanceTo(5);
    transport.wait(2);
    press(60);
    expect(engine.phase).toBe('running');
    expect(transport.state).toBe('started');
    expect(engine.stepNumber).toBe(2);
    expect(engine.expected).toEqual([{ midi: 62, hand: 'right' }]);
    transport.advanceBy(0.5);
    // The left hand's C3 sounds as the song moves on; Isai does not play your C4.
    expect(ons(piano)).toEqual([[48, 103]]);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ wrong: 0, held: true, time: 102.999 });
    expect(steps[0]?.step.pitches).toEqual([60]);
  });

  it('ignores wrong notes: they are counted and marked, and the hold stays', () => {
    const { transport, engine, midi, press } = setup(duet(), { settings: training() });
    engine.play();
    transport.advanceTo(5);
    midi.emitNoteOn(61, { time: transport.audioTime });
    midi.emitNoteOn(72, { time: transport.audioTime });
    expect(engine.phase).toBe('waiting');
    expect(engine.wrongNotes).toBe(2);
    expect(engine.flashKind[61]).toBe(FLASH_WRONG);
    expect(engine.flashUntil[61]).toBeCloseTo(transport.audioTime + FLASH_SECONDS);
    press(60);
    expect(engine.phase).toBe('running');
    expect(engine.flashKind[60]).toBe(FLASH_CORRECT);
    expect(engine.stepsDone).toBe(1);
    expect(engine.firstTime).toBe(0); // not right first time
  });

  it('needs every note of a chord, and un-lights each as it is played', () => {
    const chord = [note(1, 2, 60), note(1, 2, 64), note(1, 2, 67)];
    const { transport, engine, midi } = setup(chord, { settings: training() });
    engine.play();
    transport.advanceTo(5);
    const revision = engine.revision;
    midi.emitNoteOn(64, { time: transport.audioTime });
    expect(engine.phase).toBe('waiting');
    expect(engine.expected.map((k) => k.midi)).toEqual([60, 67]);
    expect(engine.keys[64]).toBe(0);
    expect(engine.revision).toBeGreaterThan(revision); // the piano knows to redraw
    midi.emitNoteOn(60, { time: transport.audioTime });
    midi.emitNoteOn(67, { time: transport.audioTime });
    expect(engine.phase).toBe('running');
    expect(engine.firstTime).toBe(1);
  });

  it('does not hold at all for a key played just before the step', () => {
    const { transport, piano, engine, press, steps } = setup(duet(), { settings: training() });
    engine.play();
    transport.advanceTo(0.9);
    press(60); // 99 ms early: inside the grace
    transport.advanceTo(1.5);
    expect(transport.state).toBe('started');
    expect(ons(piano)).toEqual([[48, 101]]); // exactly on the grid
    expect(steps[0]).toMatchObject({ held: false, wrong: 0 });
    expect(engine.flashKind[60]).toBe(FLASH_CORRECT);
  });

  it('holds for a key played too early and let go', () => {
    const { transport, engine, press } = setup(duet(), { settings: training() });
    engine.play();
    transport.advanceTo(0.5);
    press(60); // half a second early
    transport.advanceTo(1.5);
    expect(engine.phase).toBe('waiting');
    expect(engine.wrongNotes).toBe(0); // early, not wrong
  });

  it('does not hold for a key still down from the step before', () => {
    const repeated = [note(1, 1.4, 60), note(2, 2.4, 60), note(3, 3.4, 62)];
    const { transport, engine, midi } = setup(repeated, { settings: training() });
    engine.play();
    transport.advanceTo(5);
    midi.emitNoteOn(60, { time: transport.audioTime }); // ...and kept down
    transport.advanceBy(5);
    expect(engine.stepNumber).toBe(3); // sailed through the second C4
    expect(engine.expected).toEqual([{ midi: 62, hand: 'right' }]);
    expect(engine.phase).toBe('waiting');
  });

  it('judges nothing while paused or stopped, but remembers keys that are down', () => {
    const { transport, engine, midi } = setup(duet(), { settings: training() });
    midi.emitNoteOn(61);
    midi.emitNoteOn(60); // down before Play, and held
    expect(engine.wrongNotes).toBe(0);
    engine.play();
    transport.advanceTo(1.5);
    expect(transport.state).toBe('started'); // the held C4 counted
    expect(engine.stepsDone).toBe(1);
  });

  it('uses "now" for a keyboard that reports no usable time', () => {
    const { transport, engine, midi, steps } = setup(duet(), { settings: training() });
    engine.play();
    transport.advanceTo(5);
    transport.wait(3);
    midi.emitNoteOn(60); // FakeMidiInput's default time is 0
    expect(steps[0]?.time).toBeCloseTo(transport.audioTime);
    expect(engine.phase).toBe('running');
  });

  it('runs to the end after the last step and stops', () => {
    const { transport, engine, press, states } = setup(duet(), { settings: training(), durationSec: 4 });
    engine.play();
    transport.advanceTo(5);
    press(60);
    transport.advanceBy(5);
    press(62);
    expect(engine.stepNumber).toBe(2);
    expect(engine.expected).toEqual([]);
    transport.advanceBy(5);
    expect(states).toEqual(['playing', 'stopped']);
    expect(engine.stepsDone).toBe(2);
    expect(engine.firstTime).toBe(2);
    // Back at the top, ready to go again.
    expect(engine.stepNumber).toBe(1);
    expect(engine.keys[60]).toBe(KEY_EXPECT_RIGHT);
  });

  it('mutes the other hand when asked, at once', () => {
    const { transport, piano, engine, press } = setup(duet(), { settings: training({ otherHand: 'mute' }) });
    engine.play();
    transport.advanceTo(5);
    press(60);
    transport.advanceBy(0.5);
    expect(ons(piano)).toEqual([]);
    const scheduled = transport.scheduledCount;
    engine.configure({ otherHand: 'play' }); // no re-layout needed
    expect(transport.scheduledCount).toBe(scheduled);
  });

  it('sounds nothing from Isai when both hands are practised', () => {
    const { transport, piano, engine, midi } = setup(duet(), { settings: training({ hands: 'both' }) });
    engine.play();
    transport.advanceTo(5);
    expect(engine.expected).toEqual([
      { midi: 48, hand: 'left' },
      { midi: 60, hand: 'right' },
    ]);
    midi.emitNoteOn(48, { time: transport.audioTime });
    midi.emitNoteOn(60, { time: transport.audioTime });
    transport.advanceBy(0.5);
    expect(ons(piano)).toEqual([]);
  });

  it('does not expect notes the keyboard has no key for, unless any octave will do', () => {
    const { engine } = setup([note(1, 2, 30), note(2, 3, 60)], {
      settings: training({ playable: { low: 36, high: 84 } }),
    });
    expect(engine.stepCount).toBe(1);
    expect(engine.expected).toEqual([{ midi: 60, hand: 'right' }]);
    engine.configure({ octave: 'any' });
    expect(engine.stepCount).toBe(2);
    expect(engine.expected).toEqual([{ midi: 30, hand: 'right' }]);
  });

  it('accepts any octave when that is switched on', () => {
    const { transport, engine, press } = setup(duet(), { settings: training({ octave: 'any' }) });
    engine.play();
    transport.advanceTo(5);
    press(84);
    expect(engine.phase).toBe('running');
    expect(engine.flashKind[84]).toBe(FLASH_CORRECT);
  });

  it('starts holding when training is switched on mid-song, and stops when switched off', () => {
    const { transport, engine, piano } = setup(duet(), { durationSec: 6 });
    engine.play();
    transport.advanceTo(1.5);
    expect(ons(piano).map(([midi]) => midi)).toEqual([48, 60]);
    engine.configure(training());
    expect(engine.stepNumber).toBe(2);
    transport.advanceBy(5);
    expect(engine.phase).toBe('waiting');
    expect(engine.seconds).toBeCloseTo(2 - HOLD_LEAD);
    engine.configure({ mode: 'listen' });
    expect(engine.phase).toBe('running');
    transport.advanceBy(1);
    expect(ons(piano).at(-1)?.[0]).toBe(62);
  });
});

describe('training: seek, pause and stop while holding', () => {
  const melody = () => [note(1, 2, 60), note(2, 3, 62), note(3, 4, 64), note(1, 4, 48, 'left')];

  function held() {
    const s = setup(melody(), { settings: training() });
    s.engine.play();
    s.transport.advanceTo(5);
    expect(s.engine.phase).toBe('waiting');
    return s;
  }

  it('seeks while holding: playback moves on and holds at the next step from there', () => {
    const { transport, engine, piano } = held();
    engine.seek(2.5);
    expect(engine.phase).toBe('running');
    expect(engine.stepNumber).toBe(3);
    transport.advanceBy(5);
    expect(engine.phase).toBe('waiting');
    expect(engine.seconds).toBeCloseTo(3 - HOLD_LEAD);
    expect(engine.expected).toEqual([{ midi: 64, hand: 'right' }]);
    // The left hand's long note is held at 2.5, so it sounds from there.
    expect(ons(piano)).toEqual([[48, 100.999]]);
  });

  it('seeks back to a step and holds on it again', () => {
    const { transport, engine, press } = held();
    press(60);
    transport.advanceBy(5); // holding at D4
    engine.seek(0);
    transport.advanceBy(5);
    expect(engine.phase).toBe('waiting');
    expect(engine.expected).toEqual([{ midi: 60, hand: 'right' }]);
  });

  it('stops while holding with no hanging notes', () => {
    const { transport, engine, piano, press, states } = held();
    press(60);
    transport.advanceBy(5); // the left hand is sounding, holding at D4
    expect(piano.sounding.has(48)).toBe(true);
    engine.stop();
    expect(piano.sounding.size).toBe(0);
    expect(transport.state).toBe('stopped');
    expect(transport.scheduledCount).toBe(0);
    expect(engine.seconds).toBe(0);
    expect(engine.phase).toBe('idle');
    expect(states).toEqual(['playing', 'stopped']);
    expect(engine.expected).toEqual([{ midi: 60, hand: 'right' }]);
  });

  it('pauses while holding and holds on the same step when played again', () => {
    const { transport, engine, press } = held();
    engine.pause();
    expect(engine.state).toBe('paused');
    expect(engine.phase).toBe('idle');
    press(60); // not judged while paused
    expect(engine.stepsDone).toBe(0);
    engine.play();
    transport.advanceBy(1);
    expect(engine.phase).toBe('waiting');
    expect(engine.expected).toEqual([{ midi: 60, hand: 'right' }]);
    press(60);
    expect(engine.phase).toBe('running');
  });

  it('lets notes already sounding ring through a hold', () => {
    const { transport, piano, press } = held();
    press(60);
    transport.advanceBy(5); // holding at D4; C3 has been sounding since the first step
    expect(offs(piano)).toEqual([]);
    expect(piano.sounding.has(48)).toBe(true);
    press(62);
    transport.advanceBy(0.5);
    expect(ons(piano).map(([midi]) => midi)).toEqual([48]); // not struck again
  });

  it('changes speed while holding and stays on the step', () => {
    const { transport, engine, press } = held();
    engine.configure({ speed: 0.5 });
    transport.advanceBy(1);
    expect(engine.phase).toBe('waiting');
    expect(engine.expected).toEqual([{ midi: 60, hand: 'right' }]);
    press(60);
    transport.advanceBy(1.9); // a song second takes two transport seconds
    expect(engine.phase).toBe('running');
    transport.advanceBy(0.2);
    expect(engine.phase).toBe('waiting');
  });
});

describe('training: carrying on from the learner note (catch-up)', () => {
  const duet = () => [note(1, 3, 48, 'left'), note(1, 2, 60), note(2, 3, 62)];

  it('makes up the transport lookahead, so the other hand sounds with your note', () => {
    const { transport, piano, engine, press } = setup(duet(), { settings: training(), lookahead: 0.1 });
    engine.play(); // starting takes the lookahead: song 0 is at audio 100.1
    transport.advanceTo(5);
    expect(transport.audioTime).toBeCloseTo(101.099);
    transport.wait(0.5);
    press(60); // at 101.599
    // The transport restarts 0.1 s later, 0.1 s further on, so nothing is lost...
    expect(transport.seconds).toBeCloseTo(1 - HOLD_LEAD + 0.1);
    // ...and the left hand's C3, which fell in the skipped stretch, sounds with the key.
    expect(ons(piano)).toEqual([[48, 101.6]]);
    transport.advanceBy(0.5);
    expect(ons(piano)).toHaveLength(1); // not sounded twice
    // The next step is exactly one song second after your note.
    transport.advanceBy(5);
    expect(engine.phase).toBe('waiting');
    expect(transport.audioTime).toBeCloseTo(102.599);
  });

  it('skips no further than the next hold', () => {
    // Two steps 50 ms apart: the second hold is inside the lookahead.
    const close = [note(1, 2, 60), note(1.05, 2, 62)];
    const { transport, engine, press } = setup(close, { settings: training(), lookahead: 0.1 });
    engine.play();
    transport.advanceTo(5);
    press(60);
    expect(transport.seconds).toBeCloseTo(1.05 - HOLD_LEAD);
    transport.advanceBy(0.01);
    expect(engine.phase).toBe('waiting');
    expect(engine.expected).toEqual([{ midi: 62, hand: 'right' }]);
  });

  it('never skips more than 0.3 s, however stale the key time', () => {
    const { transport, engine, midi } = setup(duet(), { settings: training(), lookahead: 0.1 });
    engine.play();
    transport.advanceTo(5);
    transport.wait(5);
    midi.emitNoteOn(60, { time: transport.audioTime - 0.9 });
    expect(transport.seconds).toBeCloseTo(1 - HOLD_LEAD + 0.3);
  });

  it('skips nothing when the transport has no lookahead', () => {
    const { transport, engine, press } = setup(duet(), { settings: training() });
    engine.play();
    transport.advanceTo(5);
    transport.wait(1);
    press(60);
    expect(transport.seconds).toBeCloseTo(1 - HOLD_LEAD);
    expect(engine.phase).toBe('running');
  });

  it('sounds a skipped metronome click at its own time', () => {
    const { transport, metronome, engine, press } = setup(duet(), {
      settings: training({ metronome: true }),
      lookahead: 0.1,
    });
    engine.play();
    transport.advanceTo(5);
    const before = metronome.calls.length; // beats 0 and 0.5
    expect(before).toBe(2);
    transport.wait(1);
    press(60); // at 102.099; the beat at song 1.0 is 1 ms after the hold
    expect(metronome.calls).toHaveLength(3);
    expect(round(metronome.calls[2]?.time)).toBe(102.1);
  });
});

describe('loop', () => {
  const scale = () => [note(0, 1, 60), note(1, 2, 62), note(2, 3, 64), note(3, 4, 65)];

  it('repeats a range seamlessly, pass after pass', () => {
    const { transport, piano, engine } = setup(scale(), { settings: { loop: { start: 1, end: 3 } } });
    expect(engine.seconds).toBe(1); // starts at the loop
    engine.play();
    transport.advanceTo(4.5);
    expect(ons(piano)).toEqual([
      [62, 100],
      [64, 101],
      [62, 102],
      [64, 103],
      [62, 104],
    ]);
    expect(engine.seconds).toBe(1.5);
    expect(engine.loopPasses).toBe(2);
    expect(engine.state).toBe('playing'); // a loop never ends
    engine.stop();
    expect(engine.seconds).toBe(1);
  });

  it('wraps across a held note: cut at the end, struck again at the start', () => {
    // C3 sounds from before the loop to after it.
    const { transport, piano, engine } = setup([note(0.5, 3.5, 48, 'left'), ...scale()], {
      settings: { loop: { start: 1, end: 3 } },
    });
    engine.play();
    transport.advanceTo(2.5);
    const c3 = piano.calls.filter((c) => c.type !== 'releaseAll' && c.midi === 48);
    expect(c3).toEqual([
      { type: 'on', midi: 48, velocity: 80, time: 100 },
      { type: 'off', midi: 48, time: 102 }, // the wrap
      { type: 'on', midi: 48, velocity: 80, time: 102 },
    ]);
    expect(piano.sounding.has(48)).toBe(true);
    engine.stop();
    expect(piano.sounding.size).toBe(0);
  });

  it('scales with the speed', () => {
    const { transport, piano, engine } = setup(scale(), { settings: { loop: { start: 1, end: 3 }, speed: 0.5 } });
    engine.play();
    transport.advanceTo(5);
    expect(ons(piano)).toEqual([
      [62, 100],
      [64, 102],
      [62, 104],
    ]);
  });

  it('keeps seeks and the position inside the loop', () => {
    const { engine, transport } = setup(scale(), { settings: { loop: { start: 1, end: 3 } } });
    engine.seek(0);
    expect(engine.seconds).toBe(1);
    engine.seek(9);
    expect(engine.seconds).toBeCloseTo(2.99);
    engine.configure({ loop: null });
    expect(engine.seconds).toBeCloseTo(2.99);
    engine.play();
    transport.advanceBy(0.5);
    engine.configure({ loop: { start: 0, end: 2 } }); // now outside the loop: back inside
    expect(engine.seconds).toBeCloseTo(1.99);
    expect(engine.state).toBe('playing');
  });

  it('treats a range too short to loop as no loop', () => {
    const { engine } = setup(scale());
    engine.configure({ loop: { start: 2, end: 2.1 } });
    expect(engine.settings.loop).toBeNull();
    engine.configure({ loop: { start: -4, end: 2 } });
    expect(engine.settings.loop).toEqual({ start: 0, end: 2 });
  });

  it('in training, holds on each step of every pass', () => {
    const { transport, engine, press, steps } = setup(scale(), {
      settings: training({ loop: { start: 1, end: 3 } }),
    });
    expect(engine.stepCount).toBe(2);
    engine.play();
    const played: number[] = [];
    for (let i = 0; i < 6; i++) {
      transport.advanceBy(5);
      expect(engine.phase).toBe('waiting');
      const key = engine.expected[0]?.midi ?? -1;
      played.push(key);
      press(key);
    }
    expect(played).toEqual([62, 64, 62, 64, 62, 64]);
    expect(steps.every((s) => s.held)).toBe(true);
    expect(engine.loopPasses).toBe(2);
    expect(engine.stepsDone).toBe(6);
  });

  it('shows the first step as next once the last step of the pass is played', () => {
    const { transport, engine, press } = setup(scale(), { settings: training({ loop: { start: 1, end: 3 } }) });
    engine.play();
    transport.advanceBy(5);
    expect(engine.keys[64]).toBe(KEY_NEXT_RIGHT);
    press(62);
    transport.advanceBy(5);
    expect(engine.keys[62]).toBe(KEY_NEXT_RIGHT); // wraps
    press(64);
    expect(engine.expected).toEqual([{ midi: 62, hand: 'right' }]);
    expect(engine.stepNumber).toBe(1);
  });

  it('counts a key played just before the wrap for the first step of the next pass', () => {
    const { transport, engine, press, steps } = setup(scale(), {
      settings: training({ loop: { start: 1, end: 3 } }),
    });
    engine.play();
    transport.advanceBy(5);
    press(62);
    transport.advanceBy(5);
    press(64); // at loop time 2; the wrap is one second on
    transport.advanceBy(0.9);
    press(62); // 0.1 s before the wrap
    transport.advanceBy(0.5);
    expect(transport.state).toBe('started');
    expect(steps.at(-1)).toMatchObject({ held: false });
    expect(steps.at(-1)?.step.pitches).toEqual([62]);
  });

  it('loops a single step', () => {
    const { transport, engine, press } = setup(scale(), { settings: training({ loop: { start: 1, end: 2 } }) });
    engine.play();
    for (let i = 0; i < 3; i++) {
      transport.advanceBy(5);
      expect(engine.expected).toEqual([{ midi: 62, hand: 'right' }]);
      press(62);
    }
    expect(engine.stepsDone).toBe(3);
  });
});

describe('metronome and count-in', () => {
  const clicks = (m: FakeInstrument) =>
    m.calls.flatMap((c) => (c.type === 'on' ? [[c.midi, round(c.time)] as [number, number | undefined]] : []));
  const ACCENT = 91;
  const BEAT = 84;

  it('is silent unless switched on', () => {
    const { transport, metronome, engine } = setup([note(0, 1, 60)]);
    engine.play();
    transport.advanceTo(3);
    expect(metronome.calls).toEqual([]);
  });

  it('clicks on each beat, accenting the first of the bar', () => {
    const { transport, metronome, engine } = setup([note(0, 1, 60)], {
      settings: { metronome: true },
      durationSec: 3,
    });
    engine.play();
    transport.advanceTo(2.6);
    expect(clicks(metronome)).toEqual([
      [ACCENT, 100],
      [BEAT, 100.5],
      [BEAT, 101],
      [BEAT, 101.5],
      [ACCENT, 102],
      [BEAT, 102.5],
    ]);
  });

  it('follows the song speed', () => {
    const { transport, metronome, engine } = setup([note(0, 1, 60)], { settings: { metronome: true, speed: 0.5 } });
    engine.play();
    transport.advanceTo(2.5);
    expect(clicks(metronome).map(([, time]) => time)).toEqual([100, 101, 102]);
  });

  it('accents by the time signature', () => {
    const { transport, metronome, engine } = setup([], {
      settings: { metronome: true },
      beatsPerBar: 3,
      durationSec: 4,
    });
    engine.play();
    transport.advanceTo(3.2);
    expect(clicks(metronome).map(([midi]) => midi)).toEqual([ACCENT, BEAT, BEAT, ACCENT, BEAT, BEAT, ACCENT]);
  });

  it('can be switched on and off while playing, without re-laying the song out', () => {
    const { transport, metronome, piano, engine } = setup([note(0, 5, 60)], { durationSec: 6 });
    engine.play();
    transport.advanceTo(1.2);
    engine.configure({ metronome: true });
    transport.advanceTo(2.2);
    engine.configure({ metronome: false });
    transport.advanceTo(4);
    expect(clicks(metronome).map(([, time]) => time)).toEqual([101.5, 102]);
    expect(ons(piano)).toHaveLength(1); // the long note was never restarted
  });

  it('counts in one bar before playing, then the song starts on time', () => {
    const { transport, metronome, piano, engine } = setup([note(0, 1, 60)], { settings: { countIn: true } });
    engine.play();
    expect(engine.phase).toBe('count-in');
    transport.advanceTo(1.9);
    expect(engine.phase).toBe('count-in');
    expect(engine.seconds).toBe(0);
    expect(ons(piano)).toEqual([]);
    transport.advanceTo(2.5);
    expect(engine.phase).toBe('running');
    expect(engine.seconds).toBe(0.5);
    // Four clicks even though the metronome itself is off.
    expect(clicks(metronome)).toEqual([
      [ACCENT, 100],
      [BEAT, 100.5],
      [BEAT, 101],
      [BEAT, 101.5],
    ]);
    expect(ons(piano)).toEqual([[60, 102]]);
  });

  it('counts in at the song speed, and from the tempo where playback starts', () => {
    const { transport, metronome, piano, engine } = setup([note(4, 5, 60)], {
      settings: { countIn: true, speed: 0.5 },
      beats: [0, 1, 2, 3, 4, 4.25, 4.5, 4.75], // the song doubles its tempo at 4
    });
    engine.seek(4);
    engine.play();
    transport.advanceTo(3);
    // A bar of quarter-second beats at half speed: a click every half second.
    expect(clicks(metronome).map(([, time]) => time)).toEqual([100, 100.5, 101, 101.5]);
    expect(ons(piano)).toEqual([[60, 102]]);
  });

  it('uses the BPM for a count-in when the song has no beats', () => {
    const { transport, metronome, engine } = setup([note(0, 1, 60)], {
      settings: { countIn: true, metronome: true },
      beats: [],
      bpm: 60,
      durationSec: 3,
    });
    engine.play();
    transport.advanceTo(6);
    expect(clicks(metronome).map(([, time]) => time)).toEqual([100, 101, 102, 103]); // then no beats to click
  });

  it('counts in before every loop pass', () => {
    const { transport, metronome, piano, engine } = setup([note(0, 1, 60)], {
      settings: { countIn: true, loop: { start: 0, end: 2 } },
    });
    engine.play();
    transport.advanceTo(8.2);
    // Each pass is a 2 s count-in and 2 s of song.
    expect(ons(piano)).toEqual([
      [60, 102],
      [60, 106],
    ]);
    expect(clicks(metronome).map(([, time]) => time)).toEqual([100, 100.5, 101, 101.5, 104, 104.5, 105, 105.5, 108]);
    expect(engine.seconds).toBe(0); // counting in again
    expect(engine.phase).toBe('count-in');
  });

  it('counts in again when playback resumes after a pause, but not after a seek while playing', () => {
    const { transport, metronome, engine } = setup([note(0, 9, 60)], { settings: { countIn: true } });
    engine.play();
    transport.advanceTo(3);
    engine.seek(5);
    expect(engine.phase).toBe('running');
    transport.advanceBy(1);
    expect(clicks(metronome)).toHaveLength(4);
    engine.pause();
    engine.play();
    expect(engine.phase).toBe('count-in');
    transport.advanceBy(2.1);
    expect(clicks(metronome)).toHaveLength(8);
    expect(engine.seconds).toBeCloseTo(6.1);
  });

  it('holds at a step that sits right at the end of the count-in', () => {
    const { transport, engine, press } = setup([note(0, 1, 60), note(1, 2, 62)], {
      settings: training({ countIn: true }),
    });
    engine.play();
    transport.advanceTo(5);
    expect(engine.phase).toBe('waiting');
    expect(transport.seconds).toBeCloseTo(2 - HOLD_LEAD);
    press(60);
    // Carrying on from the hold is playing, not counting in, even before the transport moves.
    expect(engine.phase).toBe('running');
    transport.advanceBy(5);
    expect(engine.expected).toEqual([{ midi: 62, hand: 'right' }]);
  });

  it('stops saying count-in once a step is played, even if the transport position lags', () => {
    // A real transport hands out events ahead of the audio clock, so its position can
    // still be inside the count-in when the learner has already played the first step.
    class LaggingTransport extends FakeTransport {
      override get seconds(): number {
        return Math.max(0, super.seconds - 0.05);
      }
    }
    const transport = new LaggingTransport();
    const midi = new FakeMidiInput();
    void midi.connect('fake-keyboard');
    const engine = new PracticeEngine({
      song: songWith([note(0, 1, 60), note(1, 2, 62)], {}),
      transport,
      piano: new FakeInstrument(),
      metronome: new FakeInstrument(),
      clock: transport.clock,
      midi,
      settings: training({ countIn: true }),
    });
    engine.play();
    transport.advanceTo(1);
    expect(engine.phase).toBe('count-in');
    transport.advanceTo(3);
    expect(engine.phase).toBe('waiting');
    midi.emitNoteOn(60, { time: transport.audioTime });
    expect(engine.phase).toBe('running');
    transport.advanceBy(0.01);
    expect(engine.phase).toBe('running');
  });

  it('is counting in right up to the hold, in every loop pass', () => {
    const { transport, engine, press } = setup([note(0, 1, 60)], {
      settings: training({ countIn: true, loop: { start: 0, end: 2 } }),
      durationSec: 4,
    });
    engine.play();
    for (let pass = 0; pass < 3; pass++) {
      transport.advanceBy(1.9);
      expect(engine.phase).toBe('count-in');
      transport.advanceBy(0.5);
      expect(engine.phase).toBe('waiting');
      press(60);
      expect(engine.phase).toBe('running');
      transport.advanceBy(2.01); // the rest of the pass, and just into the next
    }
    expect(engine.loopPasses).toBe(3);
  });
});

describe('training runs of the example songs', () => {
  /** Play a whole song in training mode: at every hold, one wrong note, then the right ones. */
  function run(json: unknown, hands: PracticeSettings['hands']) {
    const song = parseSong(json);
    const s = setup([], { song, settings: training({ hands }) });
    const { engine, transport, midi } = s;
    const expectedSteps = engine.stepCount;
    let holds = 0;
    engine.play();
    for (let guard = 0; guard < 2000 && engine.state === 'playing'; guard++) {
      transport.advanceBy(0.2);
      if (engine.phase !== 'waiting') continue;
      holds++;
      const want = engine.expected.map((k) => k.midi);
      const wrong = [0, 1, 2, 3].map((n) => 100 + n).find((k) => !want.includes(k)) ?? 127;
      midi.emitNoteOn(wrong, { time: transport.audioTime });
      midi.emitNoteOff(wrong, { time: transport.audioTime });
      expect(engine.phase).toBe('waiting'); // a wrong note never moves it on
      transport.wait(0.4);
      for (const key of want) midi.emitNoteOn(key, { time: transport.audioTime });
      expect(engine.phase).not.toBe('waiting');
      for (const key of want) midi.emitNoteOff(key, { time: transport.audioTime });
    }
    return { ...s, song, holds, expectedSteps };
  }

  it.each([
    ['Twinkle', twinkle, 'right'],
    ['Twinkle', twinkle, 'left'],
    ['Twinkle', twinkle, 'both'],
    ['Frère Jacques', frere, 'right'],
    ['Frère Jacques', frere, 'both'],
  ] as const)('%s, %s hand: every step holds, resumes on the right notes, ignores wrong ones', (_n, json, hands) => {
    const { engine, steps, holds, expectedSteps, piano, song, states } = run(json, hands);
    expect(expectedSteps).toBeGreaterThan(0);
    expect(states).toEqual(['playing', 'stopped']); // ran to the end
    expect(holds).toBe(expectedSteps);
    expect(steps).toHaveLength(expectedSteps);
    expect(steps.every((s) => s.held && s.wrong === 1)).toBe(true);
    expect(engine.wrongNotes).toBe(expectedSteps);
    expect(engine.firstTime).toBe(0);
    // Isai played exactly the other hand's notes, each once.
    const other = hands === 'both' ? [] : song.notes.filter((n) => n.hand !== hands);
    expect(
      ons(piano)
        .map(([midi]) => midi)
        .sort(),
    ).toEqual(other.map((n) => n.midi).sort());
    expect(piano.sounding.size).toBe(0);
  });

  it('Frère Jacques has nothing for the left hand: it just plays through', () => {
    const { holds, expectedSteps, states, piano, song } = run(frere, 'left');
    expect(expectedSteps).toBe(0);
    expect(holds).toBe(0);
    expect(states).toEqual(['playing', 'stopped']);
    expect(ons(piano)).toHaveLength(song.notes.length);
  });
});
