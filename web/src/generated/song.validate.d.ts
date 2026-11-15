/* Generated from schema/song.schema.json by `pnpm gen:types`. Do not edit by hand. */
import type { ErrorObject } from 'ajv';
import type { Song } from './song';

export interface SongValidateFunction {
  (data: unknown): data is Song;
  errors?: ErrorObject[] | null;
}

export declare const validate: SongValidateFunction;
export default validate;
