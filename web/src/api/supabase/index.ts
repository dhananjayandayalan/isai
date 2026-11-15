// The backend over Supabase (ADR 0015). The only module tree that imports @supabase/*
// (CLAUDE.md rule 10, enforced by ESLint).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NewSession, Session } from '../../sessions/types';
import {
  SignInError,
  SOURCE_TYPES,
  UploadError,
  type AccountSessionStore,
  type AdminStats,
  type Api,
  type ClientErrorRow,
  type ErrorKind,
  type ErrorReport,
  type OpsClient,
  type AuthClient,
  type AuthUser,
  type JobRow,
  type JobStatus,
  type JobWatcher,
  type Level,
  type PreferencesStore,
  type Role,
  type SongPractice,
  type SongRow,
  type SongStatus,
  type SongStore,
  type SourceType,
  type SyncedPreferences,
  type UploadClient,
  type UploadHandle,
  type UploadRequest,
} from '../types';

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''));
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Signed URLs for Song files last 10 minutes (spec P8). */
const SIGNED_URL_SECONDS = 600;

export function createSupabaseApi(url: string, anonKey: string): Api {
  const client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  return apiFromClient(client, url, anonKey);
}

/** The same API over a client made elsewhere (the end-to-end test signs in its own). */
export function apiFromClient(client: SupabaseClient, url: string, anonKey: string): Api {
  return {
    ops: new SupabaseOps(client),
    auth: new SupabaseAuth(client),
    songs: new SupabaseSongs(client),
    jobs: new SupabaseJobs(client),
    uploads: new SupabaseUploads(client, url, anonKey),
    sessions: new SupabaseSessions(client),
    preferences: new SupabasePreferences(client),
  };
}

async function userId(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('not signed in');
  return id;
}

// -- auth ---------------------------------------------------------------------------------

export class SupabaseAuth implements AuthClient {
  private readonly client: SupabaseClient;
  constructor(client: SupabaseClient) {
    this.client = client;
  }

  private async profile(id: string, email: string): Promise<AuthUser> {
    const { data } = await this.client.from('profiles').select('role, display_name').eq('id', id).maybeSingle();
    const row = (data ?? {}) as Row;
    const role: Role = row.role === 'owner' ? 'owner' : 'member';
    return { id, email, role, displayName: strOrNull(row.display_name) };
  }

  async current(): Promise<AuthUser | null> {
    const { data } = await this.client.auth.getSession();
    const user = data.session?.user;
    return user ? this.profile(user.id, user.email ?? '') : null;
  }

  onChange(listener: (user: AuthUser | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return;
      const user = session?.user;
      if (!user) {
        listener(null);
        return;
      }
      // Leave the auth callback before querying (supabase-js holds a lock during it).
      void Promise.resolve().then(() => this.profile(user.id, user.email ?? '').then(listener));
    });
    return () => data.subscription.unsubscribe();
  }

  async sendMagicLink(email: string, redirectTo: string): Promise<void> {
    const { error } = await this.client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    });
    if (!error) return;
    const text = `${error.message} ${(error as { code?: string }).code ?? ''}`.toLowerCase();
    // The sign-up trigger rejects emails without an invite; Auth reports a database error.
    if (text.includes('database error') || text.includes('not_invited') || error.status === 500) {
      throw new SignInError('not-invited', error.message);
    }
    if (error.status === 429 || text.includes('rate')) throw new SignInError('rate-limited', error.message);
    if (text.includes('fetch')) throw new SignInError('network', error.message);
    throw new SignInError('unknown', error.message);
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }
}

// -- songs --------------------------------------------------------------------------------

function sourceType(v: unknown): SourceType {
  return (SOURCE_TYPES as readonly string[]).includes(str(v)) ? (str(v) as SourceType) : 'full-mix';
}

function toSongRow(row: Row, me: string): SongRow {
  const jobs = Array.isArray(row.jobs) ? (row.jobs as Row[]) : row.jobs ? [row.jobs as Row] : [];
  return {
    id: str(row.id),
    ownerId: str(row.owner_id),
    title: str(row.title),
    sourceType: sourceType(row.source_type),
    level: (['easy', 'medium', 'full'].includes(str(row.level)) ? row.level : 'medium') as Level,
    status: (['analysing', 'ready', 'failed'].includes(str(row.status)) ? row.status : 'failed') as SongStatus,
    errorCode: strOrNull(row.error_code),
    key: strOrNull(row.key),
    mode: strOrNull(row.mode),
    bpm: numOrNull(row.bpm),
    durationSec: numOrNull(row.duration_sec),
    shared: row.shared === true,
    createdAt: str(row.created_at),
    mine: str(row.owner_id) === me,
    jobId: jobs[0] ? str(jobs[0].id) : null,
  };
}

