// The practice engine (ADR 0005): plays a Song on the transport at a chosen speed, with an
// optional loop, count-in and metronome, and, in training mode, holds at each step until
// the learner has played it. One engine, a policy per mode. Plain TypeScript: no React, no
// DOM, no timers. Everything is scheduled on the transport (rule 6), and what the piano
// needs each frame is kept in typed arrays (rule 5).
//
// The timeline. Song time and transport time differ by the speed: transport = song / speed.
// Every start, seek or speed change re-anchors the song at transport time 0. A loop is not
// a jump: its passes follow one another on the transport, each with an optional count-in
// in front. Only the next couple of seconds are scheduled; a refill event schedules more.

import type { Instrument, Transport } from '../../audio/types';
import type { AudioClock } from '../../midi/AudioClock';
import type { MidiInput, MidiNoteEvent, Unsubscribe } from '../../midi/MidiInput';
import type { Song } from '../../song';
import { buildNoteIndex, type Hand, type NoteIndex } from '../activeNotes';
import { barsOfSong, beatPeriodAt, type Bars } from './bars';
import { clampOffset, effectiveTime } from './latency';
import { StepMatcher, type OctaveMatch } from './matcher';
import { Scorer, type PerformanceResult } from './scorer';
import { buildSteps, firstStepAt, practises, type HandChoice, type PitchRange, type Step } from './steps';
import {
  FLASH_CORRECT,
  FLASH_SECONDS,
  FLASH_WRONG,
  KEY_EXPECT_LEFT,
  KEY_EXPECT_RIGHT,
  KEY_NEXT_LEFT,
  KEY_NEXT_RIGHT,
  type PracticeView,
} from './view';

export type PracticeMode = 'listen' | 'training' | 'performance';

/** What makes one mode different from another. */
export interface PracticePolicy {
  /** Playback pauses at each step until the learner has played it. */
  readonly holds: boolean;
  /** Steps are followed and the learner's notes are matched against them. */
  readonly tracks: boolean;
  /** Isai sounds the practised hand's notes too (so the learner just listens). */
  readonly soundsPractised: boolean;
  /**
   * A straight run that is scored (ADR 0006): it always starts from the top with a
   * count-in, can't be paused or moved, and ends with a result.
   */
  readonly scores: boolean;
}

export const POLICIES: Readonly<Record<PracticeMode, PracticePolicy>> = {
  listen: { holds: false, tracks: false, soundsPractised: true, scores: false },
  training: { holds: true, tracks: true, soundsPractised: false, scores: false },
  performance: { holds: false, tracks: true, soundsPractised: false, scores: true },
};

export interface PracticeSettings {
  mode: PracticeMode;
  /** The hand(s) the learner plays. */
  hands: HandChoice;
  /** What Isai does with the hand the learner isn't playing. */
  otherHand: 'play' | 'mute';
  /** Speed as a rate: 1 is the song's own tempo. */
  speed: number;
  /** Song seconds to repeat, or null to play through. */
  loop: { start: number; end: number } | null;
  metronome: boolean;
  /** One bar of clicks before playing, and before each loop pass. */
  countIn: boolean;
  octave: OctaveMatch;
  /** The learner's keyboard; notes outside it are not expected. */
  playable: PitchRange | null;
  /** Calibrated lag of the learner's keyboard and speakers, in seconds (performance only). */
  latencyOffset: number;
}

export const DEFAULT_SETTINGS: PracticeSettings = {
  mode: 'listen',
  hands: 'both',
  otherHand: 'play',
  speed: 1,
  loop: null,
  metronome: false,
  countIn: false,
  octave: 'exact',
  playable: null,
  latencyOffset: 0,
};

export const MIN_SPEED = 0.4;
export const MAX_SPEED = 1.2;
export const SPEED_STEP = 0.05;

/** Play / pause / stop, as the transport buttons see it. Changes only on those. */
export type PracticeState = 'stopped' | 'playing' | 'paused';
/** What "playing" is doing right now. Changes per step, so it is read, never subscribed to. */
export type PracticePhase = 'idle' | 'count-in' | 'running' | 'waiting';

export interface ExpectedKey {
  midi: number;
  hand: Hand;
}

/** A step the learner completed. P6's scorer listens to these. */
export interface StepEvent {
  step: Step;
  /** Wrong notes played while this step was next. */
  wrong: number;
  /** Audio-clock time the last expected key arrived. */
  time: number;
  /** Whether playback had to wait for it. */
  held: boolean;
}

