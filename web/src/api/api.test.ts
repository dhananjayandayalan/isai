// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import words from '../../../schema/job-errors.json';
import { SyncedSettingsStore } from '../cloud/syncedSettings';
import { formatDuration, linkExpired } from '../cloud/format';
import { IndexedDbSessionStore } from '../sessions/store';
import type { NewSession } from '../sessions/types';
import { MemorySettingsStore } from '../settings/store';
import { FakePreferences } from './fakes';
import { JOB_ERROR_CODES, jobErrorWords } from './jobErrors';
import { STEPS, stepsDone } from './stages';
import type { JobRow } from './types';

describe('job error words', () => {
  it('covers every code the worker writes, in plain words', () => {
    expect(JOB_ERROR_CODES).toEqual(Object.keys(words).filter((k) => !k.startsWith('$')));
    expect(JOB_ERROR_CODES).toContain('upload_expired');
    for (const code of JOB_ERROR_CODES) {
      const { message, next } = jobErrorWords(code);
      expect(message.length).toBeGreaterThan(0);
      expect(next.length).toBeGreaterThan(0);
      expect(message).not.toMatch(/!|_/); // STYLE_GUIDE §7: no exclamation marks, no codes
    }
  });

  it('reads an unknown or missing code as internal', () => {
    expect(jobErrorWords('martian')).toEqual(jobErrorWords('internal'));
    expect(jobErrorWords(null)).toEqual(jobErrorWords('internal'));
  });
});

describe('analysis steps', () => {
  const job = (patch: Partial<JobRow>): JobRow => ({
    id: 'j',
    songId: 's',
    status: 'running',
    stage: null,
    attempts: 1,
    errorCode: null,
    timings: {},
    ...patch,
  });

  it('counts a step once all its stages have finished, in order', () => {
    expect(stepsDone(job({}), 'full-mix')).toBe(0);
    expect(stepsDone(job({ timings: { download: 1 } }), 'full-mix')).toBe(0);
    expect(stepsDone(job({ timings: { download: 1, ingest: 1, separate: 2, rhythm: 1 } }), 'full-mix')).toBe(3);
    // melody without bass isn't the full step yet
    expect(
      stepsDone(job({ timings: { download: 1, ingest: 1, separate: 2, rhythm: 1, tonality: 1, melody: 1 } }), 'full-mix'),
    ).toBe(4);
    expect(stepsDone(job({ timings: { download: 1, ingest: 1, rhythm: 1, tonality: 1, piano: 9 } }), 'piano-solo')).toBe(4);
  });

  it('is complete once the job succeeded', () => {
    for (const type of ['full-mix', 'piano-solo', 'a-cappella'] as const) {
      expect(stepsDone(job({ status: 'succeeded' }), type)).toBe(STEPS[type].length);
    }
  });
});

describe('synced settings', () => {
  it('sends notation choices to the account and keeps the rest on this device', async () => {
    const remote = new FakePreferences();
    const store = new SyncedSettingsStore(new MemorySettingsStore(), remote);
    store.save({ notation: 'solfege', keyboardSize: 61 });
    await Promise.resolve();
    expect(remote.saved).toEqual({ notation: 'solfege' });
    expect(store.load().keyboardSize).toBe(61);
    store.save({ metronome: true });
    expect(remote.saved).toEqual({ notation: 'solfege' });
  });

  it("takes the account's choices at sign-in, dropping anything invalid", async () => {
    const remote = new FakePreferences();
    remote.saved = { notation: 'swaras', octaves: true, minorSolfege: 'klingon' };
    const store = new SyncedSettingsStore(new MemorySettingsStore(), remote);
    const settings = await store.pull();
    expect(settings.notation).toBe('swaras');
    expect(settings.octaves).toBe(true);
    expect(settings.minorSolfege).toBe('do');
  });

  it('keeps a change on this device when the account cannot be reached', async () => {
    const remote = new FakePreferences();
    remote.save = () => Promise.reject(new Error('offline'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = new SyncedSettingsStore(new MemorySettingsStore(), remote);
    expect(store.save({ notation: 'roman' }).notation).toBe('roman');
    await Promise.resolve();
    await Promise.resolve();
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe('helpers', () => {
  it('formats lengths and spots expired links', () => {
    expect(formatDuration(213.6)).toBe('3:34');
    expect(formatDuration(59.4)).toBe('0:59');
    expect(linkExpired({ hash: '#error=access_denied&error_code=otp_expired', search: '' })).toBe(true);
    expect(linkExpired({ hash: '', search: '?code=abc' })).toBe(false);
  });
});

describe('device sessions', () => {
  it('lists every session on this device for import, newest first', async () => {
    const store = new IndexedDbSessionStore(() => new IDBFactory(), 'import-test');
    const base = {
      version: 1,
      songTitle: 'T',
      schemaVersion: '1.1.0',
      pipelineVersion: '0.1.0',
      mode: 'training',
      result: { steps: 1, firstTime: 1, wrongNotes: 0 },
      hands: 'both',
      speed: 1,
      loop: null,
      durationSec: 5,
    } as const;
    await store.add({ ...base, songId: 'a', startedAt: '2026-11-01T10:00:00Z' } as NewSession);
    await store.add({ ...base, songId: 'b', startedAt: '2026-11-02T10:00:00Z' } as NewSession);
    const all = await store.all();
    expect(all.map((s) => s.songId)).toEqual(['b', 'a']);
  });
});
