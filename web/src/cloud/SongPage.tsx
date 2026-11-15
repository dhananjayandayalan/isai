import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { jobErrorWords } from '../api/jobErrors';
import type { Api, SongRow } from '../api/types';
import App, { type AppDeps, type View } from '../App';
import { parseSong, SongParseError } from '../song';

const VIEWS: readonly View[] = ['song', 'practice', 'results', 'devices'];

type Loaded =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'error'; detail: string }
  | { state: 'not-ready'; row: SongRow }
  | { state: 'invalid'; row: SongRow; detail: string }
  | { state: 'ready'; row: SongRow; json: unknown };

interface SongPageProps {
  api: Api;
  deps: AppDeps;
  /** Opens a download link; the browser saves the file (the link sets Content-Disposition). */
  openUrl?: ((url: string) => void) | undefined;
}

/** A song from the account: the practice pages under /songs/:id, with download, share and delete. */
export function SongPage({ api, deps, openUrl = (url) => window.location.assign(url) }: SongPageProps) {
  const { songId = '', view: viewParam } = useParams();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const view: View = VIEWS.find((v) => v === (viewParam ?? 'song')) ?? 'song';

  useEffect(() => {
    let current = true;
    (async () => {
      const row = await api.songs.get(songId);
      if (!row) return { state: 'missing' } as const;
      if (row.status !== 'ready') return { state: 'not-ready', row } as const;
      const json = await api.songs.loadSong(row);
      try {
        parseSong(json);
      } catch (e) {
        return { state: 'invalid', row, detail: e instanceof SongParseError ? e.errors.join('\n') : String(e) } as const;
      }
      return { state: 'ready', row, json } as const;
    })().then(
      (next) => current && setLoaded(next),
      (error: unknown) => {
        console.error('Isai: the song could not be opened.', error);
        if (current) setLoaded({ state: 'error', detail: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [api, songId, attempt]);

  if (loaded.state === 'loading') {
    return (
      <main className="app-main">
        <div className="app-content stack-6" aria-busy="true" aria-label="Loading the song">
          <div className="skeleton" style={{ height: 48, maxWidth: 420 }} />
          <div className="grid-cards">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ height: 96 }} />
            ))}
          </div>
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      </main>
    );
  }

  if (loaded.state !== 'ready') {
    return (
      <main className="app-main">
        <div className="app-content stack-6">
          <SongProblem loaded={loaded} retry={() => setAttempt((n) => n + 1)} />
        </div>
      </main>
    );
  }

  const { row } = loaded;
  return (
    <App
      key={row.id}
      source={loaded.json}
      deps={deps}
      cloud={{
        view,
        onNavigate: (next, options) => navigate(next === 'song' ? `/songs/${row.id}` : `/songs/${row.id}/${next}`, options),
        overline: row.mine ? (row.shared ? 'Your song · shared with the group' : 'Your song') : 'Shared by a friend',
        header: <SongActions api={api} row={row} openUrl={openUrl} onDeleted={() => navigate('/', { replace: true })} />,
      }}
    />
  );
}

function SongProblem({ loaded, retry }: { loaded: Exclude<Loaded, { state: 'loading' | 'ready' }>; retry: () => void }) {
  const back = (
    <Link className="btn btn-secondary" to="/">
      Back to the library
    </Link>
  );
  if (loaded.state === 'missing') {
    return (
      <div className="state state-empty">
        <h1 className="t-state-title">This song isn't here</h1>
        <p className="t-secondary">It may have been deleted, or it isn't shared with you.</p>
        {back}
      </div>
    );
  }
  if (loaded.state === 'not-ready') {
    const { row } = loaded;
    if (row.status === 'analysing') {
      return (
        <div className="state state-empty">
          <h1 className="t-state-title">{row.title} is still being analysed</h1>
          <p className="t-secondary">It will be ready to practise in a few minutes.</p>
          {row.jobId ? (
            <Link className="btn btn-primary" to={`/jobs/${row.jobId}`}>
              See the progress
            </Link>
          ) : (
            back
          )}
        </div>
      );
    }
    const words = jobErrorWords(row.errorCode);
    return (
      <div className="state state-error" role="alert">
        <h1 className="t-state-title">{words.message}</h1>
        <p className="t-secondary">{words.next}</p>
        <Link className="btn btn-primary" to="/upload">
          Analyse a recording
        </Link>
      </div>
    );
  }
  if (loaded.state === 'invalid') {
    return (
      <div className="state state-error" role="alert">
        <h1 className="t-state-title">We couldn't read this song</h1>
        <p className="t-secondary">
          It was written by an older or newer version of Isai than this page understands. Reload the page; if it
          stays like this, tell the owner.
        </p>
        <p className="t-faint t-mono">{loaded.detail}</p>
        {back}
      </div>
    );
  }
  return (
    <div className="state state-error" role="alert">
      <h1 className="t-state-title">We couldn't open this song</h1>
      <p className="t-secondary">Check your connection, then try again.</p>
      <button type="button" className="btn btn-secondary" onClick={retry}>
        Try again
      </button>
    </div>
  );
}

interface SongActionsProps {
  api: Api;
  row: SongRow;
  openUrl: (url: string) => void;
  onDeleted: () => void;
}

function SongActions({ api, row, openUrl, onDeleted }: SongActionsProps) {
  const [shared, setShared] = useState(row.shared);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'json' | 'midi' | 'share' | 'delete' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function download(file: 'json' | 'midi') {
    setBusy(file);
    setToast(null);
    try {
      openUrl(await api.songs.downloadUrl(row, file));
    } catch (error) {
      console.error('Isai: the download link could not be made.', error);
      setToast("We couldn't download that file. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleShare() {
    setBusy('share');
    setToast(null);
    try {
      await api.songs.setShared(row.id, !shared);
      setShared(!shared);
    } catch (error) {
      console.error('Isai: sharing could not be changed.', error);
      setToast("We couldn't change sharing. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy('delete');
    setToast(null);
    try {
      await api.songs.remove(row);
      onDeleted();
    } catch (error) {
      console.error('Isai: the song could not be deleted.', error);
      setToast("We couldn't delete the song. Try again.");
      setBusy(null);
    }
  }

  return (
    <div className="stack-3">
      <div className="row">
        <Link className="btn btn-ghost" to="/">
          Library
        </Link>
        <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => void download('midi')}>
          Download MIDI
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => void download('json')}>
          Download Song JSON
        </button>
        {row.mine && (
          <label className="row">
            <input type="checkbox" checked={shared} disabled={busy !== null} onChange={() => void toggleShare()} />
            Share with the group
          </label>
        )}
        {row.mine && !confirming && (
          <button type="button" className="btn btn-quiet" disabled={busy !== null} onClick={() => setConfirming(true)}>
            Delete
          </button>
        )}
      </div>
      {confirming && (
        <div className="alert row-between" role="alertdialog" aria-label="Delete this song">
          <span>Delete {row.title} and its practice history? This can't be undone.</span>
          <span className="row">
            <button type="button" className="btn btn-secondary" disabled={busy === 'delete'} onClick={() => setConfirming(false)}>
              Keep it
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy === 'delete'}
              aria-busy={busy === 'delete'}
              onClick={() => void remove()}
            >
              {busy === 'delete' ? 'Deleting…' : 'Delete'}
            </button>
          </span>
        </div>
      )}
      {toast && (
        <p className="toast toast-error" role="status">
          {toast}
        </p>
      )}
    </div>
  );
}