export interface PracticeEngineOptions {
  song: Song;
  transport: Transport;
  piano: Instrument;
  metronome: Instrument;
  clock: AudioClock;
  midi?: MidiInput | null;
  settings?: Partial<PracticeSettings>;
}

/** A hold sits this far before its step, in transport seconds. */
export const HOLD_LEAD = 0.001;
/** How far ahead events are put on the transport, and how early the next lot is added. */
const WINDOW = 2;
const REFILL_MARGIN = 1;
/** The most transport time a resume may skip to catch up with the learner's note. */
const MAX_CATCH_UP = 0.3;
/** Seeks stop this short of the end, so the end-of-song event always fires. */
const END_MARGIN = 0.01;
/** A loop shorter than this is not a loop. */
const MIN_LOOP = 0.2;
const CLICK_ACCENT = { midi: 91, velocity: 112 };
const CLICK_BEAT = { midi: 84, velocity: 84 };
const EPSILON = 1e-9;

type EventKind = 'boundary' | 'off' | 'hold' | 'cue' | 'on' | 'click' | 'end' | 'refill';

/** Order of events due at the same transport time. */
const ORDER: Record<EventKind, number> = { boundary: 0, off: 1, hold: 2, cue: 3, on: 4, click: 5, end: 6, refill: 7 };
/** Events a catch-up must not skip over: each changes what happens next. */
const BARRIER: Record<EventKind, boolean> = {
  boundary: true,
  hold: true,
  end: true,
  off: false,
  cue: false,
  on: false,
  click: false,
  refill: false,
};

interface TimelineEvent {
  /** Transport seconds. */
  at: number;
  kind: EventKind;
  /** on/off: note index. hold/cue: step index. click: 1 if accented. refill: the next limit. */
  a: number;
  /** click: 1 if it belongs to a count-in (sounds even with the metronome off). */
  b: number;
  pass: Pass | null;
  /** Ran, or was cancelled. Either way it must not run again. */
  done: boolean;
  /** Transport id while scheduled. */
  id: number;
}

/** One run through the song or the loop, laid out on the transport. */
interface Pass {
  id: number;
  /** Transport time the pass begins, count-in included. */
  from: number;
  /** Length of the count-in, in transport seconds. */
  lead: number;
  /** Song range it plays. */
  songStart: number;
  songEnd: number;
  /** Transport time of `songEnd`. */
  to: number;
  events: TimelineEvent[];
  /** Index of the first event not yet on the transport. */
  next: number;
}

interface Hold {
  /** Transport time the transport is paused at. */
  at: number;
  /** Audio-clock time the pause took effect. */
  audioTime: number;
}

function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(speed * 100) / 100));
}

function sameLoop(a: PracticeSettings['loop'], b: PracticeSettings['loop']): boolean {
  return a === b || (a !== null && b !== null && a.start === b.start && a.end === b.end);
}

function sameRange(a: PitchRange | null, b: PitchRange | null): boolean {
  return a === b || (a !== null && b !== null && a.low === b.low && a.high === b.high);
}

export class PracticeEngine implements PracticeView {
  readonly duration: number;
  /** The song's notes sorted by start, for the keyboard. */
  readonly index: NoteIndex;
  readonly bars: Bars;

  private readonly song: Song;
  private readonly transport: Transport;
  private readonly piano: Instrument;
  private readonly metronome: Instrument;
  private readonly clock: AudioClock;
  private readonly beats: number[];
  private readonly accents: boolean[];
  private readonly matcher = new StepMatcher();
  private readonly scorer = new Scorer();
  /** Transport time the song began in the run being scored (after its count-in). */
  private runStart = 0;

  private current: PracticeState = 'stopped';
  private options: PracticeSettings;
  private steps: Step[] = [];
  /** Index of the next step to play in this pass; `steps.length` once the pass is played. */
  private cursor = 0;
  /** The step the matcher is listening for. In a loop, the first step again after the last. */
  private target: Step | null = null;
  /** Song position while not playing. */
  private position = 0;
  /** The speed the current timeline was laid out at. */
  private rate = 1;
  private passes: Pass[] = [];
  private passCount = 0;
  /** Id of the latest pass whose song (not its count-in) the engine has started on. */
  private begun = -1;
  /** Events on the transport now, done or not. */
  private scheduled: TimelineEvent[] = [];
  private hold: Hold | null = null;
  /** Whether we have asked the transport to run. */
  private running = false;
  /** Audio time the current timeline takes effect; before it the transport reads stale. */
  private anchoredAt = 0;