const SONG_COLUMNS =
  'id, owner_id, title, source_type, level, status, error_code, key, mode, bpm, duration_sec, ' +
  'shared, created_at, song_path, midi_path, jobs(id)';

export class SupabaseSongs implements SongStore {
  private readonly client: SupabaseClient;
  private readonly paths = new Map<string, { song: string | null; midi: string | null }>();
  constructor(client: SupabaseClient) {
    this.client = client;
  }

  private remember(rows: Row[]): void {
    for (const row of rows) {
      this.paths.set(str(row.id), { song: strOrNull(row.song_path), midi: strOrNull(row.midi_path) });
    }
  }

  async list(): Promise<SongRow[]> {
    const me = await userId(this.client);
    const { data, error } = await this.client
      .from('songs')
      .select(SONG_COLUMNS)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Row[];
    this.remember(rows);
    return rows.map((row) => toSongRow(row, me));
  }

  async get(id: string): Promise<SongRow | null> {
    const me = await userId(this.client);
    const { data, error } = await this.client.from('songs').select(SONG_COLUMNS).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    this.remember([data as unknown as Row]);
    return toSongRow(data as unknown as Row, me);
  }

  private async path(row: SongRow, file: 'json' | 'midi'): Promise<string> {
    if (!this.paths.has(row.id)) await this.get(row.id);
    const paths = this.paths.get(row.id);
    const path = file === 'json' ? paths?.song : paths?.midi;
    if (!path) throw new Error('this song has no files yet');
    return path;
  }

  async loadSong(row: SongRow): Promise<unknown> {
    const { data, error } = await this.client.storage.from('songs').download(await this.path(row, 'json'));
    if (error) throw new Error(error.message);
    return JSON.parse(await data.text()) as unknown;
  }

  async downloadUrl(row: SongRow, file: 'json' | 'midi'): Promise<string> {
    const name = `${row.title.replace(/[\\/:*?"<>|]+/g, '_')}.${file === 'json' ? 'song.json' : 'mid'}`;
    const { data, error } = await this.client.storage
      .from('songs')
      .createSignedUrl(await this.path(row, file), SIGNED_URL_SECONDS, { download: name });
    if (error) throw new Error(error.message);
    return data.signedUrl;
  }

