import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schema from '../../schema/song.schema.json';
import type { Song } from './generated/song';

export type { Song } from './generated/song';

export class SongParseError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`Song JSON is invalid: ${errors.join('; ')}`);
    this.name = 'SongParseError';
    this.errors = errors;
  }
}

let validator: ValidateFunction<Song> | undefined;

function getValidator(): ValidateFunction<Song> {
  if (!validator) {
    const ajv = new Ajv2020({ allErrors: true });
    addFormats(ajv);
    validator = ajv.compile<Song>(schema);
  }
  return validator;
}

function describe(error: ErrorObject): string {
  return `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`;
}

/** Validate unknown JSON against the Song schema (ADR 0002) and return it typed. */
export function parseSong(json: unknown): Song {
  const validate = getValidator();
  if (validate(json)) return json;
  throw new SongParseError((validate.errors ?? []).map(describe));
}
