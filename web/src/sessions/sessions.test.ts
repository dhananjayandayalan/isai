import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IndexedDbSessionStore, MemorySessionStore, ResilientSessionStore, type SessionStore } from './store';
import type { NewSession } from './types';
import { formatWhen, isoNow } from './wallClock';

function training(songId: string, startedAt: string, steps = 14): NewSession {
  return {
    version: 1,
    songId,
    songTitle: 'Twinkle',
    schemaVersion: '0.1.0',
    pipelineVersion: '0.1.0',
    mode: 'training',
    hands: 'right',
    speed: 0.6,
    loop: { start: 0, end: 4.8 },
    startedAt,
    durationSec: 31.5,
    result: { steps, firstTime: 10, wrongNotes: 4 },
  };
}

/** A store that fails every call, as IndexedDB does in some private windows. */
const broken: SessionStore = {
  persistent: true,
  add: () => Promise.reject(new Error('QuotaExceededError')),
  list: () => Promise.reject(new Error('InvalidStateError')),
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each([
  ['memory', () => new MemorySessionStore()],
  ['IndexedDB', () => new IndexedDbSessionStore(() => new IDBFactory())],
] as const)('%s session store', (_name, create) => {
  it('gives each session an id and lists a song newest first', async () => {
    const store = create();
    const a = await store.add(training('song-a', '2026-11-10T09:00:00.000Z'));
    const b = await store.add(training('song-a', '2026-11-12T09:00:00.000Z'));
    await store.add(training('song-b', '2026-11-11T09:00:00.000Z'));
    expect(a.id).not.toBe(b.id);
    const listed = await store.list('song-a');
    expect(listed.map((s) => s.startedAt)).toEqual(['2026-11-12T09:00:00.000Z', '2026-11-10T09:00:00.000Z']);
    expect(listed[1]).toEqual({ ...training('song-a', '2026-11-10T09:00:00.000Z'), id: a.id });
    expect(await store.list('nobody')).toEqual([]);
  });

  it('orders sessions started in the same instant by id', async () => {
    const store = create();
    const first = await store.add(training('song-a', '2026-11-10T09:00:00.000Z', 1));
    const second = await store.add(training('song-a', '2026-11-10T09:00:00.000Z', 2));
    expect((await store.list('song-a')).map((s) => s.id)).toEqual([second.id, first.id]);
  });
});

describe('IndexedDB session store', () => {
  it('survives a reload: a new store on the same database sees the sessions', async () => {
    const database = new IDBFactory();
    const before = new IndexedDbSessionStore(() => database);
    expect(before.persistent).toBe(true);
    await before.add(training('song-a', '2026-11-10T09:00:00.000Z'));
    const after = new IndexedDbSessionStore(() => database);
    expect(await after.list('song-a')).toHaveLength(1);
    const next = await after.add(training('song-a', '2026-11-11T09:00:00.000Z'));
    expect(next.id).toBe(2);
  });

  it('rejects when IndexedDB cannot be reached, and tries again next time', async () => {
    let available = false;
    const database = new IDBFactory();
    const store = new IndexedDbSessionStore(() => {
      if (!available) throw new Error('SecurityError');
      return database;
    });
    await expect(store.list('song-a')).rejects.toThrow('SecurityError');
    available = true;
    expect(await store.list('song-a')).toEqual([]);
  });

  it('rejects a session whose transaction does not commit, and keeps nothing of it', async () => {
    const database = new IDBFactory();
    const store = new IndexedDbSessionStore(() => database);
    const saved = await store.add(training('song-a', '2026-11-10T09:00:00.000Z'));
    // Same key again: the request fails and the transaction aborts.
    const clash = { ...training('song-a', '2026-11-11T09:00:00.000Z'), id: saved.id } as unknown as NewSession;
    await expect(store.add(clash)).rejects.toThrow();
    expect((await store.list('song-a')).map((s) => s.startedAt)).toEqual(['2026-11-10T09:00:00.000Z']);
  });
});

describe('resilient session store', () => {
  it('uses the primary store while it works', async () => {
    const primary = new IndexedDbSessionStore(() => new IDBFactory());
    const store = new ResilientSessionStore(primary);
    await store.add(training('song-a', '2026-11-10T09:00:00.000Z'));
    expect(store.persistent).toBe(true);
    expect(await primary.list('song-a')).toHaveLength(1);
    expect(await store.list('song-a')).toHaveLength(1);
  });

  it('falls back to memory when saving fails, and says it is no longer persistent', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = new ResilientSessionStore(broken);
    expect(store.persistent).toBe(true);
    const saved = await store.add(training('song-a', '2026-11-10T09:00:00.000Z'));
    expect(saved.id).toBe(1);
    expect(store.persistent).toBe(false);
    await store.add(training('song-a', '2026-11-11T09:00:00.000Z'));
    expect(await store.list('song-a')).toHaveLength(2);
    expect(log).toHaveBeenCalledTimes(1); // said once, not on every call
  });

  it('falls back to memory when listing fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = new ResilientSessionStore(broken);
    expect(await store.list('song-a')).toEqual([]);
    expect(store.persistent).toBe(false);
  });

  it('is not persistent on top of a memory store', () => {
    expect(new ResilientSessionStore(new MemorySessionStore()).persistent).toBe(false);
  });
});

describe('wall clock', () => {
  it('gives the current date and time as ISO 8601', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T07:22:05.000Z'));
    expect(isoNow()).toBe('2026-11-13T07:22:05.000Z');
    vi.useRealTimers();
  });

  it('formats a stored date for display, and gives nothing for nonsense', () => {
    const shown = formatWhen('2026-11-13T12:52:00', 'en-GB');
    expect(shown).toContain('13 Nov');
    expect(shown).toContain('12:52');
    expect(formatWhen('not a date')).toBe('');
  });
});