  async setShared(id: string, shared: boolean): Promise<void> {
    const { error } = await this.client.from('songs').update({ shared }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async remove(row: SongRow): Promise<void> {
    const paths = this.paths.get(row.id);
    const files = [paths?.song, paths?.midi].filter((p): p is string => typeof p === 'string');
    if (files.length > 0) {
      const { error } = await this.client.storage.from('songs').remove(files);
      if (error) throw new Error(error.message);
    }
    const { error } = await this.client.from('songs').delete().eq('id', row.id);
    if (error) throw new Error(error.message);
    this.paths.delete(row.id);
  }
}

// -- jobs ---------------------------------------------------------------------------------

const JOB_STATUSES: readonly JobStatus[] = ['waiting_upload', 'queued', 'running', 'succeeded', 'failed'];

function toJobRow(row: Row): JobRow {
  const timings: Record<string, number> = {};
  if (row.timings && typeof row.timings === 'object') {
    for (const [k, v] of Object.entries(row.timings as Row)) if (typeof v === 'number') timings[k] = v;
  }
  return {
    id: str(row.id),
    songId: str(row.song_id),
    status: (JOB_STATUSES as readonly string[]).includes(str(row.status)) ? (row.status as JobStatus) : 'failed',
    stage: strOrNull(row.stage),
    attempts: typeof row.attempts === 'number' ? row.attempts : 0,
    errorCode: strOrNull(row.error_code),
    timings,
  };
}

export class SupabaseJobs implements JobWatcher {
  private readonly client: SupabaseClient;
  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async get(jobId: string): Promise<JobRow | null> {
    const { data, error } = await this.client
      .from('jobs')
      .select('id, song_id, status, stage, attempts, error_code, timings')
      .eq('id', jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toJobRow(data as Row) : null;
  }

  watch(jobId: string, listener: (job: JobRow) => void): () => void {
    const channel = this.client
      .channel(`job-${jobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}` },
        (payload) => listener(toJobRow(payload.new as Row)),
      )
      .subscribe((status) => {
        // Anything that changed before the subscription took hold is read once.
        if (status === 'SUBSCRIBED') void this.get(jobId).then((job) => job && listener(job));
      });
    return () => {
      void this.client.removeChannel(channel);
    };
  }

  async queuePosition(jobId: string): Promise<number | null> {
    const { data, error } = await this.client.rpc('queue_position', { p_job_id: jobId });
    if (error) throw new Error(error.message);
    return typeof data === 'number' ? data : null;
  }
}

// -- uploads ------------------------------------------------------------------------------

const MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  webm: 'audio/webm',
};

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export class SupabaseUploads implements UploadClient {
  private readonly client: SupabaseClient;
  private readonly anonKey: string;
  constructor(client: SupabaseClient, _url: string, anonKey: string) {
    this.client = client;
    this.anonKey = anonKey;
  }

  start(request: UploadRequest, onProgress: (fraction: number) => void): UploadHandle {
    let xhr: XMLHttpRequest | null = null;
    let cancelled = false;
    let songId: string | null = null;

    const done = (async () => {
      const ext = extensionOf(request.file.name);
      const { data, error } = await this.client.rpc('create_upload', {
        p_title: request.title,
        p_source_type: request.sourceType,
        p_level: request.level,
        p_ext: ext,
      });
      if (error) {
        if (error.message.includes('daily_cap')) throw new UploadError('daily-cap', error.message);
        if (error.message.includes('unsupported_file')) throw new UploadError('unsupported', error.message);
        throw new UploadError('unknown', error.message);
      }
      const row = (Array.isArray(data) ? data[0] : data) as Row;
      songId = str(row.song_id);
      const jobId = str(row.job_id);
      const path = str(row.upload_path);
      if (cancelled) throw new UploadError('cancelled', 'cancelled');

      const signed = await this.client.storage.from('uploads').createSignedUploadUrl(path);
      if (signed.error) throw new UploadError('unknown', signed.error.message);
      const contentType = MIME_BY_EXT[ext] ?? (request.file.type || 'application/octet-stream');
      await new Promise<void>((resolve, reject) => {
        const req = new XMLHttpRequest();
        xhr = req;
        req.open('PUT', signed.data.signedUrl);
        req.setRequestHeader('content-type', contentType);
        req.setRequestHeader('x-upsert', 'false');
        req.setRequestHeader('apikey', this.anonKey);
        req.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(e.loaded / e.total);
        };
        req.onload = () => {
          if (req.status >= 200 && req.status < 300) resolve();
          else if (req.status === 413) reject(new UploadError('too-big', 'too big'));
          else if (req.status === 415 || req.status === 400) reject(new UploadError('unsupported', req.responseText));
          else reject(new UploadError('unknown', `upload failed (${req.status})`));
        };
        req.onerror = () => reject(new UploadError('network', 'connection dropped'));
        req.onabort = () => reject(new UploadError('cancelled', 'cancelled'));
        req.send(request.file);
      });
      onProgress(1);
      const submitted = await this.client.rpc('submit_job', { p_job_id: jobId });
      if (submitted.error) throw new UploadError('unknown', submitted.error.message);
      return { songId, jobId };
    })();

    // A failed or cancelled upload leaves no song behind.
    done.catch(() => {
      if (songId) void this.client.from('songs').delete().eq('id', songId);
    });

    return {
      done,
      cancel: () => {
        cancelled = true;
        (xhr as XMLHttpRequest | null)?.abort();
      },
    };
  }
}

// -- sessions -----------------------------------------------------------------------------

function toRecord(session: NewSession, user: string): Row {
  return {
    user_id: user,
    song_id: session.songId,
    song_title: session.songTitle,
    schema_version: session.schemaVersion,
    pipeline_version: session.pipelineVersion,
    version: session.version,
    mode: session.mode,
    started_at: session.startedAt,
    duration_sec: session.durationSec,
    speed: session.speed,
    hands: session.hands,
    loop: session.loop,
    result: session.result,
  };
}

function toSession(row: Row): Session {
  return {
    id: Number(row.id),
    version: 1,
    songId: str(row.song_id),
    songTitle: str(row.song_title),
    schemaVersion: str(row.schema_version),
    pipelineVersion: str(row.pipeline_version),
    mode: row.mode === 'performance' ? 'performance' : 'training',
    startedAt: str(row.started_at),
    durationSec: Number(row.duration_sec),
    speed: Number(row.speed),
    hands: row.hands as Session['hands'],
    loop: (row.loop ?? null) as Session['loop'],
    result: row.result as never,
  } as Session;
}

