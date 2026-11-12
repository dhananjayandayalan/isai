import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import frere from '../../schema/examples/frere-jacques-a-cappella.json';
import twinkle from '../../schema/examples/twinkle-g-major.json';
import type { AudioSource } from './audio/engine';
import type { InstrumentSound, LoadedAudio } from './audio/types';
import { buildNoteIndex } from './engine/activeNotes';
import { monitorMidi } from './engine/monitor';
import { createPlayer, type Player, type PlayerState } from './engine/player';
import type { MidiInput } from './midi/MidiInput';
import { MidiPanel } from './MidiPanel';
import { Keyboard } from './piano/Keyboard';
import {
  countOutOfRange,
  DEFAULT_KEYBOARD_SIZE,
  KEYBOARD_RANGES,
  KEYBOARD_SIZES,
  type KeyboardSize,
} from './piano/layout';
import type { FrameScheduler } from './piano/PianoController';
import { parseSong, SongParseError, type Song } from './song';
import { formatTime } from './time';

/** Everything with side effects, injected so tests can pass fakes (main.tsx wires the real ones). */
export interface AppDeps {
  audio: AudioSource;
  midi: MidiInput;
  frames?: FrameScheduler;
}

interface AppProps {
  /** Raw Song JSON to open first; defaults to the first example. */
  source?: unknown;
  deps?: AppDeps;
}

const EXAMPLES = [
  { id: 'twinkle', label: 'Twinkle', json: twinkle as unknown },
  { id: 'frere', label: 'Frère Jacques', json: frere as unknown },
];

/** `notJson` is set when an opened file couldn't be parsed as JSON at all. */
type Choice = { id: string; json: unknown; notJson?: string };
type Loaded = { song: Song } | { error: 'not-json' | 'invalid'; detail: string };
type AudioStatus = 'idle' | 'loading' | InstrumentSound | 'failed';

function load(choice: Choice): Loaded {
  if (choice.notJson !== undefined) return { error: 'not-json', detail: choice.notJson };
  try {
    return { song: parseSong(choice.json) };
  } catch (e) {
    return { error: 'invalid', detail: e instanceof SongParseError ? e.errors.join('\n') : String(e) };
  }
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function App({ source, deps }: AppProps) {
  const [choice, setChoice] = useState<Choice>(() =>
    source === undefined ? { id: 'twinkle', json: twinkle } : { id: 'file', json: source },
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [opens, setOpens] = useState(0);
  const loaded = useMemo(() => load(choice), [choice]);

  const [audioStatus, setAudioStatus] = useState<AudioStatus>('idle');
  const [audioError, setAudioError] = useState<string | null>(null);
  const [monitor, setMonitor] = useState(true);
  const monitorRef = useRef(monitor);
  useEffect(() => {
    monitorRef.current = monitor;
  }, [monitor]);

  // Your notes through Isai's piano, once audio has loaded and while the toggle is on.
  useEffect(() => {
    if (!deps) return undefined;
    return monitorMidi(deps.midi, {
      instrument: () => deps.audio.loaded?.piano ?? null,
      enabled: () => monitorRef.current,
    });
  }, [deps]);

  /**
   * Load Tone.js and the piano on first use. Call it from a click and don't await anything
   * first: `audio.load()` starts the audio context synchronously, inside the gesture.
   */
  const ensureAudio = useCallback(async (): Promise<LoadedAudio | null> => {
    if (!deps) return null;
    if (!deps.audio.loaded) setAudioStatus('loading');
    try {
      const audio = await deps.audio.load();
      setAudioStatus(await audio.piano.loaded);
      setAudioError(null);
      return audio;
    } catch (e) {
      console.error('Isai: sound could not start.', e);
      setAudioError(message(e));
      setAudioStatus('failed');
      return null;
    }
  }, [deps]);

  async function openFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    let next: Choice;
    try {
      next = { id: 'file', json: JSON.parse(await file.text()) as unknown };
    } catch (e) {
      next = { id: 'file', json: null, notJson: message(e) };
    }
    setFileName(file.name);
    setOpens((n) => n + 1);
    setChoice(next);
  }

  return (
    <main className="app-main">
      <div className="app-content stack-6">
        <div className="row-between">
          <div className="seg" role="group" aria-label="Song">
            {EXAMPLES.map((example) => (
              <button
                key={example.id}
                type="button"
                className="seg-btn"
                aria-pressed={choice.id === example.id}
                onClick={() => setChoice({ id: example.id, json: example.json })}
              >
                {example.label}
              </button>
            ))}
          </div>
          <label className="btn btn-secondary">
            Open a .song.json file
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(e) => void openFile(e)}
            />
          </label>
        </div>

        {'song' in loaded ? (
          <>
            <SongSummary song={loaded.song} fromFile={choice.id === 'file' ? fileName : null} />
            <Playback
              key={`${choice.id}-${opens}`}
              song={loaded.song}
              deps={deps}
              audioStatus={audioStatus}
              audioError={audioError}
              ensureAudio={ensureAudio}
            />
          </>
        ) : (
          <SongError kind={loaded.error} detail={loaded.detail} fileName={fileName} />
        )}

        {deps && (
          <MidiPanel
            midi={deps.midi}
            onConnect={() => void ensureAudio()}
            monitor={monitor}
            onMonitorChange={setMonitor}
          />
        )}

        <p className="t-faint">
          Piano sound: Salamander Grand Piano by Alexander Holm (CC-BY 3.0), via Tone.js.
        </p>
      </div>
    </main>
  );
}

