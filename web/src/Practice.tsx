import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { instrumentPart } from './audio/parts';
import type { InstrumentSound, LoadedAudio } from './audio/types';
import { buildNoteIndex } from './engine/activeNotes';
import { barRange, barsOfSong } from './engine/practice/bars';
import {
  MAX_SPEED,
  MIN_SPEED,
  PracticeEngine,
  SPEED_STEP,
  type PracticeMode,
  type PracticeSettings,
  type PracticeState,
} from './engine/practice/engine';
import type { HandChoice } from './engine/practice/steps';
import type { MidiInput } from './midi/MidiInput';
import { Keyboard } from './piano/Keyboard';
import {
  countOutOfRange,
  KEYBOARD_RANGES,
  KEYBOARD_SIZES,
  type KeyboardSize,
} from './piano/layout';
import type { FrameScheduler } from './piano/PianoController';
import type { SessionDraft } from './sessions/types';
import type { Song } from './song';
import { midiToName } from './theory/pitch';
import { formatTime } from './time';

export type AudioStatus = 'idle' | 'loading' | InstrumentSound | 'failed';

export interface PracticeProps {
  song: Song;
  /** False when the app runs without audio (a static render): Play is disabled. */
  canPlay: boolean;
  midi: MidiInput | null;
  frames?: FrameScheduler | undefined;
  /** Whether a MIDI keyboard is connected, for the hint in training. */
  keyboardConnected: boolean;
  audioStatus: AudioStatus;
  audioError: string | null;
  /** Loads audio on first use. Must be called straight from a click. */
  ensureAudio: () => Promise<LoadedAudio | null>;
  /** The choices to open with (from the song overview, or a result's trouble spot). */
  initial?: { mode: PracticeMode; loopBars: [number, number] | null } | undefined;
  size: KeyboardSize;
  onSizeChange: (size: KeyboardSize) => void;
  /** Calibrated latency of the connected keyboard, in seconds. */
  latencyOffset: number;
  /** True while something else has the transport (the latency clicks): Play is disabled. */
  blocked?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  /** A run ended: a performance with its result, or a training run with its summary. */
  onSession?: (draft: SessionDraft) => void;
  /** The calendar date and time now (ISO 8601), for the session record. */
  now?: () => string;
}

// Speed is kept in whole percent, so stepping up and down never drifts.
const MIN_PERCENT = Math.round(MIN_SPEED * 100);
const MAX_PERCENT = Math.round(MAX_SPEED * 100);
const STEP_PERCENT = Math.round(SPEED_STEP * 100);

const MODES: { id: PracticeMode; label: string }[] = [
  { id: 'listen', label: 'Listen' },
  { id: 'training', label: 'Training' },
  { id: 'performance', label: 'Performance' },
];

const HANDS: { id: HandChoice; label: string }[] = [
  { id: 'right', label: 'Right hand' },
  { id: 'left', label: 'Left hand' },
  { id: 'both', label: 'Both hands' },
];

const READOUT_IDLE = 'Press Play, then play the lit keys.';
const READOUT_AGAIN = 'Press Play to go again.';
const READOUT_PERFORM = 'Press Play. After the count-in, play straight through.';
const HINTS: Partial<Record<PracticeMode, string>> = {
  training: 'Training waits for your notes. Connect your MIDI keyboard below to play along.',
  performance: 'Performance scores your notes. Connect your MIDI keyboard below to play.',
};

/** The line that tells the learner what the engine is doing. Plain text, written through a ref. */
function readoutText(engine: PracticeEngine): string {
  if (engine.stepCount === 0) return 'There are no notes for this hand here.';
  if (engine.state === 'stopped') {
    if (engine.settings.mode === 'performance') return READOUT_PERFORM;
    return engine.stepsDone > 0 ? READOUT_AGAIN : READOUT_IDLE;
  }
  if (engine.state === 'paused') return 'Paused';
  const phase = engine.phase;
  if (phase === 'count-in') return 'Count-in…';
  const names = engine.expected.map((key) => midiToName(key.midi)).join(' ');
  if (phase === 'waiting') return `Waiting for ${names}`;
  return names ? `Next: ${names}` : 'Playing';
}

