// In-memory backend for tests and static renders. Behaves like the Supabase one where the
// pages can tell: private songs, shared songs, job updates pushed to watchers.

import { MemorySessionStore } from '../sessions/store';
import type { NewSession, Session } from '../sessions/types';
import {
  SignInError,
  UploadError,
  type AccountSessionStore,
  type AdminStats,
  type Api,
  type ClientErrorRow,
  type ErrorReport,
  type OpsClient,
  type AuthClient,
  type AuthUser,
  type JobRow,
  type JobWatcher,
  type PreferencesStore,
  type SongPractice,
  type SongRow,
  type SongStore,
  type SyncedPreferences,
  type UploadClient,
  type UploadHandle,
  type UploadRequest,
} from './types';

export class FakeAuth implements AuthClient {
  user: AuthUser | null;
  /** Emails that may sign in; anything else is 'not-invited'. */
  invited = new Set<string>(['friend@example.com']);
  sent: { email: string; redirectTo: string }[] = [];
  private listeners = new Set<(user: AuthUser | null) => void>();

  constructor(user: AuthUser | null = null) {
    this.user = user;
  }

  current(): Promise<AuthUser | null> {
    return Promise.resolve(this.user);
  }

  onChange(listener: (user: AuthUser | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  sendMagicLink(email: string, redirectTo: string): Promise<void> {
    if (!this.invited.has(email.toLowerCase())) {
      return Promise.reject(new SignInError('not-invited', 'not invited'));
    }
    this.sent.push({ email, redirectTo });
    return Promise.resolve();
  }

  /** What following the emailed link does. */
  signIn(user: AuthUser): void {
    this.user = user;
    for (const listener of this.listeners) listener(user);
  }

  signOut(): Promise<void> {
    this.user = null;
    for (const listener of this.listeners) listener(null);
    return Promise.resolve();
  }
}

export class FakeSongStore implements SongStore {
  rows: SongRow[];
  songs = new Map<string, unknown>();
  failList = false;
  failLoad = false;
  removed: string[] = [];

  constructor(rows: SongRow[] = []) {
    this.rows = rows;
  }

  list(): Promise<SongRow[]> {
    if (this.failList) return Promise.reject(new Error('offline'));
    return Promise.resolve([...this.rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  get(id: string): Promise<SongRow | null> {
    return Promise.resolve(this.rows.find((row) => row.id === id) ?? null);
  }

  loadSong(row: SongRow): Promise<unknown> {
    const song = this.songs.get(row.id);
    if (this.failLoad || song === undefined) return Promise.reject(new Error('download failed'));
    return Promise.resolve(song);
  }

  downloadUrl(row: SongRow, file: 'json' | 'midi'): Promise<string> {
    return Promise.resolve(`https://files.test/${row.id}.${file === 'json' ? 'song.json' : 'mid'}`);
  }

  setShared(id: string, shared: boolean): Promise<void> {
    this.rows = this.rows.map((row) => (row.id === id ? { ...row, shared } : row));
    return Promise.resolve();
  }

  remove(row: SongRow): Promise<void> {
    this.removed.push(row.id);
    this.rows = this.rows.filter((r) => r.id !== row.id);
    return Promise.resolve();
  }
}

export class FakeJobs implements JobWatcher {
  jobs = new Map<string, JobRow>();
  positions = new Map<string, number | null>();
  private listeners = new Map<string, Set<(job: JobRow) => void>>();

  get(jobId: string): Promise<JobRow | null> {
    return Promise.resolve(this.jobs.get(jobId) ?? null);
  }

  watch(jobId: string, listener: (job: JobRow) => void): () => void {
    const set = this.listeners.get(jobId) ?? new Set();
    set.add(listener);
    this.listeners.set(jobId, set);
    return () => set.delete(listener);
  }

  queuePosition(jobId: string): Promise<number | null> {
    return Promise.resolve(this.positions.get(jobId) ?? null);
  }

  /** What the worker does: change the row and push it to watchers. */
  update(job: JobRow): void {
    this.jobs.set(job.id, job);
    for (const listener of this.listeners.get(job.id) ?? []) listener(job);
  }

  watching(jobId: string): number {
    return this.listeners.get(jobId)?.size ?? 0;
  }
}

interface PendingUpload {
  request: UploadRequest;
  progress: (fraction: number) => void;
  resolve: (ids: { songId: string; jobId: string }) => void;
  reject: (error: UploadError) => void;
}

/** Uploads wait until the test calls `finish()` or `fail()`. */
export class FakeUploads implements UploadClient {
  pending: PendingUpload[] = [];
  cancelled = 0;

  start(request: UploadRequest, onProgress: (fraction: number) => void): UploadHandle {
    let entry!: PendingUpload;
    const done = new Promise<{ songId: string; jobId: string }>((resolve, reject) => {
      entry = { request, progress: onProgress, resolve, reject };
    });
    this.pending.push(entry);
    return {
      done,
      cancel: () => {
        this.cancelled += 1;
        entry.reject(new UploadError('cancelled', 'cancelled'));
      },
    };
  }

  last(): PendingUpload {
    const entry = this.pending.at(-1);
    if (!entry) throw new Error('no upload started');
    return entry;
  }
}

export class FakeAccountSessions extends MemorySessionStore implements AccountSessionStore {
  override readonly persistent = true;
  imported: NewSession[] = [];
  practice: SongPractice[] = [];

  async addMany(sessions: NewSession[]): Promise<number> {
    this.imported.push(...sessions);
    for (const session of sessions) await this.add(session);
    return sessions.length;
  }

  summary(): Promise<SongPractice[]> {
    return Promise.resolve(this.practice);
  }

  override list(songId: string): Promise<Session[]> {
    return super.list(songId);
  }
}

export class FakePreferences implements PreferencesStore {
  saved: SyncedPreferences = {};
  load(): Promise<SyncedPreferences> {
    return Promise.resolve(this.saved);
  }
  save(preferences: SyncedPreferences): Promise<void> {
    this.saved = { ...this.saved, ...preferences };
    return Promise.resolve();
  }
}

export class FakeOps implements OpsClient {
  online = true;
  stats: AdminStats = {
    queued: 0,
    running: 0,
    oldestQueuedSec: null,
    succeeded7d: 0,
    failures7d: {},
    stages: {},
    workers: [],
    clientErrors7d: 0,
    members: 1,
  };
  errors: ClientErrorRow[] = [];
  reports: ErrorReport[] = [];
  deleted = 0;
  failStats = false;

  workerOnline(): Promise<boolean> {
    return Promise.resolve(this.online);
  }
  adminStats(): Promise<AdminStats> {
    return this.failStats ? Promise.reject(new Error('owner_only')) : Promise.resolve(this.stats);
  }
  recentErrors(): Promise<ClientErrorRow[]> {
    return Promise.resolve(this.errors);
  }
  reportError(report: ErrorReport): Promise<void> {
    this.reports.push(report);
    return Promise.resolve();
  }
  deleteAccount(): Promise<void> {
    this.deleted += 1;
    return Promise.resolve();
  }
}

export interface FakeApi extends Api {
  ops: FakeOps;
  auth: FakeAuth;
  songs: FakeSongStore;
  jobs: FakeJobs;
  uploads: FakeUploads;
  sessions: FakeAccountSessions;
  preferences: FakePreferences;
}

export function fakeApi(user: AuthUser | null = null, rows: SongRow[] = []): FakeApi {
  return {
    ops: new FakeOps(),
    auth: new FakeAuth(user),
    songs: new FakeSongStore(rows),
    jobs: new FakeJobs(),
    uploads: new FakeUploads(),
    sessions: new FakeAccountSessions(),
    preferences: new FakePreferences(),
  };
}

export const FRIEND: AuthUser = { id: 'user-1', email: 'friend@example.com', role: 'member', displayName: 'friend' };

/** A song row with sensible defaults. */
export function songRow(patch: Partial<SongRow> = {}): SongRow {
  return {
    id: 'song-1',
    ownerId: FRIEND.id,
    title: 'Maayangal',
    sourceType: 'full-mix',
    level: 'medium',
    status: 'ready',
    errorCode: null,
    key: 'D',
    mode: 'minor',
    bpm: 120.2,
    durationSec: 213.6,
    shared: false,
    createdAt: '2026-11-15T10:00:00+00:00',
    mine: true,
    jobId: 'job-1',
    ...patch,
  };
}
