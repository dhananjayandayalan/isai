// Why an analysis failed, in the learner's words (STYLE_GUIDE §7). The codes and words are
// shared with the worker through schema/job-errors.json.

import words from '../../../schema/job-errors.json';

export interface JobErrorWords {
  message: string;
  next: string;
}

const TABLE = words as unknown as Record<string, JobErrorWords | string>;

export const JOB_ERROR_CODES: readonly string[] = Object.keys(TABLE).filter((code) => !code.startsWith('$'));

/** The words for a code; unknown codes read as an internal error. */
export function jobErrorWords(code: string | null): JobErrorWords {
  const entry = code !== null ? TABLE[code] : undefined;
  if (entry && typeof entry === 'object') return entry;
  return TABLE.internal as JobErrorWords;
}
