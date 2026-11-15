import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { jobErrorWords } from '../api/jobErrors';
import { STEPS, stepsDone } from '../api/stages';
import type { Api, JobRow, SongRow } from '../api/types';

type Loaded = { state: 'loading' } | { state: 'missing' } | { state: 'error' } | { state: 'ready'; song: SongRow };

/** An analysis in progress: queued, each step as it runs, then the song or what went wrong. */
export function JobProgress({ api }: { api: Api }) {
  const { jobId = '' } = useParams();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [job, setJob] = useState<JobRow | null>(null);
  const [position, setPosition] = useState<number | null>(null);

  useEffect(() => {
    // The page is keyed by job id (see CloudApp), so this runs once per job.
    let current = true;
    api.jobs
      .get(jobId)
      .then(async (row) => {
        if (!row) return current && setLoaded({ state: 'missing' });
        const song = await api.songs.get(row.songId);
        if (!current) return;
        if (!song) return setLoaded({ state: 'missing' });
        setJob(row);
        setLoaded({ state: 'ready', song });
      })
      .catch((error: unknown) => {
        console.error('Isai: the analysis could not be loaded.', error);
        if (current) setLoaded({ state: 'error' });
      });
    // Updates are pushed (Realtime), never polled: rule 6.
    const stop = api.jobs.watch(jobId, (row) => current && setJob(row));
    return () => {
      current = false;
      stop();
    };
  }, [api, jobId]);

  // Where it stands in the queue, refreshed whenever the job changes.
  useEffect(() => {
    if (job?.status !== 'queued') return undefined;
    let current = true;
    api.jobs.queuePosition(job.id).then(
      (n) => current && setPosition(n),
      () => current && setPosition(null),
    );
    return () => {
      current = false;
    };
  }, [api, job]);

  return (
    <main className="app-main">
      <div className="app-content stack-6">
        {loaded.state === 'loading' && (
          <div className="stack-4" aria-busy="true" aria-label="Loading the analysis">
            <div className="skeleton" style={{ height: 40, maxWidth: 360 }} />
            <div className="skeleton" style={{ height: 220 }} />
          </div>
        )}
        {loaded.state === 'missing' && (
          <div className="state state-empty">
            <h1 className="t-state-title">This analysis isn't here</h1>
            <p className="t-secondary">It may have been deleted, or the link is for someone else's song.</p>
            <Link className="btn btn-secondary" to="/">
              Back to the library
            </Link>
          </div>
        )}
        {loaded.state === 'error' && (
          <div className="state state-error" role="alert">
            <h1 className="t-state-title">We couldn't load this analysis</h1>
            <p className="t-secondary">Check your connection, then reload the page.</p>
          </div>
        )}
        {loaded.state === 'ready' && job && (
          <Progress song={loaded.song} job={job} position={job.status === 'queued' ? position : null} />
        )}
      </div>
    </main>
  );
}

function Progress({ song, job, position }: { song: SongRow; job: JobRow; position: number | null }) {
  const steps = STEPS[song.sourceType];
  const done = stepsDone(job, song.sourceType);
  const running = job.status === 'running';

  return (
    <section className="stack-6" aria-labelledby="job-title">
      <header className="stack-2">
        <span className="t-overline">Analysing</span>
        <h1 className="t-page-title" id="job-title">
          {song.title}
        </h1>
      </header>

      <div role="status" aria-live="polite" className="stack-2">
        {job.status === 'waiting_upload' && (
          <>
            <p className="t-body">This upload didn't finish, so there's nothing to analyse.</p>
            <div>
              <Link className="btn btn-primary" to="/upload">
                Upload it again
              </Link>
            </div>
          </>
        )}
        {job.status === 'queued' && (
          <p className="t-body">
            Waiting for the analysis machine.{' '}
            {position === 0 ? 'Yours is next.' : position !== null ? `${position} ${position === 1 ? 'song is' : 'songs are'} ahead of yours.` : ''}
          </p>
        )}
        {running && <p className="t-body">Isai is listening. This takes a few minutes; you can leave this page.</p>}
        {job.status === 'succeeded' && (
          <>
            <p className="t-body">Your song is ready to practise.</p>
            <div>
              <Link className="btn btn-primary btn-lg" to={`/songs/${song.id}`}>
                Open the song
              </Link>
            </div>
          </>
        )}
      </div>

      {job.status === 'failed' ? (
        <div className="state state-error" role="alert">
          <h2 className="t-state-title">{jobErrorWords(job.errorCode).message}</h2>
          <p className="t-secondary">{jobErrorWords(job.errorCode).next}</p>
          <p className="t-faint t-mono">{job.errorCode ?? 'internal'}</p>
          <Link className="btn btn-primary" to="/upload">
            Analyse a recording
          </Link>
        </div>
      ) : (
        <ol className="card stack-2" aria-label="Steps" style={{ listStyle: 'none', margin: 0 }}>
          {steps.map((step, i) => {
            const state = i < done ? 'done' : running && i === done ? 'active' : 'waiting';
            return (
              <li key={step.label} className="card-row row-between" aria-current={state === 'active' ? 'step' : undefined}>
                <span className={state === 'waiting' ? 't-muted' : 't-body'}>{step.label}</span>
                {state === 'done' && <span className="t-muted">Done</span>}
                {state === 'active' && (
                  <span className="loader-eq" aria-label="In progress">
                    <span />
                    <span />
                    <span />
                    <span />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
