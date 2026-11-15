import type { PerformanceSession, Session } from './sessions/types';
import type { Song } from './song';
import { keySpelling, pitchClassName } from './theory/keys';

export interface SongOverviewProps {
  song: Song;
  /** This song's sessions, newest first; null while they load. */
  sessions: Session[] | null;
  /** False when sessions only last for this visit (storage unavailable). */
  sessionsSaved: boolean;
  /** A stored date, ready to show. */
  formatWhen: (iso: string) => string;
  onStart: (mode: 'training' | 'performance') => void;
  onOpenResult: (session: PerformanceSession) => void;
}

const HANDS_LABEL = { right: 'right hand', left: 'left hand', both: 'both hands' } as const;
const SHOWN_SESSIONS = 5;

/** The scale's notes, spelled as the key signature spells them. */
function scaleNames(song: Song): string[] {
  const spelling = keySpelling(song.tonality.key, song.tonality.mode);
  return song.tonality.scale.map((pitchClass) => pitchClassName(pitchClass, spelling));
}

/** Each chord of the song once, in the order they first appear. */
function chordLabels(song: Song): string[] {
  return [...new Set(song.chords.map((chord) => chord.label))];
}

function sessionDetail(session: Session): string {
  return [
    `${Math.round(session.speed * 100)}% tempo`,
    HANDS_LABEL[session.hands],
    ...(session.loop ? ['a loop'] : []),
  ].join(', ');
}

function sessionScore(session: Session): string {
  if (session.mode === 'performance') return `${Math.round(session.result.score)}`;
  return `${session.result.firstTime} of ${session.result.steps} right first time`;
}

/**
 * The song at a glance, for a song opened from a file or the examples: scale, chords,
 * the two ways to practise it, and what the learner has done so far. The library and
 * the full overview (chord map, piano roll) come with the backend in P8.
 */
export function SongOverview({ song, sessions, sessionsSaved, formatWhen, onStart, onOpenResult }: SongOverviewProps) {
  const chords = chordLabels(song);
  const last = sessions?.find((s): s is PerformanceSession & { id: number } => s.mode === 'performance');

  return (
    <section className="stack-6" aria-label="Song overview">
      <div className="row">
        <button type="button" className="btn btn-primary btn-lg" onClick={() => onStart('training')}>
          Start training
        </button>
        <button type="button" className="btn btn-secondary btn-lg" onClick={() => onStart('performance')}>
          Performance
        </button>
      </div>

      <div className="card stack-4">
        <div className="stack-2">
          <h2 className="t-card-title">Scale</h2>
          <div className="row" data-overview="scale">
            {scaleNames(song).map((name, i) => (
              <span className="chip chip-mono" key={`${name}-${i}`}>
                {name}
              </span>
            ))}
          </div>
        </div>
        <div className="stack-2">
          <h2 className="t-card-title">Chords</h2>
          {chords.length === 0 ? (
            <p className="t-secondary">This song has no chords: it is a melody on its own.</p>
          ) : (
            <div className="row" data-overview="chords">
              {chords.map((label) => (
                <span className="chip" key={label}>
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <section className="card stack-4" aria-labelledby="sessions-title">
        <div className="row-between">
          <h2 className="t-card-title" id="sessions-title">
            Your sessions
          </h2>
          {last && (
            <button type="button" className="btn btn-secondary" onClick={() => onOpenResult(last)}>
              See last performance
            </button>
          )}
        </div>
        {sessions === null && <div className="skeleton" style={{ height: 'var(--control-lg)' }} role="status" aria-label="Loading your sessions" />}
        {sessions?.length === 0 && (
          <p className="t-secondary">Nothing yet. Start training, and what you practise shows up here.</p>
        )}
        {sessions?.slice(0, SHOWN_SESSIONS).map((session) => (
          <div className="card-row row-between" key={session.id} data-session={session.mode}>
            <span className="stack-1">
              <b>{session.mode === 'performance' ? 'Performance' : 'Training'}</b>
              <span className="t-muted">{[formatWhen(session.startedAt), sessionDetail(session)].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="t-mono">{sessionScore(session)}</span>
          </div>
        ))}
        {sessions !== null && sessions.length > 0 && !sessionsSaved && (
          <div className="alert alert-quiet" role="status">
            Isai can't save on this browser, so these sessions will be gone when you close the page.
          </div>
        )}
      </section>
    </section>
  );
}
