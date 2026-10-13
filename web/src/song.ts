import type { ErrorObject } from 'ajv';
import validate from './generated/song.validate.js';

export type { Song } from './generated/song';
import type { Song } from './generated/song';

export class SongParseError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`Song JSON is invalid: ${errors.join('; ')}`);
    this.name = 'SongParseError';
    this.errors = errors;
  }
}

function describe(error: ErrorObject): string {
  return `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`;
}

/**
 * Validate unknown JSON against the Song schema (ADR 0002) and return it typed. The
 * validator is precompiled by `pnpm gen:types`, so nothing is compiled at runtime.
 */
export function parseSong(json: unknown): Song {
  if (validate(json)) return json;
  throw new SongParseError((validate.errors ?? []).map(describe));
}