  /** Notes sounding per key, so one note's end doesn't cut another on the same key. */
  private readonly sounding = new Uint16Array(128);
  /** 1 for each note (by index) that Isai is sounding now. */
  private readonly active: Uint8Array;

  // PracticeView
  revision = 0;
  readonly keys = new Uint8Array(128);
  readonly flashKind = new Uint8Array(128);
  readonly flashUntil = new Float64Array(128);
  private pending: ExpectedKey[] = [];

  private done = 0;
  private clean = 0;
  private wrong = 0;
  private wraps = 0;

  private readonly stateListeners = new Set<(state: PracticeState) => void>();
  private readonly stepListeners = new Set<(event: StepEvent) => void>();
  private readonly resultListeners = new Set<(result: PerformanceResult) => void>();
  private detachMidi: Unsubscribe | null = null;

  constructor(options: PracticeEngineOptions) {
    this.song = options.song;
    this.transport = options.transport;
    this.piano = options.piano;
    this.metronome = options.metronome;
    this.clock = options.clock;
    this.duration = options.song.durationSec;
    this.index = buildNoteIndex(options.song.notes);
    this.active = new Uint8Array(this.index.notes.length);
    this.bars = barsOfSong(options.song);
    this.beats = [...options.song.tempo.beats].sort((a, b) => a - b);
    const perBar = Math.max(1, options.song.timeSignature.num);
    const starts = this.bars.unit === 'bar' ? this.bars.bars.map((bar) => bar.start) : [];
    const hasDownbeats = 'downbeats' in options.song.tempo;
    this.accents = this.beats.map((beat, i) =>
      hasDownbeats ? starts.some((start) => Math.abs(start - beat) < 1e-6) : i % perBar === 0,
    );
    this.options = this.sanitize({ ...DEFAULT_SETTINGS, ...options.settings });
    this.matcher.setOctave(this.options.octave);
    this.steps = this.buildSteps();
    this.position = this.startPosition();
    this.moveCursor(firstStepAt(this.steps, this.position));
    this.attachMidi(options.midi ?? null);
  }

  // ------------------------------------------------------------------ reading

  get state(): PracticeState {
    return this.current;
  }

  get settings(): Readonly<PracticeSettings> {
    return this.options;
  }

  /** Song position in seconds; read it every frame, it is not React state. */
  get seconds(): number {
    if (this.current !== 'playing' || this.clock.now() < this.anchoredAt) return this.position;
    return this.songTimeAt(this.transport.seconds);
  }

  get phase(): PracticePhase {
    if (this.current !== 'playing') return 'idle';
    if (this.hold) return 'waiting';
    // The transport's position runs behind the engine by its lookahead, and a hold on the
    // first beat sits just inside the count-in. Once the engine has performed something of
    // the pass's song (a hold, a note), the count-in is over whatever the position says.
    const pass = this.passAt(this.transport.seconds);
    if (!pass || pass.id === this.begun) return 'running';
    return this.transport.seconds < pass.from + pass.lead - EPSILON ? 'count-in' : 'running';
  }

  /** The keys still needed for the step to play now (empty when nothing is tracked). */
  get expected(): readonly ExpectedKey[] {
    return this.pending;
  }

  /** 1-based number of the step to play now; `stepCount` once the last one is played. */
  get stepNumber(): number {
    return this.target ? this.target.index + 1 : this.steps.length;
  }

  get stepCount(): number {
    return this.steps.length;
  }

  /** Steps played since Play was pressed from a stop. */
  get stepsDone(): number {
    return this.done;
  }

  /** Of those, the ones played with no wrong note first. */
  get firstTime(): number {
    return this.clean;
  }

  get wrongNotes(): number {
    return this.policy.scores ? this.scorer.wrong : this.wrong;
  }

  /** Notes hit so far in a performance run. */
  get notesHit(): number {
    return this.scorer.hits;
  }

  /** How many times the loop has wrapped since Play was pressed from a stop. */
  get loopPasses(): number {
    return this.wraps;
  }