function SongSummary({ song, fromFile }: { song: Song; fromFile: string | null }) {
  const stats = [
    { label: 'Key', value: `${song.tonality.key} ${song.tonality.mode}` },
    { label: 'Tempo', value: `${Math.round(song.tempo.bpm)} BPM` },
    { label: 'Notes', value: String(song.notes.length) },
  ];
  return (
    <section className="stack-6" aria-labelledby="song-title">
      <div className="stack-2">
        <span className="t-overline">{fromFile ? `From ${fromFile}` : 'Example song'}</span>
        <h1 className="t-page-title" id="song-title">
          {song.title}
        </h1>
      </div>
      <div className="grid-cards">
        {stats.map((s) => (
          <div className="card stack-1" key={s.label}>
            <span className="t-overline">{s.label}</span>
            <span className="t-stat" data-stat={s.label.toLowerCase()}>
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

interface SongErrorProps {
  kind: 'not-json' | 'invalid';
  detail: string;
  fileName: string | null;
}

function SongError({ kind, detail, fileName }: SongErrorProps) {
  return (
    <div className="state state-error" role="alert">
      <h1 className="t-state-title">We couldn't read this song</h1>
      <p className="t-secondary">
        {kind === 'not-json'
          ? `${fileName ?? 'That file'} isn't a song file. Isai opens the .song.json files ` +
            'its own analysis writes. Pick an example song above, or open a different file.'
          : "The song file doesn't match the format Isai expects. Pick an example song " +
            'above, or open a different .song.json file.'}
      </p>
      <p className="t-faint t-mono">{detail}</p>
    </div>
  );
}

interface PlaybackProps {
  song: Song;
  deps: AppDeps | undefined;
  audioStatus: AudioStatus;
  audioError: string | null;
  ensureAudio: () => Promise<LoadedAudio | null>;
}

/**
 * Transport bar, keyboard and sound states for one song. Keyed by song, so switching songs
 * unmounts it and disposes its player. React state changes on play / pause / stop only;
 * the position readout and seek bar are updated from the keyboard's frame loop via refs.
 */
function Playback({ song, deps, audioStatus, audioError, ensureAudio }: PlaybackProps) {
  const index = useMemo(() => buildNoteIndex(song.notes), [song]);
  const [player, setPlayer] = useState<Player | null>(null);
  const [state, setState] = useState<PlayerState>('stopped');
  const [size, setSize] = useState<KeyboardSize>(DEFAULT_KEYBOARD_SIZE);
  const range = KEYBOARD_RANGES[size];
  const outside = useMemo(() => countOutOfRange(song.notes, range), [song, range]);

  const playerRef = useRef<Player | null>(null);
  const alive = useRef(true);
  const timeRef = useRef<HTMLSpanElement>(null);
  const seekRef = useRef<HTMLInputElement>(null);
  const seeking = useRef(false);
  const shown = useRef({ text: '', value: '' });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, []);

  async function getPlayer(): Promise<Player | null> {
    if (playerRef.current) return playerRef.current;
    const audio = await ensureAudio();
    if (!audio || !alive.current) return null;
    if (playerRef.current) return playerRef.current;
    const created = createPlayer(song, audio.transport, audio.piano);
    created.onStateChange(setState);
    playerRef.current = created;
    setPlayer(created);
    return created;
  }

  async function playPause() {
    if (playerRef.current?.state === 'playing') {
      playerRef.current.pause();
      return;
    }
    (await getPlayer())?.play();
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
    },
    [song],
  );

  // A drag can end without pointerup (touch scroll, alt-tab), so every exit clears the flag.
  const endSeek = () => {
    seeking.current = false;
  };

  const playing = state === 'playing';
  const loading = audioStatus === 'loading';
  return (
    <section className="stack-4" aria-label="Playback">
      <div className="row">
        <button
          type="button"
          className="btn btn-primary btn-play"
          aria-label={playing ? 'Pause' : 'Play'}
          disabled={!deps}
          aria-busy={loading}
          onClick={() => void playPause()}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-icon"
          aria-label="Stop"
          disabled={!player || state === 'stopped'}
          onClick={() => player?.stop()}
        >
          <StopIcon />
        </button>
        <input
          ref={seekRef}
          type="range"
          className="range"
          aria-label="Position"
          min={0}
          max={song.durationSec}
          step={0.01}
          defaultValue={0}
          disabled={!player}
          onPointerDown={() => {
            seeking.current = true;
          }}
          onPointerUp={endSeek}
          onPointerCancel={endSeek}
          onLostPointerCapture={endSeek}
          onBlur={endSeek}
          onChange={(e) => player?.seek(Number(e.target.value))}
        />
        <span className="t-mono" ref={timeRef} aria-live="off">
          {`${formatTime(0)} / ${formatTime(song.durationSec)}`}
        </span>
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
              onClick={() => setSize(s)}
            >
              {s} keys
            </button>
          ))}
        </div>
        {outside.below + outside.above > 0 && (
          <p className="alert-quiet">
            {outside.below + outside.above} notes don't fit on {size} keys. Markers at the
            ends show when they play.
          </p>
        )}
      </div>

      {song.notes.length === 0 && (
        <p className="alert-quiet">This song has no notes yet, so there is nothing to play.</p>
      )}

      <Keyboard
        index={index}
        source={player}
        range={range}
        midi={deps?.midi ?? null}
        onFrame={onFrame}
        {...(deps?.frames ? { frames: deps.frames } : {})}
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
      <p className="alert-quiet" role="status">
        The piano sound didn't load, so Isai is playing a simple synth. Check your connection,
        then reload the page to try the piano again.
      </p>
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
