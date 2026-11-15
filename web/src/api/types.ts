// What the pages need from the backend (ADR 0015). Supabase implements these in
// `supabase/`; tests and static renders use `fakes.ts`. Nothing outside src/api/ imports
// @supabase/* (CLAUDE.md rule 10).

import type { SessionStore } from '../sessions/store';
import type { NewSession } from '../sessions/types';

export type Role = 'owner' | 'member';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  displayName: string | null;
}

export type SignInProblem = 'not-invited' | 'rate-limited' | 'network' | 'unknown';

export class SignInError extends Error {
  readonly problem: SignInProblem;
  constructor(problem: SignInProblem, message: string) {
    super(message);
    this.problem = problem;
  }
}

export interface AuthClient {
  /** The signed-in user, or null. */
  current(): Promise<AuthUser | null>;
  /** Called with the user after every sign-in and sign-out; returns an unsubscribe. */
  onChange(listener: (user: AuthUser | null) => void): () => void;
  /** Email a sign-in link that comes back to `redirectTo`. Rejects with SignInError. */
  sendMagicLink(email: string, redirectTo: string): Promise<void>;
  signOut(): Promise<void>;
}

export const SOURCE_TYPES = ['piano-solo', 'full-mix', 'a-cappella'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const LEVELS = ['easy', 'medium', 'full'] as const;
export type Level = (typeof LEVELS)[number];
export type SongStatus = 'analysing' | 'ready' | 'failed';

/** A song in the library: the row's summary, not the Song itself. */
export interface SongRow {
  id: string;
  ownerId: string;
  title: string;
  sourceType: SourceType;
  level: Level;
  status: SongStatus;
  errorCode: string | null;
  key: string | null;
  mode: string | null;
  bpm: number | null;
  durationSec: number | null;
  shared: boolean;
  /** ISO 8601. */
  createdAt: string;
  /** True when the signed-in user owns it (false for a song another member shares). */
  mine: boolean;
  /** The analysis job, while there is one to show. */
  jobId: string | null;
}

export interface SongStore {
  /** Your songs and the ones others share, newest first. */
  list(): Promise<SongRow[]>;
  get(id: string): Promise<SongRow | null>;
  /** The Song JSON of a ready song (to be parsed and validated by the caller). */
  loadSong(row: SongRow): Promise<unknown>;
  /** A short-lived link that downloads the Song JSON or the MIDI file. */
  downloadUrl(row: SongRow, file: 'json' | 'midi'): Promise<string>;
  setShared(id: string, shared: boolean): Promise<void>;
  /** Delete the song, its files and its sessions. */
  remove(row: SongRow): Promise<void>;
}

export type JobStatus = 'waiting_upload' | 'queued' | 'running' | 'succeeded' | 'failed';

export interface JobRow {
  id: string;
  songId: string;
  status: JobStatus;
  /** The step in progress or last finished: `download`, a pipeline stage, `save`. */
  stage: string | null;
  attempts: number;
  errorCode: string | null;
  /** Seconds per finished step. */
  timings: Record<string, number>;
}

export interface JobWatcher {
  get(jobId: string): Promise<JobRow | null>;
  /** Live updates of one job (Realtime, no polling: rule 6); returns an unsubscribe. */
  watch(jobId: string, listener: (job: JobRow) => void): () => void;
  /** Queued jobs ahead of this one, or null once it isn't queued. */
  queuePosition(jobId: string): Promise<number | null>;
}

export interface UploadRequest {
  file: File;
  title: string;
  sourceType: SourceType;
  level: Level;
}

export type UploadProblem = 'daily-cap' | 'unsupported' | 'too-big' | 'network' | 'cancelled' | 'unknown';

export class UploadError extends Error {
  readonly problem: UploadProblem;
  constructor(problem: UploadProblem, message: string) {
    super(message);
    this.problem = problem;
  }
}

export interface UploadHandle {
  /** Resolves with the new song and job once the file is uploaded and the job queued. */
  done: Promise<{ songId: string; jobId: string }>;
  /** Stop the upload; the song row is removed and `done` rejects with 'cancelled'. */
  cancel(): void;
}

export interface UploadClient {
  start(request: UploadRequest, onProgress: (fraction: number) => void): UploadHandle;
}

/** Notation choices that follow the learner across devices (the rest stays per device). */
export interface SyncedPreferences {
  notation?: string;
  octaves?: boolean;
  swaraDetail?: string;
  minorSolfege?: string;
}

export interface PreferencesStore {
  load(): Promise<SyncedPreferences>;
  save(preferences: SyncedPreferences): Promise<void>;
}

/** Sessions in the account; `addMany` is for importing this device's sessions once. */
export interface AccountSessionStore extends SessionStore {
  addMany(sessions: NewSession[]): Promise<number>;
  /** The newest session of each song, with counts and the best score, for the library. */
  summary(): Promise<SongPractice[]>;
}

export interface SongPractice {
  songId: string;
  songTitle: string;
  sessions: number;
  /** Best performance score (0–100), or null if only trained. */
  bestScore: number | null;
  /** ISO 8601 of the latest session. */
  lastAt: string;
}

export interface Api {
  auth: AuthClient;
  songs: SongStore;
  jobs: JobWatcher;
  uploads: UploadClient;
  sessions: AccountSessionStore;
  preferences: PreferencesStore;
}
