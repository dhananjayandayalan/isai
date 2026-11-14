import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import frere from '../../schema/examples/frere-jacques-a-cappella.json';
import twinkle from '../../schema/examples/twinkle-g-major.json';
import type { AudioSource } from './audio/engine';
import { instrumentPart } from './audio/parts';
import type { LoadedAudio } from './audio/types';
import { monitorMidi } from './engine/monitor';
import { barsOfSong } from './engine/practice/bars';
import type { PracticeMode } from './engine/practice/engine';
import { LatencyCard } from './LatencyCard';
import type { MidiInput } from './midi/MidiInput';
import { MidiPanel } from './MidiPanel';
import type { FrameScheduler } from './piano/PianoController';
import { Practice, type AudioStatus } from './Practice';
import { Results } from './Results';
import { MemorySessionStore, type SessionStore } from './sessions/store';
import type { NewSession, PerformanceSession, Session, SessionDraft } from './sessions/types';
import { formatWhen, isoNow } from './sessions/wallClock';
import { MemorySettingsStore, type AppSettings, type SettingsStore } from './settings/store';
import { parseSong, SongParseError, type Song } from './song';
import { SongOverview } from './SongOverview';

/** Everything with side effects, injected so tests can pass fakes (main.tsx wires the real ones). */
export interface AppDeps {
  audio: AudioSource;
  midi: MidiInput;
  frames?: FrameScheduler;
  /** Where the learner's setup is remembered; in memory when left out. */
  settings?: SettingsStore;
  /** Where practice sessions are kept; in memory when left out. */
  sessions?: SessionStore;
  /** The calendar date and time now (ISO 8601), for session records. */
  now?: () => string;
}

/** The pages of the app. There is no router yet (P8): one song is open at a time. */
export type View = 'song' | 'practice' | 'results';

interface AppProps {
  /** Raw Song JSON to open first; defaults to the first example. */
  source?: unknown;
  deps?: AppDeps;
  /** The page to open on; the song overview by default. */
  view?: View;
}

const EXAMPLES = [
  { id: 'twinkle', label: 'Twinkle', json: twinkle as unknown },
  { id: 'frere', label: 'Frère Jacques', json: frere as unknown },
];

/** `notJson` is set when an opened file couldn't be parsed as JSON at all. */
type Choice = { id: string; json: unknown; notJson?: string };
type Loaded = { song: Song } | { error: 'not-json' | 'invalid'; detail: string };

/** How the practice screen opens: from the overview, or from a result's trouble spot. */
interface Launch {
  mode: PracticeMode;
  loopBars: [number, number] | null;
  /** Changes with every launch, so the practice screen starts afresh. */
  nonce: number;
}

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

