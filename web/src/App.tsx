import { useMemo } from 'react';
import example from '../../schema/examples/twinkle-g-major.json';
import { parseSong, SongParseError, type Song } from './song';

interface AppProps {
  /** Raw Song JSON. P0 loads a schema example; later phases load it from the worker. */
  source?: unknown;
}

type Loaded = { song: Song } | { error: string };

function load(source: unknown): Loaded {
  try {
    return { song: parseSong(source) };
  } catch (e) {
    return { error: e instanceof SongParseError ? e.errors.join('\n') : String(e) };
  }
}

export default function App({ source = example }: AppProps) {
  const loaded = useMemo(() => load(source), [source]);

  return (
    <main className="app-main">
      <div className="app-content">
        {'song' in loaded ? <SongSummary song={loaded.song} /> : <SongError detail={loaded.error} />}
      </div>
    </main>
  );
}

function SongSummary({ song }: { song: Song }) {
  const stats = [
    { label: 'Key', value: `${song.tonality.key} ${song.tonality.mode}` },
    { label: 'Tempo', value: `${Math.round(song.tempo.bpm)} BPM` },
    { label: 'Notes', value: String(song.notes.length) },
  ];
  return (
    <section className="stack-6" aria-labelledby="song-title">
      <div className="stack-2">
        <span className="t-overline">Example song</span>
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

function SongError({ detail }: { detail: string }) {
  return (
    <div className="state state-error" role="alert">
      <h1 className="t-state-title">We couldn't read this song</h1>
      <p className="t-secondary">The song file doesn't match the format Isai expects.</p>
      <p className="t-faint t-mono">{detail}</p>
    </div>
  );
}
