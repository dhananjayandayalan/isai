// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import twinkle from '../../../schema/examples/twinkle-g-major.json';
import { fakeApi, FRIEND, songRow, type FakeApi } from '../api/fakes';
import { UploadError, type JobRow, type SongRow } from '../api/types';
import type { AppDeps } from '../App';
import { AudioEngine } from '../audio/engine';
import { FakeInstrument } from '../audio/FakeInstrument';
import { FakeTransport } from '../audio/FakeTransport';
import { SwitchableInstrument } from '../audio/voices';
import { FakeMidiInput } from '../midi/FakeMidiInput';
import { ManualFrames, RecordingContext } from '../piano/testing';
import type { Session } from '../sessions/types';
import { MemorySettingsStore } from '../settings/store';
import { CloudApp } from './CloudApp';
import type { LocalSessions } from './SessionImport';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { get: () => 520 });
HTMLCanvasElement.prototype.getContext = function getContext() {
  return new RecordingContext();
} as unknown as HTMLCanvasElement['getContext'];

function deps(): Omit<AppDeps, 'sessions'> & { settings: MemorySettingsStore } {
  const transport = new FakeTransport();
  const piano = new SwitchableInstrument(new FakeInstrument('sampled'), () => new FakeInstrument('sampled'));
  const audio = new AudioEngine({
    createContext: () => ({ resume: () => Promise.resolve() }),
    load: () => Promise.resolve({ transport, piano, metronome: new FakeInstrument('synth'), clock: transport.clock }),
  });
  return {
    audio,
    midi: new FakeMidiInput(),
    frames: new ManualFrames(),
    settings: new MemorySettingsStore(),
    now: () => '2026-11-15T10:00:00.000Z',
  };
}

let container: HTMLDivElement;
let root: Root;
let path = '';

function WherePath() {
  const { pathname } = useLocation();
  useEffect(() => {
    path = pathname;
  }, [pathname]);
  return null;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  path = '';
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

interface Options {
  local?: LocalSessions;
  probe?: (file: File) => Promise<number | null>;
  openUrl?: (url: string) => void;
  settings?: MemorySettingsStore;
}

async function render(api: FakeApi, entry = '/', options: Options = {}) {
  const d = deps();
  if (options.settings) d.settings = options.settings;
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <CloudApp
          api={api}
          deps={d}
          origin="https://isai.test"
          probe={options.probe ?? (() => Promise.resolve(180))}
          {...(options.local ? { local: options.local } : {})}
          {...(options.openUrl ? { openUrl: options.openUrl } : {})}
        />
        <WherePath />
      </MemoryRouter>,
    );
  });
  return d;
}

const text = () => container.textContent ?? '';

function byText<T extends HTMLElement>(selector: string, label: string): T {
  const found = [...container.querySelectorAll<T>(selector)].find(
    (el) => (el.textContent?.trim() === label || el.getAttribute('aria-label') === label) && !el.closest('[hidden]'),
  );
  if (!found) throw new Error(`No ${selector} "${label}"`);
  return found;
}

