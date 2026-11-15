// A practice session as it is kept on this device (ADR 0006). The same shape becomes the
// `sessions` table in P8. No raw MIDI events: only what was chosen and how it went.

import type { PerformanceResult } from '../engine/practice/scorer';
import type { HandChoice } from '../engine/practice/steps';

/** What was chosen for a run, and when it happened. */
interface RunFacts {
  hands: HandChoice;
  /** Speed as a rate: 1 is the song's own tempo. */
  speed: number;
  /** Song seconds that were looped, or null for the whole song. */
  loop: { start: number; end: number } | null;
  /** When the run began: an ISO 8601 date and time. */
  startedAt: string;
  /** How long it lasted, in seconds on the audio clock. */
  durationSec: number;
}

interface SessionBase extends RunFacts {
  /** Shape of this record. */
  version: 1;
  songId: string;
  songTitle: string;
  schemaVersion: string;
  pipelineVersion: string;
}

export interface TrainingSummary {
  /** Steps played. */
  steps: number;
  /** Of those, the ones played with no wrong note first. */
  firstTime: number;
  wrongNotes: number;
}

export interface PerformanceSession extends SessionBase {
  mode: 'performance';
  result: PerformanceResult;
}

export interface TrainingSession extends SessionBase {
  mode: 'training';
  result: TrainingSummary;
}

/** A run as the practice screen reports it; the app adds the song to make a session. */
export type SessionDraft =
  | (RunFacts & { mode: 'performance'; result: PerformanceResult })
  | (RunFacts & { mode: 'training'; result: TrainingSummary });

/** A session before it is stored. */
export type NewSession = PerformanceSession | TrainingSession;

/** A stored session: the store gives it an id. */
export type Session = NewSession & { id: number };
