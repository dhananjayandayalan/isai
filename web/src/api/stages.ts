// The steps an analysis goes through, per kind of recording, as the job progress page
// shows them. `stage` names are the worker's (`download`, `save`) and the pipeline's.

import type { JobRow, SourceType } from './types';

export interface Step {
  /** The stage names that count as this step being done. */
  stages: readonly string[];
  label: string;
}

const START: Step = { stages: ['download', 'ingest'], label: 'Reading the recording' };
const RHYTHM: Step = { stages: ['rhythm'], label: 'Finding the beat' };
const KEY: Step = { stages: ['tonality'], label: 'Finding the key' };
const CHORDS: Step = { stages: ['harmony'], label: 'Working out the chords' };
const SAVE: Step = { stages: ['save'], label: 'Writing your arrangement' };

export const STEPS: Record<SourceType, readonly Step[]> = {
  'full-mix': [
    START,
    { stages: ['separate'], label: 'Separating voice, bass and drums' },
    RHYTHM,
    KEY,
    { stages: ['melody', 'bass'], label: 'Following the melody and bass' },
    CHORDS,
    SAVE,
  ],
  'piano-solo': [START, RHYTHM, KEY, { stages: ['piano'], label: 'Hearing every piano note' }, CHORDS, SAVE],
  'a-cappella': [START, RHYTHM, KEY, { stages: ['melody'], label: 'Following the melody' }, CHORDS, SAVE],
};

/**
 * How many steps are done. The worker writes `stage` as each pipeline stage finishes
 * (and `download` / `save` as those begin), so a step counts as done once every one of its
 * stages has a timing.
 */
export function stepsDone(job: JobRow, sourceType: SourceType): number {
  if (job.status === 'succeeded') return STEPS[sourceType].length;
  let done = 0;
  for (const step of STEPS[sourceType]) {
    if (!step.stages.every((stage) => stage in job.timings)) break;
    done += 1;
  }
  return done;
}
