import { useState } from 'react';
import type { Hand } from './engine/activeNotes';
import type { PerformanceResult, TroubleSpot } from './engine/practice/scorer';
import { formatMs, timingWords } from './resultText';
import type { PerformanceSession } from './sessions/types';

export interface ResultsProps {
  session: PerformanceSession;
  /** The session's date, ready to show; empty to leave it out. */
  when: string;
  /** False when the result could not be saved and only lasts for this visit. */
  saved: boolean;
  /** What a bar is called for this song: "bar", or "part" when it has no beats. */
  barWord: 'bar' | 'part';
  onPlayAgain: () => void;
  onLoopInTraining: (fromBar: number, toBar: number) => void;
  onBack: () => void;
}

const HANDS_LABEL = { right: 'Right hand', left: 'Left hand', both: 'Both hands' } as const;

const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;

function barsText(from: number, to: number, word: 'bar' | 'part'): string {
  return from === to ? `${word} ${from}` : `${word}s ${from}–${to}`;
}

type HandFilter = Hand | 'both';

/**
 * The Results page. Everything comes from the finished result object and is rendered
 * once (rule 5): nothing here listens to notes.
 */
export function Results({ session, when, saved, barWord, onPlayAgain, onLoopInTraining, onBack }: ResultsProps) {
  const { result } = session;
  const meta = [
    HANDS_LABEL[session.hands],
    `${Math.round(session.speed * 100)}% tempo`,
    session.loop ? 'a loop' : 'full song',
    ...(when ? [when] : []),
  ].join(' · ');

  return (
    <section className="stack-6" aria-labelledby="results-title">
      <div className="row-between">
        <div className="stack-2">
          <span className="t-overline">{session.songTitle}</span>
          <h1 className="t-page-title" id="results-title">
            Performance results
          </h1>
          <p className="t-secondary">{meta}</p>
        </div>
        <div className="row">
          <button type="button" className="btn btn-primary btn-lg" onClick={onPlayAgain}>
            Play again
          </button>
          <button type="button" className="btn btn-secondary btn-lg" onClick={onBack}>
            Back to song
          </button>
        </div>
      </div>

      {!saved && (
        <div className="alert alert-quiet" role="status">
          Isai couldn't save this result on this browser. It will be gone when you close the page.
        </div>
      )}

      {result.total.expected === 0 ? (
        <div className="state state-empty">
          <h2 className="t-section">Too short to score</h2>
          <p className="t-secondary">
            The run ended before any note was due. Play a little longer and Isai will have notes to count.
          </p>
        </div>
      ) : (
        <Scored result={result} barWord={barWord} onLoopInTraining={onLoopInTraining} />
      )}
    </section>
  );
}

interface ScoredProps {
  result: PerformanceResult;
  barWord: 'bar' | 'part';
  onLoopInTraining: (fromBar: number, toBar: number) => void;
}

function Scored({ result, barWord, onLoopInTraining }: ScoredProps) {
  const { total } = result;
  const hits = total.expected - total.missed;
  return (
    <>
      <div className="grid-cards" aria-label="Summary">
        <div className="card-accent stack-1">
          <span className="t-overline">Score</span>
          <span className="t-stat t-mono" data-result="score">
            {Math.round(result.score)}
          </span>
          <span className="t-muted">out of 100</span>
        </div>
        <div className="card stack-1">
          <span className="t-overline">Accuracy</span>
          <span className="t-stat t-mono" data-result="accuracy">
            {percent(total.accuracy)}
          </span>
          <span className="t-muted">{`${hits} of ${total.expected} notes in time`}</span>
        </div>
        <div className="card stack-1">
          <span className="t-overline">Average timing</span>
          <span className="t-stat t-mono" data-result="timing">
            {total.meanOffset === null ? '–' : formatMs(total.meanOffset)}
          </span>
          <span className="t-muted" data-result="timing-words">
            {timingWords(total)}
          </span>
        </div>
        <div className="card stack-1">
          <span className="t-overline">Wrong notes</span>
          <span className="t-stat t-mono" data-result="wrong">
            {result.wrongNotes}
          </span>
          <span className="t-muted">{`${Math.round(result.wrongPerMinute)} a minute`}</span>
        </div>
      </div>

      <Timing result={result} />

      <section className="card stack-4" aria-labelledby="sections-title">
        <h2 className="t-card-title" id="sections-title">
          By section
        </h2>
        {result.sections.map((section) => (
          <div className="stack-1" key={`${section.label}-${section.start}`} data-section={section.label}>
            <div className="row-between">
              <span>{section.label}</span>
              <span className="t-mono">{percent(section.tally.accuracy)}</span>
            </div>
            <div className="progress">
              <span style={{ width: percent(section.tally.accuracy) }} />
            </div>
          </div>
        ))}
        <div className="row">
          {(['right', 'left'] as const).map((hand) => (
            <span className="stack-1" key={hand}>
              <span className="t-overline">{HANDS_LABEL[hand]}</span>
              <b className="t-mono" data-result={`${hand}-hand`}>
                {result.hands[hand].expected === 0 ? '–' : percent(result.hands[hand].accuracy)}
              </b>
            </span>
          ))}
        </div>
      </section>

      <section className="card stack-4" aria-labelledby="trouble-title">
        <h2 className="t-card-title" id="trouble-title">
          Trouble spots
        </h2>
        {result.troubleSpots.length === 0 ? (
          <p className="t-secondary">None. Every part of the song went well.</p>
        ) : (
          result.troubleSpots.map((spot) => (
            <TroubleRow key={spot.fromBar} spot={spot} barWord={barWord} onLoop={onLoopInTraining} />
          ))
        )}
      </section>
    </>
  );
}