export default function App({ source, deps, view: firstView = 'song' }: AppProps) {
  const [choice, setChoice] = useState<Choice>(() =>
    source === undefined ? { id: 'twinkle', json: twinkle } : { id: 'file', json: source },
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [opens, setOpens] = useState(0);
  const loaded = useMemo(() => load(choice), [choice]);
  const song = 'song' in loaded ? loaded.song : null;

  const [view, setView] = useState<View>(firstView);
  const [launch, setLaunch] = useState<Launch>({ mode: 'listen', loopBars: null, nonce: 0 });
  const [shown, setShown] = useState<PerformanceSession | null>(null);

  const settingsStore = useMemo(() => deps?.settings ?? new MemorySettingsStore(), [deps]);
  const sessionStore = useMemo(() => deps?.sessions ?? new MemorySessionStore(), [deps]);
  const [settings, setSettings] = useState<AppSettings>(() => settingsStore.load());
  const saveSettings = useCallback(
    (patch: Partial<AppSettings>) => setSettings(settingsStore.save(patch)),
    [settingsStore],
  );

  // This song's sessions. Kept with the song id they belong to, so a stale list is never shown.
  const [history, setHistory] = useState<{ songId: string; list: Session[] } | null>(null);
  const [sessionsSaved, setSessionsSaved] = useState(true);
  const [recorded, setRecorded] = useState(0);
  const songId = song?.id ?? null;
  useEffect(() => {
    if (songId === null) return undefined;
    let current = true;
    sessionStore.list(songId).then(
      (list) => {
        if (!current) return;
        setHistory({ songId, list });
        setSessionsSaved(sessionStore.persistent);
      },
      (error: unknown) => {
        // A store that can't be read is a store that doesn't keep anything: say so.
        console.error('Isai: past sessions could not be read.', error);
        if (!current) return;
        setHistory({ songId, list: [] });
        setSessionsSaved(false);
      },
    );
    return () => {
      current = false;
    };
  }, [songId, sessionStore, recorded]);
  const sessions = history && history.songId === songId ? history.list : null;

  const [audioStatus, setAudioStatus] = useState<AudioStatus>('idle');
  const [audioError, setAudioError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const monitorRef = useRef(settings.monitor);
  useEffect(() => {
    monitorRef.current = settings.monitor;
  }, [settings.monitor]);

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
    pick(next);
  }

  /** Open another song. A result belongs to the song it was played on, so leave that page. */
  function pick(next: Choice) {
    setChoice(next);
    if (view === 'results') setView('song');
  }

  function open(mode: PracticeMode, loopBars: [number, number] | null = null) {
    setLaunch((before) => ({ mode, loopBars, nonce: before.nonce + 1 }));
    setView('practice');
  }

  /** A run ended on the practice screen: keep it, and show a performance's result. */
  const onSession = useCallback(
    (draft: SessionDraft) => {
      if (!song) return;
      const record: NewSession = {
        version: 1,
        songId: song.id,
        songTitle: song.title,
        schemaVersion: song.schemaVersion,
        pipelineVersion: song.meta.pipelineVersion,
        ...draft,
      };
      if (record.mode === 'performance') {
        setShown(record);
        setView('results');
      }
      sessionStore.add(record).then(
        () => {
          setSessionsSaved(sessionStore.persistent);
          setRecorded((n) => n + 1);
        },
        (error: unknown) => {
          console.error('Isai: the session could not be saved.', error);
          setSessionsSaved(false);
        },
      );
    },
    [song, sessionStore],
  );

  const now = deps?.now ?? isoNow;
  const offset = deviceId === null ? 0 : (settings.latencyOffsets[deviceId] ?? 0);

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
                onClick={() => pick({ id: example.id, json: example.json })}
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

        {!song && 'error' in loaded && <SongError kind={loaded.error} detail={loaded.detail} fileName={fileName} />}

        {song && view === 'results' && shown && (
          <Results
            session={shown}
            when={formatWhen(shown.startedAt)}
            saved={sessionsSaved}
            barWord={barsOfSong(song).unit === 'bar' ? 'bar' : 'part'}
            onPlayAgain={() => open('performance')}
            onLoopInTraining={(from, to) => open('training', [from, to])}
            onBack={() => setView('song')}
          />
        )}

        {song && !(view === 'results' && shown) && (
          <>
            <SongSummary song={song} fromFile={choice.id === 'file' ? fileName : null} />
            {view === 'practice' ? (
              <>
                <div>
                  <button type="button" className="btn btn-ghost" onClick={() => setView('song')}>
                    Back to song
                  </button>
                </div>
                <Practice
                  key={`${choice.id}-${opens}-${launch.nonce}`}
                  song={song}
                  canPlay={deps !== undefined}
                  midi={deps?.midi ?? null}
                  frames={deps?.frames}
                  keyboardConnected={deviceId !== null}
                  audioStatus={audioStatus}
                  audioError={audioError}
                  ensureAudio={ensureAudio}
                  initial={launch}
                  size={settings.keyboardSize}
                  onSizeChange={(keyboardSize) => saveSettings({ keyboardSize })}
                  latencyOffset={offset}
                  blocked={calibrating}
                  onPlayingChange={setPlaying}
                  onSession={onSession}
                  now={now}
                />
              </>
            ) : (
              <SongOverview
                song={song}
                sessions={sessions}
                sessionsSaved={sessionsSaved}
                formatWhen={formatWhen}
                onStart={open}
                onOpenResult={(session) => {
                  setShown(session);
                  setView('results');
                }}
              />
            )}
          </>
        )}

        {/* Hidden, not unmounted, on the results page: the panel holds the connection. */}
        {deps && (
          <div hidden={view === 'results' && shown !== null}>
            <div className="stack-6">
              <MidiPanel
                midi={deps.midi}
                onConnect={() => void ensureAudio()}
                onConnectionChange={(id) => {
                  setDeviceId(id);
                  if (id !== null) saveSettings({ lastDeviceId: id });
                }}
                preferredDeviceId={settings.lastDeviceId}
                monitor={settings.monitor}
                onMonitorChange={(monitor) => saveSettings({ monitor })}
              />
              <LatencyCard
                midi={deps.midi}
                deviceId={deviceId}
                offset={offset}
                onOffsetChange={(seconds) => {
                  if (deviceId !== null) saveSettings({ latencyOffsets: { ...settings.latencyOffsets, [deviceId]: seconds } });
                }}
                ensureAudio={ensureAudio}
                busy={playing && view === 'practice'}
                onRunningChange={setCalibrating}
              />
            </div>
          </div>
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