async function click(label: string, selector = 'button, a') {
  await act(async () => {
    byText(selector, label).click();
  });
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function pickFiles(files: File[]) {
  const input = container.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('no file input');
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

function job(patch: Partial<JobRow> = {}): JobRow {
  return { id: 'job-1', songId: 'song-1', status: 'queued', stage: null, attempts: 0, errorCode: null, timings: {}, ...patch };
}

// -------------------------------------------------------------------------------------------

describe('sign in', () => {
  it('emails a link to an invited address, back to this site', async () => {
    const api = fakeApi();
    await render(api);
    expect(text()).toContain('Isai is invite-only');
    await type(container.querySelector<HTMLInputElement>('#sign-in-email') as HTMLInputElement, 'friend@example.com');
    await act(async () => {
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(text()).toContain('Check your email');
    expect(api.auth.sent).toEqual([{ email: 'friend@example.com', redirectTo: 'https://isai.test' }]);
    await click('Use a different email');
    expect(text()).toContain('Email me a sign-in link');
  });

  it('says when the email has no invite', async () => {
    const api = fakeApi();
    await render(api);
    await type(container.querySelector<HTMLInputElement>('#sign-in-email') as HTMLInputElement, 'stranger@example.com');
    await act(async () => {
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(text()).toContain("isn't on Isai's invite list");
    expect(container.querySelector('#sign-in-email')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('explains an expired link', async () => {
    await render(fakeApi(), '/#error=access_denied&error_code=otp_expired');
    expect(text()).toContain('That sign-in link has expired');
  });

  it('opens the library after the link is followed, with the account notation', async () => {
    const api = fakeApi();
    api.preferences.saved = { notation: 'swaras' };
    const settings = new MemorySettingsStore();
    await render(api, '/', { settings });
    await act(async () => {
      api.auth.signIn(FRIEND);
      await Promise.resolve();
    });
    await settle();
    expect(text()).toContain('Library');
    expect(text()).toContain('friend@example.com');
    expect(settings.load().notation).toBe('swaras');
    await click('Sign out');
    expect(text()).toContain('Email me a sign-in link');
  });
});

describe('library', () => {
  it('shows a skeleton while loading, then the songs', async () => {
    const api = fakeApi(FRIEND, [songRow()]);
    let release = () => undefined as void;
    const real = api.songs.list.bind(api.songs);
    api.songs.list = () => new Promise((resolve) => (release = () => void real().then(resolve)));
    await render(api);
    expect(text()).toContain('Flipping through your songbook…');
    await act(async () => {
      release();
      await Promise.resolve();
    });
    await settle();
    expect(text()).toContain('Maayangal');
    expect(text()).toContain('D minor');
    expect(text()).toContain('120 BPM');
    expect(text()).toContain('3:34');
    expect(text()).toContain('Not practised yet');
  });

  it('offers to try again when the songs could not be fetched', async () => {
    const api = fakeApi(FRIEND, [songRow()]);
    api.songs.failList = true;
    await render(api);
    expect(text()).toContain("We couldn't fetch your songs");
    api.songs.failList = false;
    await click('Try again');
    await settle();
    expect(text()).toContain('Maayangal');
  });

  it('welcomes a first visit', async () => {
    await render(fakeApi(FRIEND));
    expect(text()).toContain('Your songbook is empty');
    expect(byText<HTMLAnchorElement>('a', 'Analyse your first song').getAttribute('href')).toBe('/upload');
  });

  it('filters by kind and search, and says when nothing matches', async () => {
    const api = fakeApi(FRIEND, [
      songRow(),
      songRow({ id: 'song-2', title: 'Clair de lune', sourceType: 'piano-solo', createdAt: '2026-11-14T10:00:00Z' }),
    ]);
    await render(api);
    await click('Piano solo 1');
    expect(text()).toContain('Clair de lune');
    expect(text()).not.toContain('Maayangal');
    await type(container.querySelector<HTMLInputElement>('#library-search') as HTMLInputElement, 'zzz');
    expect(text()).toContain('No songs match');
    await click('Clear filters');
    expect(text()).toContain('Maayangal');
    expect(text()).toContain('Clair de lune');
  });

  it('links an analysing song to its progress and explains a failed one', async () => {
    const api = fakeApi(FRIEND, [
      songRow({ id: 'a', title: 'Analysing one', status: 'analysing', jobId: 'job-7' }),
      songRow({ id: 'f', title: 'Failed one', status: 'failed', errorCode: 'silent' }),
      songRow({ id: 's', title: 'Friend song', mine: false, shared: true, ownerId: 'user-2' }),
    ]);
    await render(api);
    const analysing = [...container.querySelectorAll('a')].find((a) => a.textContent?.includes('Analysing one'));
    expect(analysing?.getAttribute('href')).toBe('/jobs/job-7');
    expect(text()).toContain("Isai couldn't hear anything in that recording.");
    expect(text()).toContain('Shared by a friend');
  });

  it('offers the latest practised song and each song’s best score', async () => {
    const api = fakeApi(FRIEND, [songRow()]);
    api.sessions.practice = [{ songId: 'song-1', songTitle: 'Maayangal', sessions: 3, bestScore: 87.4, lastAt: '2026-11-15T09:00:00Z' }];
    await render(api);
    expect(text()).toContain('Continue practising');
    expect(text()).toContain('3 sessions · best 87');
  });

  it("offers this device's sessions once, and imports them", async () => {
    const api = fakeApi(FRIEND, [songRow()]);
    const flags = new Map<string, string>();
    const session = {
      id: 4,
      version: 1,
      songId: 'twinkle',
      songTitle: 'Twinkle',
      schemaVersion: '1.1.0',
      pipelineVersion: '0.1.0',
      mode: 'training',
      result: { steps: 4, firstTime: 3, wrongNotes: 1 },
      hands: 'both',
      speed: 1,
      loop: null,
      startedAt: '2026-11-10T10:00:00Z',
      durationSec: 30,
    } as Session;
    const local: LocalSessions = {
      all: () => Promise.resolve([session, { ...session, id: 5, startedAt: '2026-11-11T10:00:00Z' }]),
      flags: () => ({ getItem: (k) => flags.get(k) ?? null, setItem: (k, v) => void flags.set(k, v) }),
    };
    await render(api, '/', { local });
    await settle();
    expect(text()).toContain('You have 2 practice sessions saved on this device');
    await click('Add to my account');
    await settle();
    expect(api.sessions.imported).toHaveLength(2);
    expect(api.sessions.imported[0]).not.toHaveProperty('id');
    expect(text()).toContain('Your practice from this device is in your account now.');
    expect(flags.get('isai-sessions-imported-user-1')).toBe('imported');

    act(() => root.unmount());
    root = createRoot(container);
    await render(api, '/', { local });
    await settle();
    expect(text()).not.toContain('saved on this device');
  });

  it('remembers "Not now"', async () => {
    const flags = new Map<string, string>();
    const local: LocalSessions = {
      all: () => Promise.resolve([{ id: 1 } as Session]),
      flags: () => ({ getItem: (k) => flags.get(k) ?? null, setItem: (k, v) => void flags.set(k, v) }),
    };
    await render(fakeApi(FRIEND, [songRow()]), '/', { local });
    await settle();
    await click('Not now');
    expect(text()).not.toContain('saved on this device');
    expect(flags.get('isai-sessions-imported-user-1')).toBe('declined');
  });
});

describe('analyse a song', () => {
  const mp3 = (name = 'maayangal_saathiyam.mp3', size = 9_000_000) => {
    const file = new File(['x'], name, { type: 'audio/mpeg' });
    Object.defineProperty(file, 'size', { value: size });
    return file;
  };

  it('checks the file before anything is sent', async () => {
    let seconds: number | null = 800;
    const api = fakeApi(FRIEND);
    await render(api, '/upload', { probe: () => Promise.resolve(seconds) });
    await pickFiles([mp3(), mp3('b.mp3')]);
    expect(text()).toContain('One song at a time');
    await pickFiles([mp3('notes.pdf')]);
    expect(text()).toContain("That isn't an audio file Isai can read");
    await pickFiles([mp3('big.wav', 200 * 1024 * 1024)]);
    expect(text()).toContain('over 100 MB');
    await pickFiles([mp3()]);
    expect(text()).toContain('longer than 12 minutes');
    seconds = null; // the browser can't tell: the server checks
    await pickFiles([mp3()]);
    expect(container.querySelector<HTMLInputElement>('#song-title')?.value).toBe('maayangal saathiyam');
    expect(api.uploads.pending).toHaveLength(0);
  });

  it('uploads with progress, then follows the analysis', async () => {
    const api = fakeApi(FRIEND);
    await render(api, '/upload');
    await pickFiles([mp3()]);
    expect(text()).toContain('9.0 MB · 3:00');
    await act(async () => container.querySelector<HTMLInputElement>('input[value=a-cappella]')?.click());
    await click('Easy');
    await click('Start analysis');
    const upload = api.uploads.last();
    expect(upload.request).toMatchObject({ title: 'maayangal saathiyam', sourceType: 'a-cappella', level: 'easy' });
    await act(async () => upload.progress(0.4));
    expect(container.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('40');
    expect(text()).toContain('Uploading… 40%');
    api.songs.rows = [songRow({ id: 'song-9', title: 'maayangal saathiyam', sourceType: 'a-cappella', status: 'analysing' })];
    api.jobs.jobs.set('job-9', job({ id: 'job-9', songId: 'song-9' }));
    await act(async () => {
      upload.resolve({ songId: 'song-9', jobId: 'job-9' });
      await Promise.resolve();
    });
    await settle();
    expect(path).toBe('/jobs/job-9');
    expect(text()).toContain('Waiting for the analysis machine');
  });

  it('can be cancelled, and says why an upload was refused', async () => {
    const api = fakeApi(FRIEND);
    await render(api, '/upload');
    await pickFiles([mp3()]);
    await click('Start analysis');
    await click('Cancel');
    await settle();
    expect(api.uploads.cancelled).toBe(1);
    expect(text()).toContain('Upload cancelled.');
    await click('Start analysis');
    await act(async () => {
      api.uploads.last().reject(new UploadError('daily-cap', 'daily_cap'));
      await Promise.resolve();
    });
    await settle();
    expect(text()).toContain("You've analysed 10 songs in the last day");
    expect(byText('button', 'Try again')).toBeTruthy();
  });
});

describe('analysis progress', () => {
  function setup(row: Partial<SongRow> = {}, j: Partial<JobRow> = {}) {
    const api = fakeApi(FRIEND, [songRow({ status: 'analysing', ...row })]);
    api.jobs.jobs.set('job-1', job(j));
    return api;
  }

  it('shows the queue, each step as it runs, and the finished song', async () => {
    const api = setup();
    api.jobs.positions.set('job-1', 2);
    await render(api, '/jobs/job-1');
    await settle();
    expect(text()).toContain('2 songs are ahead of yours.');
    await act(async () => api.jobs.update(job({ status: 'running', stage: 'rhythm', timings: { download: 1, ingest: 1, separate: 9 } })));
    const steps = [...container.querySelectorAll('ol[aria-label=Steps] li')];
    expect(steps.map((li) => li.textContent?.includes('Done'))).toEqual([true, true, false, false, false, false, false]);
    expect(steps[2]?.getAttribute('aria-current')).toBe('step');
    expect(steps[2]?.querySelector('.loader-eq')).not.toBeNull();
    await act(async () => api.jobs.update(job({ status: 'succeeded' })));
    expect(byText<HTMLAnchorElement>('a', 'Open the song').getAttribute('href')).toBe('/songs/song-1');
    act(() => root.unmount());
    root = createRoot(container);
    expect(api.jobs.watching('job-1')).toBe(0);
  });

  it('explains a failure in plain words', async () => {
    await render(setup({}, { status: 'failed', errorCode: 'too_long' }), '/jobs/job-1');
    await settle();
    expect(text()).toContain('That recording is longer than Isai can analyse.');
    expect(text()).toContain('Trim it to under 12 minutes');
  });

  it('says when the job is not there', async () => {
    await render(fakeApi(FRIEND), '/jobs/nope');
    await settle();
    expect(text()).toContain("This analysis isn't here");
  });
});

describe('a song from the account', () => {
  function ready(patch: Partial<SongRow> = {}) {
    const api = fakeApi(FRIEND, [songRow({ title: twinkle.title, ...patch })]);
    api.songs.songs.set('song-1', twinkle);
    return api;
  }

  it('opens the overview with downloads, sharing and the account sessions', async () => {
    const api = ready();
    await api.sessions.add({
      version: 1,
      songId: twinkle.id,
      songTitle: twinkle.title,
      schemaVersion: '1.1.0',
      pipelineVersion: '0.1.0',
      mode: 'training',
      result: { steps: 10, firstTime: 8, wrongNotes: 2 },
      hands: 'both',
      speed: 1,
      loop: null,
      startedAt: '2026-11-15T09:00:00Z',
      durationSec: 40,
    });
    const openUrl = vi.fn();
    await render(api, '/songs/song-1', { openUrl });
    await settle();
    expect(text()).toContain('Your song');
    expect(text()).toContain(twinkle.title);
    expect(text()).toContain('8 of 10 right first time');
    expect(text()).not.toContain('Open a .song.json file');
    await click('Download MIDI');
    expect(openUrl).toHaveBeenCalledWith('https://files.test/song-1.mid');
    const share = byText<HTMLLabelElement>('label', 'Share with the group').querySelector('input') as HTMLInputElement;
    await act(async () => share.click());
    expect(api.songs.rows[0]?.shared).toBe(true);
  });

  it('deletes after asking', async () => {
    const api = ready();
    await render(api, '/songs/song-1');
    await settle();
    await click('Delete');
    expect(text()).toContain("This can't be undone.");
    await click('Keep it');
    expect(api.songs.removed).toEqual([]);
    await click('Delete');
    await act(async () => byText('[role=alertdialog] button', 'Delete').click());
    await settle();
    expect(api.songs.removed).toEqual(['song-1']);
    expect(path).toBe('/');
  });

  it("shows a friend's shared song without owner actions", async () => {
    await render(ready({ mine: false, shared: true, ownerId: 'user-2' }), '/songs/song-1');
    await settle();
    expect(text()).toContain('Shared by a friend');
    expect(text()).not.toContain('Share with the group');
    expect(text()).not.toContain('Delete');
  });

  it('puts practice in the address, and a results address without a result goes to the song', async () => {
    await render(ready(), '/songs/song-1/practice');
    await settle();
    expect(path).toBe('/songs/song-1/practice');
    await click('Back to song');
    expect(path).toBe('/songs/song-1');
    act(() => root.unmount());
    root = createRoot(container);
    await render(ready(), '/songs/song-1/results');
    await settle();
    expect(path).toBe('/songs/song-1');
  });

  it('covers a song still analysing, a failed one, a missing one and a bad download', async () => {
    await render(fakeApi(FRIEND, [songRow({ status: 'analysing' })]), '/songs/song-1');
    await settle();
    expect(text()).toContain('is still being analysed');
    expect(byText<HTMLAnchorElement>('a', 'See the progress').getAttribute('href')).toBe('/jobs/job-1');

    act(() => root.unmount());
    root = createRoot(container);
    await render(fakeApi(FRIEND, [songRow({ status: 'failed', errorCode: 'decode_failed' })]), '/songs/song-1');
    await settle();
    expect(text()).toContain("Isai couldn't read that file as audio.");

    act(() => root.unmount());
    root = createRoot(container);
    await render(fakeApi(FRIEND), '/songs/gone');
    await settle();
    expect(text()).toContain("This song isn't here");

    act(() => root.unmount());
    root = createRoot(container);
    const api = ready();
    api.songs.failLoad = true;
    await render(api, '/songs/song-1');
    await settle();
    expect(text()).toContain("We couldn't open this song");
    api.songs.failLoad = false;
    await click('Try again');
    await settle();
    expect(text()).toContain(twinkle.title);
  });

  it('says when the Song JSON is not one this page can read', async () => {
    const api = ready();
    api.songs.songs.set('song-1', { nonsense: true });
    await render(api, '/songs/song-1');
    await settle();
    expect(text()).toContain("We couldn't read this song");
  });
});

it('has a page for addresses that lead nowhere', async () => {
  await render(fakeApi(FRIEND), '/nowhere');
  await settle();
  expect(text()).toContain("There's no page here");
});

describe('operations', () => {
  const OWNER = { ...FRIEND, role: 'owner' as const };

  it('says when the analysis machine is offline, on upload and in the queue', async () => {
    const api = fakeApi(FRIEND, [songRow({ status: 'analysing' })]);
    api.ops.online = false;
    api.jobs.jobs.set('job-1', job());
    await render(api, '/upload');
    await settle();
    expect(text()).toContain('The analysis machine is offline');
    act(() => root.unmount());
    root = createRoot(container);
    await render(api, '/jobs/job-1');
    await settle();
    expect(text()).toContain("Your song will be analysed when it's back");
    api.ops.online = true;
    await act(async () => api.jobs.update(job({ attempts: 0, stage: null })));
    await settle();
    expect(text()).not.toContain('The analysis machine is offline');
  });

  it('shows the owner the queue, failures in words, stage times and workers', async () => {
    const api = fakeApi(OWNER);
    api.ops.stats = {
      ...api.ops.stats,
      queued: 2,
      oldestQueuedSec: 300,
      failures7d: { timeout: 3 },
      stages: { separate: { p50: 40.1, p95: 61.5 } },
      workers: [{ workerId: 'pc-1', seenAt: '2026-11-15T10:00:00Z', version: '0.1.0' }],
    };
    api.ops.errors = [{ kind: 'audio', message: 'NotAllowedError: x', page: '/songs/:id/practice', version: 'abc', createdAt: '2026-11-15T09:00:00Z' }];
    await render(api, '/admin');
    await settle();
    expect(text()).toContain('Admin');
    expect(text()).toContain('5 min');
    expect(text()).toContain('The analysis took too long and was stopped.');
    expect(text()).toContain('timeout × 3');
    expect(text()).toContain('40.1 / 61.5');
    expect(text()).toContain('pc-1');
    expect(text()).toContain('/songs/:id/practice');
  });

  it('keeps the Admin page from members', async () => {
    await render(fakeApi(FRIEND), '/admin');
    await settle();
    expect(text()).toContain("There's no page here");
    expect(text()).not.toContain('Analysis machines');
  });

  it('deletes the account from About, after asking', async () => {
    const api = fakeApi(FRIEND);
    await render(api, '/about');
    await settle();
    expect(text()).toContain('The audio you upload is deleted as soon as its analysis finishes');
    expect(text()).toContain('Salamander Grand Piano');
    expect(text()).toContain('Version dev');
    await click('Delete my account');
    await click('Keep my account');
    expect(api.ops.deleted).toBe(0);
    await click('Delete my account');
    await click('Delete everything');
    await settle();
    expect(api.ops.deleted).toBe(1);
  });

  it('reports a page that crashes, and says so', async () => {
    // A row the library can't render (no title) breaks the page while rendering.
    const api = fakeApi(FRIEND, [songRow({ title: undefined as unknown as string })]);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await render(api, '/');
    await settle();
    errors.mockRestore();
    expect(text()).toContain('Something on this page broke');
    expect(api.ops.reports[0]).toMatchObject({ kind: 'render', page: '/', version: 'dev' });
    expect(api.ops.reports[0]?.message).toContain('TypeError');
  });
});