interface TroubleRowProps {
  spot: TroubleSpot;
  barWord: 'bar' | 'part';
  onLoop: (fromBar: number, toBar: number) => void;
}

function TroubleRow({ spot, barWord, onLoop }: TroubleRowProps) {
  const where = barsText(spot.fromBar, spot.toBar, barWord);
  return (
    <div className="card-row row-between" data-trouble={`${spot.fromBar}-${spot.toBar}`}>
      <span className="stack-1">
        <b>{where.charAt(0).toUpperCase() + where.slice(1)}</b>
        <span className="t-muted">
          {`${percent(spot.accuracy)} in time · ${spot.missed} of ${spot.expected} notes missed`}
        </span>
      </span>
      <button type="button" className="btn btn-secondary" onClick={() => onLoop(spot.fromBar, spot.toBar)}>
        {`Loop ${where} in training`}
      </button>
    </div>
  );
}

const HAND_FILTERS: { id: HandFilter; label: string }[] = [
  { id: 'both', label: 'Both' },
  { id: 'right', label: 'Right' },
  { id: 'left', label: 'Left' },
];

/** How early or late the hit notes were, as a histogram, for both hands or one. */
function Timing({ result }: { result: PerformanceResult }) {
  // Which hand to show is a click choice, so it is ordinary React state.
  const [hand, setHand] = useState<HandFilter>('both');
  const { histogram, windows } = result;
  const counts = histogram.right.map((right, i) => {
    const left = histogram.left[i] ?? 0;
    if (hand === 'right') return right;
    return hand === 'left' ? left : right + left;
  });
  const tallest = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const binMs = Math.round(histogram.binSec * 1000);
  const edgeMs = Math.round(windows.ok * 1000);
  const perfectMs = Math.round(windows.perfect * 1000);
  // A bin is "in time" when it lies inside the perfect window.
  const inTime = (index: number) => {
    const from = -edgeMs + index * binMs;
    return from >= -perfectMs - binMs / 2 && from + binMs <= perfectMs + binMs / 2;
  };
  const inside = counts.reduce((sum, count, i) => (inTime(i) ? sum + count : sum), 0);
  const early = counts.slice(0, counts.length / 2).reduce((a, b) => a + b, 0);
  const lean = early * 2 > total ? 'most before the beat' : early * 2 < total ? 'most after the beat' : 'evenly either side';

  return (
    <section className="card stack-4" aria-labelledby="timing-title">
      <div className="row-between">
        <div className="stack-1">
          <h2 className="t-card-title" id="timing-title">
            Timing
          </h2>
          <span className="t-muted">{`Notes hit, by how early or late · perfect within ±${perfectMs} ms`}</span>
        </div>
        <div className="seg" role="group" aria-label="Hand">
          {HAND_FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="seg-btn"
              aria-pressed={hand === option.id}
              onClick={() => setHand(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div
        className="histogram"
        role="img"
        aria-label={
          total === 0
            ? 'Timing histogram: no notes hit.'
            : `Timing histogram: ${inside} of ${total} notes within ${perfectMs} milliseconds, ${lean}.`
        }
      >
        {counts.map((count, i) => (
          <span
            key={i}
            className={inTime(i) ? 'histogram-bar is-in' : 'histogram-bar'}
            data-count={count}
            style={{ height: `${(count / tallest) * 100}%` }}
          />
        ))}
      </div>
      <div className="histogram-axis" aria-hidden="true">
        <span>{`Early −${edgeMs} ms`}</span>
        <span>0</span>
        <span>{`+${edgeMs} ms Late`}</span>
      </div>
    </section>
  );
}
