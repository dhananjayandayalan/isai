import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import frere from '../../schema/examples/frere-jacques-a-cappella.json';
import twinkle from '../../schema/examples/twinkle-g-major.json';
import type { AudioSource } from './audio/engine';
import { instrumentPart } from './audio/parts';
import type { LoadedAudio } from './audio/types';
import { monitorMidi } from './engine/monitor';
import type { MidiInput } from './midi/MidiInput';
import { MidiPanel } from './MidiPanel';
import type { FrameScheduler } from './piano/PianoController';
import { Practice, type AudioStatus } from './Practice';
import { parseSong, SongParseError, type Song } from './song';

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
  const [keyboardConnected, setKeyboardConnected] = useState(false);
  const [monitor, setMonitor] = useState(true);
  const monitorRef = useRef(monitor);
  useEffect(() => {
    monitorRef.current = monitor;
  }, [monitor]);

  // Your notes through Isai's piano, once audio has loaded and while the toggle is on.
  useEffect(() => {
    if (!deps) return undefined;
    return monitorMidi(deps.midi, {
      // The learner's part of the piano: Isai's notes on the same keys are left alone.
      instrument: () => {
        const piano = deps.audio.loaded?.piano;
        return piano ? instrumentPart(piano, 'learner') : null;
      },
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
            <Practice
              key={`${choice.id}-${opens}`}
              song={loaded.song}
              canPlay={deps !== undefined}
              midi={deps?.midi ?? null}
              frames={deps?.frames}
              keyboardConnected={keyboardConnected}
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
            onConnectionChange={(deviceId) => setKeyboardConnected(deviceId !== null)}
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
