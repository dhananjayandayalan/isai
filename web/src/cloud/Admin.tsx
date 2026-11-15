import { useEffect, useState } from 'react';
import { jobErrorWords } from '../api/jobErrors';
import type { AdminStats, ClientErrorRow, OpsClient } from '../api/types';

type Loaded = { state: 'loading' } | { state: 'error' } | { state: 'ready'; stats: AdminStats; errors: ClientErrorRow[] };

function minutes(seconds: number | null): string {
  if (seconds === null) return '–';
  return seconds < 90 ? `${seconds} s` : `${Math.round(seconds / 60)} min`;
}

/** The owner's view: the queue, failures, stage times, workers and web errors. */
export function Admin({ ops, formatWhen }: { ops: OpsClient; formatWhen: (iso: string) => string }) {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    Promise.all([ops.adminStats(), ops.recentErrors()]).then(
      ([stats, errors]) => current && setLoaded({ state: 'ready', stats, errors }),
      () => current && setLoaded({ state: 'error' }),
    );
    return () => {
      current = false;
    };
  }, [ops, attempt]);

  return (
    <main className="app-main">
      <div className="app-content stack-6">
        <header className="row-between">
          <h1 className="t-page-title">Admin</h1>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setLoaded({ state: 'loading' });
              setAttempt((n) => n + 1);
            }}
          >
            Refresh
          </button>
        </header>
        {loaded.state === 'loading' && <div className="skeleton" style={{ height: 160 }} aria-busy="true" />}
        {loaded.state === 'error' && (
          <div className="state state-error" role="alert">
            <h2 className="t-state-title">We couldn't load the numbers</h2>
            <p className="t-secondary">Check your connection, then refresh.</p>
          </div>
        )}
        {loaded.state === 'ready' && <Numbers stats={loaded.stats} errors={loaded.errors} formatWhen={formatWhen} />}
      </div>
    </main>
  );
}

interface NumbersProps {
  stats: AdminStats;
  errors: ClientErrorRow[];
  formatWhen: (iso: string) => string;
}

function Numbers({ stats, errors, formatWhen }: NumbersProps) {
  const tiles = [
    { label: 'Queued', value: String(stats.queued) },
    { label: 'Analysing', value: String(stats.running) },
    { label: 'Oldest in queue', value: minutes(stats.oldestQueuedSec) },
    { label: 'Done this week', value: String(stats.succeeded7d) },
    { label: 'Members', value: String(stats.members) },
    { label: 'Web errors this week', value: String(stats.clientErrors7d) },
  ];
  const failures = Object.entries(stats.failures7d).sort((a, b) => b[1] - a[1]);
  const stages = Object.entries(stats.stages).sort((a, b) => b[1].p95 - a[1].p95);
  return (
    <>
      <div className="grid-cards">
        {tiles.map((t) => (
          <div key={t.label} className="card stack-1">
            <span className="t-overline">{t.label}</span>
            <span className="t-stat">{t.value}</span>
          </div>
        ))}
      </div>

      <section className="card stack-3" aria-labelledby="workers-title">
        <h2 className="t-section" id="workers-title">
          Analysis machines
        </h2>
        {stats.workers.length === 0 ? (
          <p className="t-muted">No worker has checked in yet.</p>
        ) : (
          stats.workers.map((w) => (
            <div key={w.workerId} className="card-row row-between">
              <span className="t-mono">{w.workerId}</span>
              <span className="t-muted">
                last seen {formatWhen(w.seenAt)}
                {w.version ? ` · ${w.version}` : ''}
              </span>
            </div>
          ))
        )}
      </section>

      <section className="card stack-3" aria-labelledby="failures-title">
        <h2 className="t-section" id="failures-title">
          Failed analyses, last 7 days
        </h2>
        {failures.length === 0 ? (
          <p className="t-muted">None.</p>
        ) : (
          failures.map(([code, n]) => (
            <div key={code} className="card-row row-between">
              <span>{jobErrorWords(code).message}</span>
              <span className="t-mono">{`${code} × ${n}`}</span>
            </div>
          ))
        )}
      </section>

      <section className="card stack-3" aria-labelledby="stages-title">
        <h2 className="t-section" id="stages-title">
          Seconds per stage, last 30 days (median / 95th percentile)
        </h2>
        {stages.length === 0 ? (
          <p className="t-muted">No finished analyses yet.</p>
        ) : (
          stages.map(([stage, t]) => (
            <div key={stage} className="card-row row-between">
              <span className="t-mono">{stage}</span>
              <span className="t-mono">{`${t.p50} / ${t.p95}`}</span>
            </div>
          ))
        )}
      </section>

      <section className="card stack-3" aria-labelledby="errors-title">
        <h2 className="t-section" id="errors-title">
          Latest web errors
        </h2>
        {errors.length === 0 ? (
          <p className="t-muted">None reported.</p>
        ) : (
          errors.map((e, i) => (
            <div key={`${e.createdAt}-${i}`} className="card-row stack-1">
              <span className="t-mono">{`${e.kind} · ${e.page} · ${e.version}`}</span>
              <span>{e.message}</span>
              <span className="t-faint">{formatWhen(e.createdAt)}</span>
            </div>
          ))
        )}
      </section>
    </>
  );
}
