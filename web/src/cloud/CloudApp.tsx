import { useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useParams } from 'react-router';
import type { Api, AuthUser } from '../api/types';
import type { AppDeps } from '../App';
import { MemorySettingsStore } from '../settings/store';
import { linkExpired } from './format';
import { JobProgress } from './JobProgress';
import { Library } from './Library';
import { probeDuration, type DurationProbe } from './media';
import type { LocalSessions } from './SessionImport';
import { SignIn } from './SignIn';
import { SongPage } from './SongPage';
import { SyncedSettingsStore } from './syncedSettings';
import { Upload } from './Upload';

export interface CloudAppProps {
  api: Api;
  /** Audio, MIDI and this device's settings, as in local mode. */
  deps: Omit<AppDeps, 'sessions'>;
  /** This device's sessions from before signing in, offered for import once. */
  local?: LocalSessions;
  probe?: DurationProbe;
  openUrl?: (url: string) => void;
  /** Where sign-in links come back to; the site's address by default. */
  origin?: string;
}

type Auth = { state: 'loading' } | { state: 'signed-out' } | { state: 'signed-in'; user: AuthUser };

/**
 * Isai with an account (P8): sign in, the library, uploads and job progress, and songs
 * from the account. Rendered inside a router (BrowserRouter in main.tsx).
 */
export function CloudApp({ api, deps, local, probe = probeDuration, openUrl, origin }: CloudAppProps) {
  const location = useLocation();
  const [auth, setAuth] = useState<Auth>({ state: 'loading' });
  const settings = useMemo(
    () => new SyncedSettingsStore(deps.settings ?? new MemorySettingsStore(), api.preferences),
    [deps.settings, api.preferences],
  );
  const songDeps = useMemo<AppDeps>(() => ({ ...deps, settings, sessions: api.sessions }), [deps, settings, api.sessions]);

  useEffect(() => {
    let current = true;
    // The account's notation choices come onto this device before the pages read settings.
    const enter = (user: AuthUser | null) => {
      if (!user) {
        if (current) setAuth({ state: 'signed-out' });
        return;
      }
      settings
        .pull()
        .catch((error: unknown) => console.error('Isai: notation preferences could not be loaded.', error))
        .finally(() => current && setAuth({ state: 'signed-in', user }));
    };
    api.auth.current().then(enter, () => current && setAuth({ state: 'signed-out' }));
    const stop = api.auth.onChange(enter);
    return () => {
      current = false;
      stop();
    };
  }, [api, settings]);

  if (auth.state === 'loading') {
    return (
      <main className="app-main" aria-busy="true" aria-label="Starting Isai">
        <div className="app-content stack-4">
          <div className="skeleton" style={{ height: 48, maxWidth: 240 }} />
        </div>
      </main>
    );
  }

  if (auth.state === 'signed-out') {
    return (
      <SignIn
        auth={api.auth}
        redirectTo={origin ?? window.location.origin}
        expired={linkExpired({ hash: location.hash, search: location.search })}
      />
    );
  }

  const { user } = auth;
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-name">Isai</span>
          <span className="brand-tamil" lang="ta">
            இசை
          </span>
        </div>
        <nav className="nav" aria-label="Main">
          <NavLink className="nav-item" to="/" end>
            Library
          </NavLink>
          <NavLink className="nav-item" to="/upload">
            Analyse a song
          </NavLink>
        </nav>
        <div className="stack-2" style={{ marginTop: 'auto' }}>
          <span className="t-muted">{user.email}</span>
          <div>
            <button type="button" className="btn btn-ghost" onClick={() => void api.auth.signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <Routes>
        <Route path="/" element={<Library api={api} userId={user.id} local={local} />} />
        <Route path="/upload" element={<Upload uploads={api.uploads} probe={probe} />} />
        <Route path="/jobs/:jobId" element={<Keyed param="jobId" render={() => <JobProgress api={api} />} />} />
        <Route
          path="/songs/:songId/:view?"
          element={<Keyed param="songId" render={() => <SongPage api={api} deps={songDeps} openUrl={openUrl} />} />}
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

/** Remounts the page when the id in the URL changes, so it starts from its loading state. */
function Keyed({ param, render }: { param: string; render: () => React.ReactNode }) {
  const params = useParams();
  return <div key={params[param]} style={{ display: 'contents' }}>{render()}</div>;
}

function NotFound() {
  return (
    <main className="app-main">
      <div className="app-content stack-6">
        <div className="state state-empty">
          <h1 className="t-state-title">There's no page here</h1>
          <p className="t-secondary">The link may be old or mistyped.</p>
          <NavLink className="btn btn-secondary" to="/">
            Back to the library
          </NavLink>
        </div>
      </div>
    </main>
  );
}
