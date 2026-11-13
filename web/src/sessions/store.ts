// Where practice sessions are kept (ADR 0006): IndexedDB on this device now, Supabase in
// P8. Everything goes through `SessionStore`, so the pages don't know which.

import type { NewSession, Session } from './types';

export interface SessionStore {
  /** Store a session and return it with its id. */
  add(session: NewSession): Promise<Session>;
  /** The sessions of one song, newest first. */
  list(songId: string): Promise<Session[]>;
  /**
   * False once sessions are only being kept in memory (storage failed, as in some private
   * windows): they will be gone when the page closes.
   */
  readonly persistent: boolean;
}

function newestFirst(a: Session, b: Session): number {
  return b.startedAt.localeCompare(a.startedAt) || b.id - a.id;
}

/** Sessions for this visit only. Also what tests and static renders use. */
export class MemorySessionStore implements SessionStore {
  readonly persistent: boolean = false;
  private readonly sessions: Session[] = [];
  private nextId = 1;

  add(session: NewSession): Promise<Session> {
    const stored: Session = { ...session, id: this.nextId++ };
    this.sessions.push(stored);
    return Promise.resolve(stored);
  }

  list(songId: string): Promise<Session[]> {
    return Promise.resolve(this.sessions.filter((s) => s.songId === songId).sort(newestFirst));
  }
}

export const SESSIONS_DB = 'isai';
const STORE = 'sessions';
const BY_SONG = 'songId';

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/**
 * Sessions in IndexedDB. `factory` is a function because reaching `indexedDB` can itself
 * throw; the database is opened on first use and any failure rejects the call.
 */
export class IndexedDbSessionStore implements SessionStore {
  readonly persistent: boolean = true;
  private readonly factory: () => IDBFactory;
  private readonly name: string;
  private database: Promise<IDBDatabase> | null = null;

  constructor(factory: () => IDBFactory, name: string = SESSIONS_DB) {
    this.factory = factory;
    this.name = name;
  }

  async add(session: NewSession): Promise<Session> {
    const store = (await this.open()).transaction(STORE, 'readwrite').objectStore(STORE);
    const id = await settle(store.add(session));
    return { ...session, id: Number(id) };
  }

  async list(songId: string): Promise<Session[]> {
    const store = (await this.open()).transaction(STORE, 'readonly').objectStore(STORE);
    const found = (await settle(store.index(BY_SONG).getAll(songId))) as Session[];
    return found.sort(newestFirst);
  }

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory().open(this.name, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex(BY_SONG, BY_SONG);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
      request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
    });
    // A failed open is not remembered: the next call tries again.
    this.database.catch(() => {
      this.database = null;
    });
    return this.database;
  }
}

/**
 * Uses `primary` while it works. The first time it fails (private mode, no disk space),
 * sessions move to memory for the rest of the visit and `persistent` turns false, so the
 * page can say so. Nothing here throws.
 */
export class ResilientSessionStore implements SessionStore {
  private readonly primary: SessionStore;
  private readonly memory = new MemorySessionStore();
  private failed = false;

  constructor(primary: SessionStore) {
    this.primary = primary;
  }

  get persistent(): boolean {
    return !this.failed && this.primary.persistent;
  }

  async add(session: NewSession): Promise<Session> {
    if (!this.failed) {
      try {
        return await this.primary.add(session);
      } catch (error) {
        this.fail(error);
      }
    }
    return this.memory.add(session);
  }

  async list(songId: string): Promise<Session[]> {
    if (!this.failed) {
      try {
        return await this.primary.list(songId);
      } catch (error) {
        this.fail(error);
      }
    }
    return this.memory.list(songId);
  }

  private fail(error: unknown): void {
    this.failed = true;
    // For whoever checks why history isn't kept; no song or performance data in it.
    console.error('Isai: sessions cannot be saved on this device; keeping them for this visit.', error);
  }
}
