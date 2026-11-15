// @vitest-environment node
/// <reference types="node" />
// End to end on the local stack: sign in → upload a synthesised recording → live progress
// from the real worker → the song in the library → practice sessions saved and listed.
// Also: the invite gate, privacy between members, sharing, and that no audio is left.
// Run with `pnpm db:start`, then `pnpm test:e2e` (needs the pipeline's uv environment).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { JSDOM } from 'jsdom';
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFromClient } from '../src/api/supabase';
import { SignInError, type Api } from '../src/api/types';
import type { NewSession } from '../src/sessions/types';
import { parseSong } from '../src/song';

const URL = process.env.E2E_API_URL ?? '';
const ANON = process.env.E2E_ANON_KEY ?? '';
const SERVICE = process.env.E2E_SERVICE_ROLE_KEY ?? '';
const RUN = Math.random().toString(36).slice(2, 8);
const NO_PERSIST = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
// Node has fetch and WebSocket (Realtime) but no XMLHttpRequest, which the upload uses for
// its progress: borrow jsdom's, with jsdom's File so it can send it.
const dom = new JSDOM('', { url: 'http://localhost:5173' });
globalThis.XMLHttpRequest = dom.window.XMLHttpRequest as unknown as typeof XMLHttpRequest;
const DomFile = dom.window.File as unknown as typeof File;

let admin: SupabaseClient;
const users: string[] = [];

interface Member {
  id: string;
  email: string;
  api: Api;
}

async function member(name: string): Promise<Member> {
  const email = `${name}-${RUN}@test.local`;
  await admin.from('invites').insert({ email });
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error('no user');
  users.push(created.data.user.id);
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;
  const client = createClient(URL, ANON, NO_PERSIST);
  const verified = await client.auth.verifyOtp({ email, token: link.data.properties.email_otp, type: 'email' });
  if (verified.error) throw verified.error;
  return { id: created.data.user.id, email, api: apiFromClient(client, URL, ANON) };
}