/** Where the learner is, and how the run is going (or went, once it has stopped). */
function counterText(engine: PracticeEngine): string {
  if (engine.stepCount === 0) return '';
  if (engine.settings.mode === 'performance') {
    return engine.state === 'playing' ? `${engine.notesHit} in time · ${engine.wrongNotes} wrong` : '';
  }
  const score = `${engine.firstTime} of ${engine.stepsDone} right first time`;
  if (engine.state === 'stopped') return engine.stepsDone > 0 ? score : `${engine.stepCount} steps`;
  return `Step ${Math.min(engine.stepNumber, engine.stepCount)} of ${engine.stepCount} · ${score}`;
}

const STATE_CODE: Record<PracticeState, number> = { stopped: 0, playing: 1, paused: 2 };
const PHASE_CODE = { idle: 0, 'count-in': 1, running: 2, waiting: 3 } as const;

/**
 * The Practice screen for one song: mode, hands, speed, loop, metronome, transport and the
 * keyboard. Keyed by song, so switching songs unmounts it and disposes its engine.
 *
 * React state holds only what the learner chooses with a click, and play / pause / stop.
 * The position, the "Waiting for …" line and the counters are written through refs from
 * the keyboard's frame loop (rule 5): no note, hold, resume or score renders React. A
 * performance is scored in the engine; this screen only hands the finished result on.
 */