  get dimHand(): Hand | null {
    if (!this.policy.tracks || this.options.hands === 'both') return null;
    return this.options.hands === 'right' ? 'left' : 'right';
  }

  now(): number {
    return this.clock.now();
  }

  // ---------------------------------------------------------------- controlling

  play(): void {
    if (this.current === 'playing') return;
    const scores = this.policy.scores;
    // A scored run always starts from the top, whatever the position was.
    if (this.current === 'stopped' || scores) {
      this.position = this.startPosition();
      this.done = this.clean = this.wrong = this.wraps = 0;
    }
    if (scores) this.scorer.reset();
    this.layOut(this.position, this.options.countIn || scores);
    this.runStart = this.passes[0]?.lead ?? 0;
    this.run();
    this.setState('playing');
  }

  /** In a scored run there is no pause: asking for one ends the run. */
  pause(): void {
    if (this.current !== 'playing') return;
    if (this.policy.scores) {
      this.finish();
      return;
    }
    this.position = this.clampPosition(this.seconds);
    this.halt('pause');
    this.moveCursor(firstStepAt(this.steps, this.position));
    this.setState('paused');
  }

  /** Stop and go back to the start (of the loop, if there is one). */
  stop(): void {
    this.halt('stop');
    this.position = this.startPosition();
    this.moveCursor(firstStepAt(this.steps, this.position));
    this.setState('stopped');
  }

  /** Move to a song position (kept inside the song or the loop); keeps playing if playing. */
  seek(seconds: number): void {
    const target = this.clampPosition(seconds);
    if (this.current === 'playing') {
      if (this.policy.scores) return; // a scored run can't be moved

      this.layOut(target, false);
      this.run();
      return;
    }
    this.position = target;
    this.moveCursor(firstStepAt(this.steps, target));
    if (this.current === 'stopped') this.setState('paused');
  }

  /** Change settings. Takes effect at once, also while playing. */
  configure(patch: Partial<PracticeSettings>): void {
    const before = this.options;
    const next = this.sanitize({ ...before, ...patch });
    const stepsChanged =
      next.mode !== before.mode ||
      next.hands !== before.hands ||
      next.octave !== before.octave ||
      !sameLoop(next.loop, before.loop) ||
      !sameRange(next.playable, before.playable);
    // A scored run is one take: changing what is played, or how fast, abandons it.
    if (this.current === 'playing' && this.policy.scores && (stepsChanged || next.speed !== before.speed)) {
      this.stop();
    }
    this.options = next;
    this.matcher.setOctave(next.octave);
    if (stepsChanged) this.steps = this.buildSteps();
    // The other hand, the metronome and the count-in are read when their events fire.
    if (!stepsChanged && next.speed === before.speed) {
      this.refreshView();
      return;
    }
    if (this.current === 'playing') {
      this.layOut(this.clampPosition(this.seconds), false);
      this.run();
      return;
    }
    this.position = this.current === 'stopped' ? this.startPosition() : this.clampPosition(this.position);
    this.moveCursor(firstStepAt(this.steps, this.position));
  }