/** Eight seconds of sine tones on a scale: something the a-cappella path can follow. */
function scaleWav(): File {
  const rate = 22_050;
  const notes = [60, 62, 64, 65, 67, 65, 64, 62, 60, 64, 67, 72, 67, 64, 62, 60];
  const samples = new Int16Array(notes.length * rate * 0.5);
  notes.forEach((midi, n) => {
    const f = 440 * 2 ** ((midi - 69) / 12);
    for (let i = 0; i < rate * 0.5; i++) {
      const t = i / rate;
      const env = Math.min(1, t / 0.02, (0.5 - t) / 0.05);
      samples[n * rate * 0.5 + i] = Math.round(0.4 * env * Math.sin(2 * Math.PI * f * t) * 32767);
    }
  });
  const header = new DataView(new ArrayBuffer(44));
  const ascii = (offset: number, s: string) => [...s].forEach((c, i) => header.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  header.setUint32(4, 36 + samples.byteLength, true);
  ascii(8, 'WAVEfmt ');
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, rate, true);
  header.setUint32(28, rate * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  ascii(36, 'data');
  header.setUint32(40, samples.byteLength, true);
  return new DomFile([header.buffer, samples.buffer], 'scale.wav', { type: 'audio/wav' });
}

function runWorkerOnce(): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('uv run isai worker --once', {
      cwd: '../pipeline',
      shell: true,
      env: { ...process.env, ISAI_SUPABASE_URL: URL, ISAI_SUPABASE_SERVICE_KEY: SERVICE, ISAI_WORKER_ID: `e2e-${RUN}` },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr.on('data', () => undefined);
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function until(check: () => boolean, seconds: number): Promise<void> {
  for (let i = 0; i < seconds * 10; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('timed out');
}

function session(songId: string, mode: 'training' | 'performance', startedAt: string): NewSession {
  const facts = { hands: 'both', speed: 1, loop: null, startedAt, durationSec: 20 } as const;
  const base = { version: 1, songId, songTitle: 'Scale', schemaVersion: '1.1.0', pipelineVersion: '0.1.0', ...facts } as const;
  return mode === 'training'
    ? { ...base, mode, result: { steps: 16, firstTime: 14, wrongNotes: 2 } }
    : ({ ...base, mode, result: { version: 1, score: 82 } } as unknown as NewSession);
}

beforeAll(() => {
  admin = createClient(URL, SERVICE, NO_PERSIST);
});

afterAll(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  await admin.from('invites').delete().like('email', `%-${RUN}@test.local`);
});

describe('the local stack, end to end', () => {
  it('refuses a sign-in link for an email without an invite', async () => {
    const client = createClient(URL, ANON, NO_PERSIST);
    const api = apiFromClient(client, URL, ANON);
    const error = await api.auth.sendMagicLink(`stranger-${RUN}@test.local`, 'http://localhost:5173').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SignInError);
    expect((error as SignInError).problem).toBe('not-invited');
  });

  it('uploads, analyses, practises, shares and deletes a song', async () => {
    const a = await member('a');
    const b = await member('b');
    expect((await a.api.auth.current())?.role).toBe('member');

    // Upload with progress; the job is queued.
    const progress: number[] = [];
    const { songId, jobId } = await a.api.uploads.start(
      { file: scaleWav(), title: 'Scale', sourceType: 'a-cappella', level: 'medium' },
      (f) => progress.push(f),
    ).done;
    expect(progress.at(-1)).toBe(1);
    expect((await a.api.jobs.get(jobId))?.status).toBe('queued');
    expect(await a.api.jobs.queuePosition(jobId)).toBe(0);

    // Live progress while the real worker runs the real pipeline.
    const seen: string[] = [];
    const stop = a.api.jobs.watch(jobId, (job) => seen.push(`${job.status}:${job.stage ?? ''}`));
    await until(() => seen.length > 0, 20); // subscribed
    expect(await runWorkerOnce()).toBe(0);
    await until(() => seen.some((s) => s.startsWith('succeeded')), 30);
    stop();
    expect(seen.some((s) => s.startsWith('running:'))).toBe(true);
    expect(seen.some((s) => s === 'running:melody' || s === 'running:harmony' || s === 'running:save')).toBe(true);

    // In the library, ready, with a valid Song and a MIDI file.
    const [row] = await a.api.songs.list();
    expect(row).toMatchObject({ id: songId, status: 'ready', mine: true, sourceType: 'a-cappella' });
    if (!row) throw new Error('no row');
    const song = parseSong(await a.api.songs.loadSong(row));
    expect(song.id).toBe(songId);
    const midi = await fetch(await a.api.songs.downloadUrl(row, 'midi'));
    expect(new TextDecoder().decode((await midi.arrayBuffer()).slice(0, 4))).toBe('MThd');

    // Practice is saved to the account and listed.
    await a.api.sessions.add(session(songId, 'training', '2026-11-15T10:00:00Z'));
    await a.api.sessions.add(session(songId, 'performance', '2026-11-15T10:05:00Z'));
    const listed = await a.api.sessions.list(songId);
    expect(listed.map((s) => s.mode)).toEqual(['performance', 'training']);
    expect(await a.api.sessions.summary()).toEqual([
      { songId, songTitle: 'Scale', sessions: 2, bestScore: 82, lastAt: expect.any(String) as string },
    ]);
    expect(await a.api.sessions.addMany([session(songId, 'training', '2026-11-15T10:00:00Z')])).toBe(0);

    // Private until shared; sessions stay private; a friend can't delete it.
    expect(await b.api.songs.list()).toEqual([]);
    expect(await b.api.songs.get(songId)).toBeNull();
    await a.api.songs.setShared(songId, true);
    const [shared] = await b.api.songs.list();
    expect(shared).toMatchObject({ id: songId, mine: false, shared: true });
    if (!shared) throw new Error('not shared');
    expect(parseSong(await b.api.songs.loadSong(shared)).id).toBe(songId);
    expect(await b.api.sessions.list(songId)).toEqual([]);
    await b.api.songs.remove(shared).catch(() => undefined);
    expect(await a.api.songs.get(songId)).not.toBeNull();

    // Rule 8: no upload left behind.
    const uploads = await admin.storage.from('uploads').list(a.id);
    expect(uploads.data).toEqual([]);

    // Deleting removes the files and the sessions.
    await a.api.songs.remove(row);
    expect(await a.api.songs.list()).toEqual([]);
    expect((await admin.storage.from('songs').list(a.id)).data).toEqual([]);
    expect(await a.api.sessions.list(songId)).toEqual([]);
  });

  it('reports the worker online after it ran, takes error reports and deletes accounts', async () => {
    const d = await member('d');
    expect(await d.api.ops.workerOnline()).toBe(true); // the worker beat during the job above
    await d.api.ops.reportError({ kind: 'audio', message: 'NotAllowedError', page: '/songs/:id', version: 'e2e' });
    await expect(d.api.ops.adminStats()).rejects.toThrow(); // members get no stats
    const reports = await admin.from('client_errors').select('kind, page').eq('version', 'e2e');
    expect(reports.data).toEqual([{ kind: 'audio', page: '/songs/:id' }]);
    await d.api.ops.deleteAccount();
    const gone = await admin.auth.admin.getUserById(d.id);
    expect(gone.data.user).toBeNull();
    const invite = await admin.from('invites').select('email').eq('email', d.email);
    expect(invite.data).toEqual([]);
    await admin.from('client_errors').delete().eq('version', 'e2e');
  });

  it('keeps notation preferences in the profile', async () => {
    const c = await member('c');
    await c.api.preferences.save({ notation: 'swaras' });
    await c.api.preferences.save({ octaves: true });
    expect(await c.api.preferences.load()).toEqual({ notation: 'swaras', octaves: true });
  });
});