export function Practice(props: PracticeProps) {
  const { song, canPlay, midi, frames, keyboardConnected, audioStatus, audioError, ensureAudio } = props;
  const { initial, size, onSizeChange, latencyOffset, blocked = false, onPlayingChange, onSession, now } = props;
  const index = useMemo(() => buildNoteIndex(song.notes), [song]);
  const bars = useMemo(() => barsOfSong(song), [song]);
  const barCount = bars.bars.length;

  const [engine, setEngine] = useState<PracticeEngine | null>(null);
  const [state, setState] = useState<PracticeState>('stopped');
  const [mode, setMode] = useState<PracticeMode>(initial?.mode ?? 'listen');
  const [hands, setHands] = useState<HandChoice>('both');
  const [otherHand, setOtherHand] = useState<PracticeSettings['otherHand']>('play');
  const [percent, setPercent] = useState(100);
  const firstLoop = initial?.loopBars ?? null;
  const [looping, setLooping] = useState(firstLoop !== null);
  const [loopFrom, setLoopFrom] = useState(firstLoop?.[0] ?? 1);
  const [loopTo, setLoopTo] = useState(() => firstLoop?.[1] ?? Math.min(4, Math.max(1, barCount)));
  const [metronome, setMetronome] = useState(false);
  const [countIn, setCountIn] = useState(false);
  const range = KEYBOARD_RANGES[size];
  const outside = useMemo(() => countOutOfRange(song.notes, range), [song, range]);

  const settings = useMemo<Partial<PracticeSettings>>(
    () => ({
      mode,
      hands,
      otherHand,
      speed: percent / 100,
      loop: looping ? barRange(bars.bars, loopFrom, loopTo) : null,
      metronome,
      countIn,
      playable: range,
      latencyOffset,
    }),
    [mode, hands, otherHand, percent, looping, bars, loopFrom, loopTo, metronome, countIn, range, latencyOffset],
  );

  const engineRef = useRef<PracticeEngine | null>(null);
  const settingsRef = useRef(settings);
  const alive = useRef(true);
  const timeRef = useRef<HTMLSpanElement>(null);
  const seekRef = useRef<HTMLInputElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const seeking = useRef(false);
  const shown = useRef({ text: '', value: '', stamp: -1 });
  /** The run in progress, and the one that has just stopped (a result arrives after the stop). */
  const run = useRef<{ startedAt: string; clockStart: number } | null>(null);
  const ended = useRef<{ startedAt: string; clockStart: number } | null>(null);
  const callbacks = useRef({ onSession, now });
  useEffect(() => {
    callbacks.current = { onSession, now };
  }, [onSession, now]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // Leaving in the middle of a training run still counts as practice: stopping records it.
      if (engineRef.current && engineRef.current.state !== 'stopped') engineRef.current.stop();
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    onPlayingChange?.(state === 'playing');
  }, [state, onPlayingChange]);

  /** Follow play and stop to date a run, and record a training run when it stops. */
  function follow(current: PracticeEngine, next: PracticeState) {
    if (next === 'playing') {
      run.current ??= { startedAt: callbacks.current.now?.() ?? '', clockStart: current.now() };
      return;
    }
    if (next !== 'stopped' || !run.current) return;
    const { startedAt, clockStart } = run.current;
    ended.current = run.current;
    run.current = null;
    const { mode: ranAs, hands: ranHands, speed, loop: ranLoop } = current.settings;
    if (ranAs !== 'training' || current.stepsDone === 0) return;
    callbacks.current.onSession?.({
      mode: 'training',
      hands: ranHands,
      speed,
      loop: ranLoop,
      startedAt,
      durationSec: Math.max(0, current.now() - clockStart),
      result: { steps: current.stepsDone, firstTime: current.firstTime, wrongNotes: current.wrongNotes },
    });
  }

  // The learner's choices go to the engine as they are made, also while it plays.
  useEffect(() => {
    settingsRef.current = settings;
    engineRef.current?.configure(settings);
  }, [settings]);

  async function getEngine(): Promise<PracticeEngine | null> {
    if (engineRef.current) return engineRef.current;
    const audio = await ensureAudio();
    if (!audio || !alive.current) return null;
    if (engineRef.current) return engineRef.current;
    const created = new PracticeEngine({
      song,
      transport: audio.transport,
      piano: instrumentPart(audio.piano, 'isai'),
      metronome: audio.metronome,
      clock: audio.clock,
      midi,
      settings: settingsRef.current,
    });
    created.onStateChange((next) => {
      follow(created, next);
      setState(next);
    });
    // A performance ended (by itself or through Finish): hand the result on, once.
    created.onResult((result) => {
      const { hands: ranHands, speed, loop: ranLoop } = created.settings;
      callbacks.current.onSession?.({
        mode: 'performance',
        hands: ranHands,
        speed,
        loop: ranLoop,
        startedAt: ended.current?.startedAt ?? callbacks.current.now?.() ?? '',
        durationSec: result.durationSec,
        result,
      });
    });
    engineRef.current = created;
    setEngine(created);
    return created;
  }

  async function playPause() {
    if (engineRef.current?.state === 'playing') {
      engineRef.current.pause();
      return;
    }
    (await getEngine())?.play();
  }

  const onFrame = useCallback(
    (seconds: number) => {
      const text = `${formatTime(seconds)} / ${formatTime(song.durationSec)}`;
      if (timeRef.current && text !== shown.current.text) {
        timeRef.current.textContent = text;
        shown.current.text = text;
      }
      const value = seconds.toFixed(2);
      if (seekRef.current && !seeking.current && value !== shown.current.value) {
        seekRef.current.value = value;
        shown.current.value = value;
      }
      // The readout changes with the learner's notes (the engine's revision), with play /
      // pause / stop, and when the count-in ends; one number covers all three.
      const current = engineRef.current;
      if (!current) return;
      const stamp = current.revision * 16 + PHASE_CODE[current.phase] * 4 + STATE_CODE[current.state];
      if (stamp === shown.current.stamp) return;
      shown.current.stamp = stamp;
      if (readoutRef.current) readoutRef.current.textContent = readoutText(current);
      if (counterRef.current) counterRef.current.textContent = counterText(current);
    },
    [song],
  );

  // A drag can end without pointerup (touch scroll, alt-tab), so every exit clears the flag.
  const endSeek = () => {
    seeking.current = false;
  };

  const pickFrom = (bar: number) => {
    setLoopFrom(bar);
    if (bar > loopTo) setLoopTo(bar);
  };
  const pickTo = (bar: number) => {
    setLoopTo(bar);
    if (bar < loopFrom) setLoopFrom(bar);
  };

  const playing = state === 'playing';
  const loading = audioStatus === 'loading';
  const training = mode === 'training';
  const performing = mode === 'performance';
  /** The learner plays (training or performance), as opposed to listening. */
  const tracking = mode !== 'listen';
  /** A performance is one take: nothing that would change it can be touched while it runs. */
  const locked = performing && playing;
  const loop = barRange(bars.bars, loopFrom, loopTo);
  // What happens to notes the keyboard doesn't have, for one note and for several.
  let one = '';
  let many = '';
  if (training) [one, many] = [', and training skips it', ', and training skips them'];
  if (performing) [one, many] = [", and it isn't scored", ", and they aren't scored"];
  let loopLabel = 'Loop';
  if (loop && bars.unit === 'bar') {
    loopLabel = loopFrom === loopTo ? `Loop bar ${loopFrom}` : `Loop bars ${loopFrom}–${loopTo}`;
  } else if (loop) {
    loopLabel = `Loop ${formatTime(loop.start)}–${formatTime(loop.end)}`;
  }

  return (
    <section className="stack-4" aria-label="Practice">
      <div className="row-between">
        <div className="seg" role="group" aria-label="Mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className="seg-btn"
              aria-pressed={mode === m.id}
              disabled={locked}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {tracking && (
          <div className="row">
            <div className="seg" role="group" aria-label="Hands">
              {HANDS.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className="seg-btn"
                  aria-pressed={hands === h.id}
                  disabled={locked}
                  onClick={() => setHands(h.id)}
                >
                  {h.label}
                </button>
              ))}
            </div>
            {hands !== 'both' && (
              <div className="seg" role="group" aria-label="The other hand">
                <button
                  type="button"
                  className="seg-btn"
                  aria-pressed={otherHand === 'play'}
                  onClick={() => setOtherHand('play')}
                >
                  Isai plays it
                </button>
                <button
                  type="button"
                  className="seg-btn"
                  aria-pressed={otherHand === 'mute'}
                  onClick={() => setOtherHand('mute')}
                >
                  Muted
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {tracking && !keyboardConnected && <div className="alert alert-quiet">{HINTS[mode]}</div>}

      {/* Always mounted, so what the frame loop wrote survives a change of mode. */}
      <div hidden={!tracking}>
        <div className="card-row row-between">
          <span className="t-section" ref={readoutRef} data-readout="waiting" aria-live="off">
            {performing ? READOUT_PERFORM : READOUT_IDLE}
          </span>
          <span className="t-mono t-muted" ref={counterRef} data-readout="steps" aria-live="off" />
        </div>
      </div>

      <div className="stack-2">
        <div className="row-between">
          <div className="row">
            {locked ? (
              <button type="button" className="btn btn-primary btn-lg" onClick={() => engine?.finish()}>
                Finish
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-play"
                aria-label={playing ? 'Pause' : 'Play'}
                disabled={!canPlay || blocked}
                aria-busy={loading}
                onClick={() => void playPause()}
              >
                {playing ? <PauseIcon /> : <PlayIcon />}
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              aria-label="Stop"
              disabled={!engine || state === 'stopped'}
              onClick={() => engine?.stop()}
            >
              <StopIcon />
            </button>
          </div>
          <span className="t-mono" ref={timeRef} data-readout="time" aria-live="off">
            {`${formatTime(0)} / ${formatTime(song.durationSec)}`}
          </span>
        </div>
        <input
          ref={seekRef}
          type="range"
          className="range"
          aria-label="Position"
          min={0}
          max={song.durationSec}
          step={0.01}
          defaultValue={0}
          disabled={!engine || locked}
          onPointerDown={() => {
            seeking.current = true;
          }}
          onPointerUp={endSeek}
          onPointerCancel={endSeek}
          onLostPointerCapture={endSeek}
          onBlur={endSeek}
          onChange={(e) => engine?.seek(Number(e.target.value))}
        />
      </div>

      <div className="row">
        <div className="row" role="group" aria-label="Speed">
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            aria-label="Slower"
            disabled={locked || percent <= MIN_PERCENT}
            onClick={() => setPercent((p) => Math.max(MIN_PERCENT, p - STEP_PERCENT))}
          >
            −
          </button>
          <span className="stack-1">
            <b className="t-mono" data-readout="speed">{`${percent}%`}</b>
            <span className="t-muted">{`${Math.round((song.tempo.bpm * percent) / 100)} BPM`}</span>
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            aria-label="Faster"
            disabled={locked || percent >= MAX_PERCENT}
            onClick={() => setPercent((p) => Math.min(MAX_PERCENT, p + STEP_PERCENT))}
          >
            +
          </button>
        </div>

        {barCount > 0 && (
          <button
            type="button"
            className="filter"
            aria-pressed={looping}
            disabled={locked}
            onClick={() => setLooping((on) => !on)}
          >
            {loopLabel}
          </button>
        )}
        {barCount > 0 && looping && (
          <>
            <label className="row">
              <span className="label">From</span>
              <select
                className="select"
                aria-label="Loop from"
                disabled={locked}
                value={loopFrom}
                onChange={(e) => pickFrom(Number(e.target.value))}
              >
                {bars.bars.map((bar) => (
                  <option key={bar.number} value={bar.number}>
                    {bars.unit === 'bar' ? `Bar ${bar.number}` : formatTime(bar.start)}
                  </option>
                ))}
              </select>
            </label>
            <label className="row">
              <span className="label">To</span>
              <select
                className="select"
                aria-label="Loop to"
                disabled={locked}
                value={loopTo}
                onChange={(e) => pickTo(Number(e.target.value))}
              >
                {bars.bars.map((bar) => (
                  <option key={bar.number} value={bar.number}>
                    {bars.unit === 'bar' ? `Bar ${bar.number}` : formatTime(bar.end)}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <button
          type="button"
          className="filter"
          aria-pressed={metronome}
          onClick={() => setMetronome((on) => !on)}
        >
          Metronome
        </button>
        <button
          type="button"
          className="filter"
          aria-pressed={countIn}
          onClick={() => setCountIn((on) => !on)}
        >
          Count-in
        </button>
      </div>

      <SoundState status={audioStatus} detail={audioError} onRetry={() => void ensureAudio()} />

      <div className="row-between">
        <div className="seg" role="group" aria-label="Keyboard size">
          {KEYBOARD_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              className="seg-btn"
              aria-pressed={size === s}
              disabled={locked}
              onClick={() => onSizeChange(s)}
            >
              {s} keys
            </button>
          ))}
        </div>
        {outside.below + outside.above > 0 && (
          <div className="alert alert-quiet">
            {outside.below + outside.above === 1
              ? `1 note doesn't fit on ${size} keys. A marker at the end shows when it plays${one}.`
              : `${outside.below + outside.above} notes don't fit on ${size} keys. Markers at the ` +
                `ends show when they play${many}.`}
          </div>
        )}
      </div>

      {song.notes.length === 0 && (
        <div className="alert alert-quiet">This song has no notes yet, so there is nothing to play.</div>
      )}

      <Keyboard
        index={index}
        source={engine}
        practice={engine}
        range={range}
        midi={midi}
        onFrame={onFrame}
        {...(frames ? { frames } : {})}
      />
    </section>
  );
}

interface SoundStateProps {
  status: AudioStatus;
  detail: string | null;
  onRetry: () => void;
}

function SoundState({ status, detail, onRetry }: SoundStateProps) {
  if (status === 'loading') {
    return (
      <div className="row" role="status">
        <span className="loader-keys" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} />
          ))}
        </span>
        <span className="t-secondary">Tuning the piano… If nothing happens, press Play again.</span>
      </div>
    );
  }
  if (status === 'synth') {
    return (
      <div className="alert alert-quiet" role="status">
        The piano sound didn't load, so Isai is playing a simple synth. Check your connection,
        then reload the page to try the piano again.
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="state state-error" role="alert">
        <h2 className="t-section">Isai couldn't start sound</h2>
        <p className="t-secondary">Check that your computer has a sound output, then try again.</p>
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Try again
        </button>
        {detail && <p className="t-faint t-mono">{detail}</p>}
      </div>
    );
  }
  return null;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M6 6h12v12H6z" fill="currentColor" />
    </svg>
  );
}