export class SupabaseSessions implements AccountSessionStore {
  readonly persistent = true;
  private readonly client: SupabaseClient;
  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async add(session: NewSession): Promise<Session> {
    const { data, error } = await this.client
      .from('sessions')
      .insert(toRecord(session, await userId(this.client)))
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return { ...session, id: Number((data as Row).id) };
  }

  async list(songId: string): Promise<Session[]> {
    const { data, error } = await this.client
      .from('sessions')
      .select('*')
      .eq('song_id', songId)
      .order('started_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Row[]).map(toSession);
  }

  async addMany(sessions: NewSession[]): Promise<number> {
    if (sessions.length === 0) return 0;
    const user = await userId(this.client);
    const { error, count } = await this.client
      .from('sessions')
      .upsert(
        sessions.map((s) => toRecord(s, user)),
        { onConflict: 'user_id,song_id,started_at', ignoreDuplicates: true, count: 'exact' },
      );
    if (error) throw new Error(error.message);
    return count ?? sessions.length;
  }

  async summary(): Promise<SongPractice[]> {
    const { data, error } = await this.client
      .from('sessions')
      .select('song_id, song_title, mode, started_at, result->score')
      .order('started_at', { ascending: false });
    if (error) throw new Error(error.message);
    const bySong = new Map<string, SongPractice>();
    for (const row of (data ?? []) as Row[]) {
      const id = str(row.song_id);
      const score = row.mode === 'performance' ? numOrNull(row.score) : null;
      const entry = bySong.get(id);
      if (!entry) {
        bySong.set(id, { songId: id, songTitle: str(row.song_title), sessions: 1, bestScore: score, lastAt: str(row.started_at) });
      } else {
        entry.sessions += 1;
        if (score !== null && (entry.bestScore === null || score > entry.bestScore)) entry.bestScore = score;
      }
    }
    return [...bySong.values()];
  }
}

// -- preferences --------------------------------------------------------------------------

export class SupabasePreferences implements PreferencesStore {
  private readonly client: SupabaseClient;
  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async load(): Promise<SyncedPreferences> {
    const { data } = await this.client.from('profiles').select('preferences').eq('id', await userId(this.client)).maybeSingle();
    const prefs = ((data ?? {}) as Row).preferences;
    return prefs && typeof prefs === 'object' ? (prefs as SyncedPreferences) : {};
  }

  async save(preferences: SyncedPreferences): Promise<void> {
    const id = await userId(this.client);
    const current = await this.load();
    const { error } = await this.client.from('profiles').update({ preferences: { ...current, ...preferences } }).eq('id', id);
    if (error) throw new Error(error.message);
  }
}

// -- operations ---------------------------------------------------------------------------

export class SupabaseOps implements OpsClient {
  private readonly client: SupabaseClient;
  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async workerOnline(): Promise<boolean> {
    const { data, error } = await this.client.rpc('worker_online');
    if (error) throw new Error(error.message);
    return data === true;
  }

  async adminStats(): Promise<AdminStats> {
    const { data, error } = await this.client.rpc('admin_stats');
    if (error) throw new Error(error.message);
    return data as AdminStats;
  }

  async recentErrors(): Promise<ClientErrorRow[]> {
    const { data, error } = await this.client
      .from('client_errors')
      .select('kind, message, page, version, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Row[]).map((r) => ({
      kind: str(r.kind) as ErrorKind,
      message: str(r.message),
      page: str(r.page),
      version: str(r.version),
      createdAt: str(r.created_at),
    }));
  }

  async reportError(report: ErrorReport): Promise<void> {
    const { error } = await this.client.from('client_errors').insert({
      kind: report.kind,
      message: report.message.slice(0, 300),
      page: report.page.slice(0, 100),
      version: report.version.slice(0, 40),
    });
    if (error) throw new Error(error.message);
  }

  async deleteAccount(): Promise<void> {
    const id = await userId(this.client);
    // Files first: SQL can't delete storage objects, and the songs policy lets you delete yours.
    const { data: files } = await this.client.storage.from('songs').list(id, { limit: 1000 });
    const paths = (files ?? []).filter((f) => f.id !== null).map((f) => `${id}/${f.name}`);
    if (paths.length > 0) {
      const { error } = await this.client.storage.from('songs').remove(paths);
      if (error) throw new Error(error.message);
    }
    const { error } = await this.client.rpc('delete_my_account');
    if (error) throw new Error(error.message);
    await this.client.auth.signOut({ scope: 'local' });
  }
}
