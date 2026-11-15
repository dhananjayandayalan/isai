import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { jobErrorWords } from '../api/jobErrors';
import { SOURCE_TYPES, type Api, type SongPractice, type SongRow, type SourceType } from '../api/types';
import { formatDuration, SOURCE_LABEL } from './format';
import { SessionImport, type LocalSessions } from './SessionImport';

interface LibraryProps {
  api: Api;
  userId: string;
  local?: LocalSessions | undefined;
}

type Loaded = { state: 'loading' } | { state: 'error' } | { state: 'ready'; rows: SongRow[]; practice: SongPractice[] };

/** The songbook: your songs and the ones friends share, with how your practice is going. */
export function Library({ api, userId, local }: LibraryProps) {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<SourceType | 'all'>('all');

  useEffect(() => {
    let current = true;
    Promise.all([api.songs.list(), api.sessions.summary().catch(() => [] as SongPractice[])]).then(
      ([rows, practice]) => current && setLoaded({ state: 'ready', rows, practice }),
      (error: unknown) => {
        console.error('Isai: the library could not be loaded.', error);
        if (current) setLoaded({ state: 'error' });
      },
    );
    return () => {
      current = false;
    };
  }, [api, attempt]);

  const retry = useCallback(() => {
    setLoaded({ state: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const rows = useMemo(() => (loaded.state === 'ready' ? loaded.rows : []), [loaded]);
  const practice = useMemo(
    () => new Map((loaded.state === 'ready' ? loaded.practice : []).map((p) => [p.songId, p])),
    [loaded],
  );
  const shown = rows.filter(
    (row) =>
      (type === 'all' || row.sourceType === type) && row.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const resume = useMemo(() => {
    const ready = new Map(rows.filter((r) => r.status === 'ready').map((r) => [r.id, r]));
    const latest = [...practice.values()]
      .filter((p) => ready.has(p.songId))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt))[0];
    return latest ? { row: ready.get(latest.songId) as SongRow, practice: latest } : null;
  }, [rows, practice]);

  return (
    <main className="app-main">
      <div className="app-content stack-6">
        <header className="row-between">
          <div className="stack-2">
            <h1 className="t-page-title">Library</h1>
            <p className="t-secondary">Your songs, and the ones friends share with the group.</p>
          </div>
          <Link className="btn btn-primary" to="/upload">
            Analyse a song
          </Link>
        </header>

        {local && <SessionImport userId={userId} local={local} sessions={api.sessions} />}

        {loaded.state === 'loading' && (
          <section className="stack-4" aria-busy="true" aria-label="Loading your songs">
            <p className="t-muted">Flipping through your songbook…</p>
            <div className="grid-cards">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton" style={{ height: 140 }} />
              ))}
            </div>
          </section>
        )}

        {loaded.state === 'error' && (
          <div className="state state-error" role="alert">
            <h2 className="t-state-title">We couldn't fetch your songs</h2>
            <p className="t-secondary">Check your connection, then try again.</p>
            <button type="button" className="btn btn-secondary" onClick={retry}>
              Try again
            </button>
          </div>
        )}

        {loaded.state === 'ready' && rows.length === 0 && (
          <div className="state state-empty">
            <h2 className="t-state-title">Your songbook is empty</h2>
            <p className="t-secondary">
              Upload a recording and Isai writes a two-hand arrangement you can practise. It takes a few minutes.
            </p>
            <Link className="btn btn-primary" to="/upload">
              Analyse your first song
            </Link>
          </div>
        )}

        {loaded.state === 'ready' && rows.length > 0 && (
          <>
            {resume && (
              <section className="card stack-2" aria-label="Continue practising">
                <span className="t-overline">Continue practising</span>
                <div className="row-between">
                  <span className="t-card-title">{resume.row.title}</span>
                  <Link className="btn btn-primary" to={`/songs/${resume.row.id}`}>
                    Open
                  </Link>
                </div>
              </section>
            )}

            <div className="row-between">
              <div className="row" role="group" aria-label="Kind of recording">
                <button type="button" className="filter" aria-pressed={type === 'all'} onClick={() => setType('all')}>
                  All <span className="t-mono">{rows.length}</span>
                </button>
                {SOURCE_TYPES.map((t) => (
                  <button key={t} type="button" className="filter" aria-pressed={type === t} onClick={() => setType(t)}>
                    {SOURCE_LABEL[t]} <span className="t-mono">{rows.filter((r) => r.sourceType === t).length}</span>
                  </button>
                ))}
              </div>
              <div className="field">
                <label className="sr-only" htmlFor="library-search">
                  Search songs
                </label>
                <input
                  id="library-search"
                  className="input"
                  type="search"
                  placeholder="Search songs"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            {shown.length === 0 ? (
              <div className="state state-empty">
                <h2 className="t-state-title">No songs match</h2>
                <p className="t-secondary">Try a different search, or show every kind of recording.</p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setQuery('');
                    setType('all');
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <ul className="grid-cards" aria-label="Songs" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {shown.map((row) => (
                  <li key={row.id}>
                    <SongCard row={row} practice={practice.get(row.id) ?? null} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function SongCard({ row, practice }: { row: SongRow; practice: SongPractice | null }) {
  const to = row.status === 'analysing' && row.jobId ? `/jobs/${row.jobId}` : `/songs/${row.id}`;
  return (
    <Link to={to} className="card card-lift stack-3" style={{ display: 'flex', textDecoration: 'none', color: 'inherit' }}>
      <div className="row-between">
        <span className="t-card-title">{row.title}</span>
        {row.status === 'analysing' && <span className="tag tag-loading">Analysing</span>}
        {row.status === 'failed' && <span className="tag tag-error">Didn't finish</span>}
      </div>
      <div className="row">
        <span className="chip">{SOURCE_LABEL[row.sourceType]}</span>
        {row.key && row.mode && <span className="chip">{`${row.key} ${row.mode}`}</span>}
        {row.bpm !== null && <span className="chip chip-mono">{`${Math.round(row.bpm)} BPM`}</span>}
        {row.durationSec !== null && <span className="chip chip-mono">{formatDuration(row.durationSec)}</span>}
        {row.shared && <span className="chip">{row.mine ? 'Shared' : 'Shared by a friend'}</span>}
      </div>
      {row.status === 'failed' && <span className="t-muted">{jobErrorWords(row.errorCode).message}</span>}
      {row.status === 'ready' && (
        <span className="t-muted">
          {practice
            ? `${practice.sessions} ${practice.sessions === 1 ? 'session' : 'sessions'}` +
              (practice.bestScore !== null ? ` · best ${Math.round(practice.bestScore)}` : '')
            : 'Not practised yet'}
        </span>
      )}
    </Link>
  );
}