  /** Called on play / pause / stop transitions only, never per note or per step. */
  onStateChange(listener: (state: PracticeState) => void): Unsubscribe {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /**
   * End a scored run now and report on what was played so far. Nothing happens in the
   * other modes.
   */
  finish(): void {
    if (this.current !== 'playing' || !this.policy.scores) return;
    const result = this.conclude(this.clock.now() < this.anchoredAt ? 0 : this.transport.seconds);
    this.stop();
    for (const listener of [...this.resultListeners]) listener(result);
  }

  /** Called once when a scored run ends, by itself or through `finish`. */
  onResult(listener: (result: PerformanceResult) => void): Unsubscribe {
    this.resultListeners.add(listener);
    return () => {
      this.resultListeners.delete(listener);
    };
  }

  /** Called when the learner completes a step. Not for React state (rule 5). */
  onStep(listener: (event: StepEvent) => void): Unsubscribe {
    this.stepListeners.add(listener);
    return () => {
      this.stepListeners.delete(listener);
    };
  }

  /** Listen to the learner's keyboard (or to none). Replaces any previous input. */
  attachMidi(midi: MidiInput | null): void {
    this.detachMidi?.();
    this.detachMidi = null;
    this.matcher.releaseKeys();
    if (!midi) return;
    const offOn = midi.onNoteOn(this.onNoteOn);
    const offOff = midi.onNoteOff(this.onNoteOff);
    this.detachMidi = () => {
      offOn();
      offOff();
    };
  }

  /** Clear everything this engine scheduled and stop listening. */
  dispose(): void {
    this.halt('stop');
    this.attachMidi(null);
    this.stateListeners.clear();
    this.stepListeners.clear();
    this.resultListeners.clear();
  }

  // ------------------------------------------------------------------- settings

  private get policy(): PracticePolicy {
    return POLICIES[this.options.mode];
  }

  private sanitize(settings: PracticeSettings): PracticeSettings {
    let loop = settings.loop;
    if (loop) {
      const start = Math.max(0, loop.start);
      loop = loop.end - start >= MIN_LOOP ? { start, end: loop.end } : null;
    }
    return { ...settings, speed: clampSpeed(settings.speed), loop, latencyOffset: clampOffset(settings.latencyOffset) };
  }

  /** Add up the scored run, which ended at `endTime` on the transport. */
  private conclude(endTime: number): PerformanceResult {
    return this.scorer.result({
      startTime: this.runStart,
      endTime,
      sections: this.song.sections ?? [],
      bars: this.bars.bars,
      barWord: this.bars.unit === 'bar' ? 'Bar' : 'Part',
    });
  }

  private buildSteps(): Step[] {
    if (!this.policy.tracks) return [];
    const { hands, loop, octave, playable } = this.options;
    // In any-octave matching every note has a key somewhere on the keyboard.
    return buildSteps(this.index.notes, { hands, range: loop, playable: octave === 'any' ? null : playable });
  }

  private startPosition(): number {
    return this.options.loop?.start ?? 0;
  }

  private clampPosition(seconds: number): number {
    const loop = this.options.loop;
    const low = loop?.start ?? 0;
    const high = Math.max(low, (loop?.end ?? this.duration) - END_MARGIN);
    return Math.min(Math.max(Number.isFinite(seconds) ? seconds : low, low), high);
  }

  /** Does Isai sound a note of this hand? */
  private sounds(hand: Hand): boolean {
    if (this.policy.soundsPractised) return true;
    if (practises(this.options.hands, hand)) return false;
    return this.options.otherHand === 'play';
  }

  // ------------------------------------------------------------------- timeline

  private passAt(transportTime: number): Pass | undefined {
    let found = this.passes[0];
    for (const pass of this.passes) {
      if (pass.from <= transportTime) found = pass;
      else break;
    }
    return found;
  }

  private songTimeAt(transportTime: number): number {
    const pass = this.passAt(transportTime);
    if (!pass) return this.position;
    const song = pass.songStart + (transportTime - pass.from - pass.lead) * this.rate;
    return Math.min(pass.songEnd, Math.max(pass.songStart, song));
  }

  /** Throw away the current timeline and lay the song out again from `songPosition`. */
  private layOut(songPosition: number, countIn: boolean): void {
    this.cancelAll();
    this.silence();
    this.hold = null;
    this.rate = this.options.speed;
    this.transport.seek(0);
    this.anchoredAt = this.clock.now() + this.transport.lookahead;
    this.position = songPosition;
    this.passCount = 0;
    this.begun = -1;
    this.passes = [this.planPass(0, songPosition, countIn)];
    this.moveCursor(firstStepAt(this.steps, songPosition));
    this.feed(WINDOW);
  }

  /** Ask the transport to run, if it isn't already. */
  private run(): void {
    if (this.running) return;
    this.transport.start();
    this.running = true;
  }

  private halt(how: 'pause' | 'stop'): void {
    if (how === 'pause') this.transport.pause();
    else this.transport.stop();
    this.running = false;
    this.cancelAll();
    this.silence();
    this.hold = null;
  }

  /** Every event of one pass, sorted by transport time. Nothing is scheduled yet. */
  private planPass(from: number, songStart: number, countIn: boolean): Pass {
    const { loop } = this.options;
    const rate = this.rate;
    const songEnd = Math.max(songStart, loop?.end ?? this.duration);
    const perBar = Math.max(1, this.song.timeSignature.num);
    const period = beatPeriodAt(this.beats, this.song.tempo.bpm, songStart);
    const lead = countIn ? (perBar * period) / rate : 0;
    const pass: Pass = {
      id: this.passCount++,
      from,
      lead,
      songStart,
      songEnd,
      to: from + lead + (songEnd - songStart) / rate,
      events: [],
      next: 0,
    };
    const at = (song: number) => from + lead + (song - songStart) / rate;
    const add = (time: number, kind: EventKind, a = 0, b = 0) => {
      pass.events.push({ at: time, kind, a, b, pass, done: false, id: -1 });
    };

    if (pass.id > 0) add(from, 'boundary');
    if (countIn) {
      for (let beat = 0; beat < perBar; beat++) add(from + (beat * period) / rate, 'click', beat === 0 ? 1 : 0, 1);
    }

    // Notes that sound anywhere in the pass. One that began before the pass starts is
    // struck again at the start, so a seek or a loop into the middle of a note is heard.
    const { notes, maxEnd } = this.index;
    let first = 0;
    while (first < notes.length && (maxEnd[first] ?? -Infinity) <= songStart) first++;
    for (let i = first; i < notes.length; i++) {
      const note = notes[i];
      if (!note || note.start >= songEnd) break;
      if (note.end <= songStart || note.velocity === 0) continue;
      add(at(Math.max(note.start, songStart)), 'on', i);
      // In a loop, a note still sounding at the end is cut by the next pass's boundary.
      if (!loop || note.end < songEnd) add(at(Math.min(note.end, songEnd)), 'off', i);
    }

    this.beats.forEach((beat, i) => {
      if (beat >= songStart - EPSILON && beat < songEnd - EPSILON) add(at(beat), 'click', this.accents[i] ? 1 : 0, 0);
    });

    if (this.policy.holds) {
      for (let k = firstStepAt(this.steps, songStart); k < this.steps.length; k++) {
        const step = this.steps[k];
        if (!step || step.start >= songEnd) break;
        add(Math.max(from, at(step.start) - HOLD_LEAD), 'hold', k);
      }
    }

    if (this.policy.scores) {
      // Every note the learner is to play, at the time it will be heard, and a cue at each
      // step that moves the lit keys on to the next one.
      for (let k = firstStepAt(this.steps, songStart); k < this.steps.length; k++) {
        const step = this.steps[k];
        if (!step || step.start >= songEnd) break;
        add(at(step.start), 'cue', k);
        step.pitches.forEach((pitch, i) => {
          const onset = step.starts[i] ?? step.start;
          this.scorer.expect({ time: at(onset), songTime: onset, pitch, hand: step.hands[i] ?? 'right' });
        });
      }
    }

    if (!loop) add(pass.to, 'end');
    pass.events.sort((x, y) => x.at - y.at || ORDER[x.kind] - ORDER[y.kind]);
    return pass;
  }

  /** Put every planned event before `limit` on the transport, planning loop passes as needed. */
  private feed(limit: number): void {
    let more = false;
    for (let p = 0; p < this.passes.length; p++) {
      const pass = this.passes[p];
      if (!pass) break;
      while (pass.next < pass.events.length) {
        const event = pass.events[pass.next];
        if (!event || event.at >= limit) break;
        pass.next++;
        this.put(event);
      }
      if (pass.next < pass.events.length) {
        more = true;
        break;
      }
      const loop = this.options.loop;
      if (p === this.passes.length - 1 && loop) {
        more = true;
        if (pass.to >= limit) break;
        this.passes.push(this.planPass(pass.to, loop.start, this.options.countIn));
      }
    }
    if (more) {
      this.put({ at: limit - REFILL_MARGIN, kind: 'refill', a: limit + WINDOW, b: 0, pass: null, done: false, id: -1 });
    }
  }

  private put(event: TimelineEvent): void {
    event.id = this.transport.schedule(event.at, (time) => this.fire(event, time));
    this.scheduled.push(event);
  }

  /** The transport reached `event`. */
  private fire(event: TimelineEvent, time: number): void {
    if (event.done) return;
    // Paused at a step: a transport that works ahead may still deliver events it had
    // already looked at. They are left for the resume, which runs what it skips.
    if (this.hold) return;
    event.done = true;
    this.perform(event, time);
  }

  private perform(event: TimelineEvent, time: number): void {
    if (event.pass && event.kind !== 'click' && event.kind !== 'boundary') this.begun = event.pass.id;
    switch (event.kind) {
      case 'on': {
        const note = this.index.notes[event.a];
        if (!note || !this.sounds(note.hand)) return;
        this.active[event.a] = 1;
        this.sounding[note.midi] = (this.sounding[note.midi] ?? 0) + 1;
        this.piano.noteOn(note.midi, note.velocity, time);
        return;
      }
      case 'off': {
        const note = this.index.notes[event.a];
        if (!note || !this.active[event.a]) return;
        this.active[event.a] = 0;
        const count = this.sounding[note.midi] ?? 0;
        this.sounding[note.midi] = Math.max(0, count - 1);
        if (count <= 1) this.piano.noteOff(note.midi, time);
        return;
      }
      case 'click': {
        if (!event.b && !this.options.metronome) return;
        const click = event.a ? CLICK_ACCENT : CLICK_BEAT;
        this.metronome.noteOn(click.midi, click.velocity, time);
        return;
      }
      case 'hold':
        this.reachStep(event, time);
        return;
      case 'cue':
        // The step's moment has come; the keys to light are the next step's.
        if (event.a >= this.cursor) this.moveCursor(event.a + 1);
        return;
      case 'boundary': {
        // A new loop pass: cut what the last one left sounding, and start its steps again.
        const pass = event.pass;
        if (!pass) return;
        this.silence(time);
        this.passes = this.passes.filter((p) => p.id >= pass.id - 1);
        this.wraps++;
        // Keep the matcher's memory: the first step has been its target since the last
        // step of the pass before, so a key pressed just before the wrap still counts.
        this.moveCursor(firstStepAt(this.steps, pass.songStart), true);
        return;
      }
      case 'end':
        // Release at the scheduled time, not "now": the transport works ahead of the sound.
        this.silence(time);
        this.transport.stop(time);
        this.running = false;
        this.cancelAll();
        this.position = this.startPosition();
        this.moveCursor(firstStepAt(this.steps, this.position));
        this.setState('stopped');
        if (this.policy.scores) {
          const result = this.conclude(event.at);
          for (const listener of [...this.resultListeners]) listener(result);
        }
        return;
      case 'refill':
        this.collect(event);
        this.feed(event.a);
        return;
    }
  }

  /** Take finished events off the transport, so they can't fire again after a re-anchor. */
  private collect(except: TimelineEvent): void {
    const keep: TimelineEvent[] = [];
    for (const event of this.scheduled) {
      if (event.done && event !== except) this.transport.clear(event.id);
      else keep.push(event);
    }
    this.scheduled = keep;
  }

  private cancelAll(): void {
    for (const event of this.scheduled) {
      event.done = true;
      this.transport.clear(event.id);
    }
    this.scheduled = [];
    this.passes = [];
  }

  /**
   * Stop the notes the engine started, at `time` (now if omitted). Not `releaseAll`: the
   * learner's own notes sound through the same piano and must ring on.
   */
  private silence(time?: number): void {
    for (let key = 0; key < this.sounding.length; key++) {
      if ((this.sounding[key] ?? 0) > 0) this.piano.noteOff(key, time);
    }
    this.sounding.fill(0);
    this.active.fill(0);
  }

  // ---------------------------------------------------------------------- steps

  /** Playback reached the hold in front of a step. */
  private reachStep(event: TimelineEvent, time: number): void {
    if (event.a < this.cursor) return; // already played
    if (event.a > this.cursor) this.moveCursor(event.a);
    for (const hit of this.matcher.arm(time)) this.flash(hit.key, FLASH_CORRECT, time);
    if (this.matcher.done) {
      // Played in time (a key held over, or pressed just before): nothing pauses.
      this.completeStep(time, false);
      return;
    }
    this.hold = { at: event.at, audioTime: time };
    this.transport.pause(time);
    this.running = false;
    this.refreshView();
  }

  private completeStep(time: number, held: boolean): void {
    const step = this.target;
    if (!step) return;
    const wrong = this.matcher.wrong;
    this.done++;
    if (wrong === 0) this.clean++;
    this.moveCursor(this.cursor + 1);
    for (const listener of [...this.stepListeners]) listener({ step, wrong, time, held });
  }

  /**
   * The step was played while playback was held. Carry on from the learner's note, not
   * from whenever the transport gets going again: skip the transport's start-up lookahead
   * and run the skipped events here, at the audio times they would have had.
   */
  private resume(playedAt: number): void {
    const hold = this.hold;
    if (!hold) return;
    this.hold = null;
    const startsAt = this.clock.now() + this.transport.lookahead;
    // A key pressed before the pause took effect is early, not late: nothing to make up.
    const anchor = Math.max(playedAt, hold.audioTime);
    const lag = Math.min(MAX_CATCH_UP, Math.max(0, startsAt - anchor));
    let to = hold.at + lag;
    for (const event of this.scheduled) {
      if (!event.done && BARRIER[event.kind] && event.at > hold.at && event.at < to) to = event.at;
    }
    const skipped = this.scheduled
      .filter((event) => !event.done && event.at >= hold.at && event.at < to)
      .sort((x, y) => x.at - y.at || ORDER[x.kind] - ORDER[y.kind]);
    for (const event of skipped) {
      event.done = true;
      this.perform(event, startsAt - (to - event.at));
    }
    this.transport.seek(to);
    this.run();
  }

  /**
   * Make step `index` the next to play. The matcher starts afresh on it, unless `keep` is
   * set and it was already listening for that step.
   */
  private moveCursor(index: number, keep = false): void {
    this.cursor = index;
    const wrapped = this.options.loop ? this.steps[0] : undefined;
    const target = this.policy.tracks ? (this.steps[index] ?? wrapped ?? null) : null;
    if (!keep || target !== this.target) {
      this.target = target;
      this.matcher.setTarget(target);
    }
    this.refreshView();
  }

  private refreshView(): void {
    this.keys.fill(0);
    this.pending = [];
    const now = this.target;
    if (now) {
      const remaining = this.matcher.remaining;
      now.pitches.forEach((pitch, i) => {
        if (!remaining.includes(pitch)) return;
        const hand = now.hands[i] ?? 'right';
        this.keys[pitch] = (this.keys[pitch] ?? 0) | (hand === 'right' ? KEY_EXPECT_RIGHT : KEY_EXPECT_LEFT);
        this.pending.push({ midi: pitch, hand });
      });
      // In a loop the step after the last one is the first one again.
      const after = this.steps[now.index + 1] ?? (this.options.loop ? this.steps[0] : undefined);
      if (after && after !== now) {
        after.pitches.forEach((pitch, i) => {
          const flag = (after.hands[i] ?? 'right') === 'right' ? KEY_NEXT_RIGHT : KEY_NEXT_LEFT;
          this.keys[pitch] = (this.keys[pitch] ?? 0) | flag;
        });
      }
    }
    this.revision++;
  }

  private flash(key: number, kind: number, time: number): void {
    if (key < 0 || key > 127) return;
    this.flashKind[key] = kind;
    this.flashUntil[key] = time + FLASH_SECONDS;
    this.revision++;
  }

  // ----------------------------------------------------------------------- MIDI

  private readonly onNoteOn = (event: MidiNoteEvent): void => {
    if (!this.policy.tracks || this.current !== 'playing') {
      this.matcher.keyDown(event.note);
      return;
    }
    // An adapter with no usable timestamp reports 0 (or nonsense): then "now" is the best guess.
    const now = this.clock.now();
    const time = Number.isFinite(event.time) && Math.abs(event.time - now) <= 1 ? event.time : now;
    if (this.policy.scores) {
      this.matcher.keyDown(event.note);
      // Where the song was, on the run's timeline, when the learner heard themselves play.
      const heard = effectiveTime(time, this.transport.outputLatency, this.options.latencyOffset);
      const at = now < this.anchoredAt ? heard - this.anchoredAt : this.transport.seconds - (now - heard);
      const verdict = this.scorer.press(event.note, at);
      this.flash(event.note, verdict.kind === 'hit' ? FLASH_CORRECT : FLASH_WRONG, now);
      return;
    }
    const verdict = this.matcher.noteOn(event.note, time);
    if (verdict === 'matched') {
      this.flash(event.note, FLASH_CORRECT, now);
      if (this.matcher.done) {
        this.completeStep(time, true);
        this.resume(time);
      } else this.refreshView();
    } else if (verdict === 'wrong') {
      this.wrong++;
      this.flash(event.note, FLASH_WRONG, now);
    }
  };

  private readonly onNoteOff = (event: MidiNoteEvent): void => {
    this.matcher.noteOff(event.note);
  };

  private setState(next: PracticeState): void {
    if (next === this.current) return;
    this.current = next;
    for (const listener of [...this.stateListeners]) listener(next);
  }
}
