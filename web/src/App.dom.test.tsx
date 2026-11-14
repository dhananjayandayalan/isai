// @vitest-environment jsdom
import { act, Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import frere from '../../schema/examples/frere-jacques-a-cappella.json';
import twinkle from '../../schema/examples/twinkle-g-major.json';
import App, { type AppDeps, type View } from './App';
import { AudioEngine } from './audio/engine';
import { FakeInstrument } from './audio/FakeInstrument';
import { FakeTransport } from './audio/FakeTransport';
import type { InstrumentSound } from './audio/types';
import { FakeMidiInput } from './midi/FakeMidiInput';
import type { MidiInput } from './midi/MidiInput';
import { MidiError } from './midi/WebMidiInput';
import { ManualFrames, RecordingContext } from './piano/testing';
import { CALIBRATION } from './settings/calibration';
import {
  IndexedDbSessionStore,
  MemorySessionStore,
  ResilientSessionStore,
  type SessionStore,
} from './sessions/store';
import { LocalSettingsStore, type SettingsStore } from './settings/store';
import { midiToName } from './theory/pitch';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout and no canvas: give the canvas a width and a recording context.
const contexts: RecordingContext[] = [];
Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { get: () => 520 });
HTMLCanvasElement.prototype.getContext = function getContext() {
  const ctx = new RecordingContext();
  contexts.push(ctx);
  return ctx;
} as unknown as HTMLCanvasElement['getContext'];

interface Harness {
  deps: AppDeps;
  midi: FakeMidiInput;
  transport: FakeTransport;
  piano: FakeInstrument;
  metronome: FakeInstrument;
  frames: ManualFrames;
}

interface HarnessOptions {
  midi?: MidiInput;
  sound?: InstrumentSound;
  failAudio?: boolean;
  /** Hold the audio load until the test calls `finishLoading()`. */
  slowAudio?: boolean;
  settings?: SettingsStore;
  sessions?: SessionStore;
}

/** The calendar time every session in these tests starts at. */
const NOW = '2026-11-14T10:00:00.000Z';

function harness(options: HarnessOptions = {}) {
  const transport = new FakeTransport();
  const piano = new FakeInstrument(options.sound ?? 'sampled');
  const metronome = new FakeInstrument('synth');
  const frames = new ManualFrames();
  const fakeMidi = new FakeMidiInput();
  const resume = vi.fn(() => Promise.resolve());
  let attempts = 0;
  let finishLoading = () => undefined as void;
  const gate = options.slowAudio
    ? new Promise<void>((resolve) => {
        finishLoading = resolve;
      })
    : Promise.resolve();
  const audio = new AudioEngine({
    createContext: () => ({ resume }),
    load: async () => {
      attempts++;
      if (options.failAudio && attempts === 1) throw new Error('no output');
      await gate;
      return { transport, piano, metronome, clock: transport.clock };
    },
  });
  const deps: AppDeps = {
    audio,
    midi: options.midi ?? fakeMidi,
    frames,
    sessions: options.sessions ?? new MemorySessionStore(),
    now: () => NOW,
    ...(options.settings ? { settings: options.settings } : {}),
  };
  return {
    ...({ deps, midi: fakeMidi, transport, piano, metronome, frames } satisfies Harness),
    resume,
    finishLoading: () => finishLoading(),
  };
}

let container: HTMLDivElement;
let root: Root;
let commits = 0;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  commits = 0;
  contexts.length = 0;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Render the app. Most tests start on the practice screen; the P6 tests on the song overview. */
async function render(deps: AppDeps, source?: unknown, view: View = 'practice') {
  await act(async () => {
    root.render(
      <Profiler id="app" onRender={() => commits++}>
        <App deps={deps} view={view} {...(source === undefined ? {} : { source })} />
      </Profiler>,
    );
  });
}

function button(name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === name || b.textContent?.trim() === name,
  );
  if (!found) throw new Error(`No button "${name}"`);
  return found;
}

async function click(name: string) {
  await act(async () => {
    button(name).click();
  });
}

const text = () => container.textContent ?? '';

/** A line the frame loop writes through a ref: time, waiting, steps or speed. */
const readout = (name: string) => container.querySelector(`[data-readout=${name}]`)?.textContent ?? '';

const pressed = (name: string) => button(name).getAttribute('aria-pressed') === 'true';

function group(label: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[role=group][aria-label="${label}"]`);
}

async function choose(label: string, value: number) {
  const select = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (!select) throw new Error(`No select "${label}"`);
  await act(async () => {
    select.value = String(value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const NAME_TO_MIDI = new Map(Array.from({ length: 128 }, (_, midi) => [midiToName(midi), midi]));

/** The keys named on the "Waiting for G4 B4" line, or none when it says something else. */
function waitingFor(): number[] {
  const line = readout('waiting');
  if (!line.startsWith('Waiting for ')) return [];
  return line
    .slice('Waiting for '.length)
    .split(' ')
    .map((name) => NAME_TO_MIDI.get(name) ?? -1);
}

const onsOf = (instrument: FakeInstrument) => instrument.calls.filter((c) => c.type === 'on');

describe('rule 5: no React render per note', () => {
  it('200 MIDI notes and 100 playing frames cause no React commits', async () => {
    const h = harness();
    await h.midi.connect('fake-keyboard');
    await render(h.deps);
    await click('Play');
    expect(h.transport.state).toBe('started');
    act(() => h.frames.step()); // settle the first frame after mounting

    const before = commits;
    const shown = readout('time');
    act(() => {
      for (let i = 0; i < 200; i++) {
        h.midi.emitNoteOn(40 + (i % 48), { velocity: 90 });
        if (i % 2) h.midi.emitNoteOff(40 + (i % 48));
      }
      for (let i = 0; i < 100; i++) {
        h.transport.advanceTo((i + 1) * 0.03); // 3 s of a 9.6 s song: no state change
        h.frames.step();
      }
    });

    expect(commits).toBe(before);
    // ...while the canvas, sound and readout did keep up.
    const ctx = contexts.at(-1);
    expect(ctx?.ops.length).toBeGreaterThan(0);
    expect(h.piano.calls.filter((c) => c.type === 'on').length).toBeGreaterThan(100);
    expect(readout('time')).not.toBe(shown);
    expect(readout('time')).toBe('0:03 / 0:09');
  });

  it('a whole training run (every hold and resume, 200+ MIDI events) renders React once, at the end', async () => {
    const h = harness();
    await h.midi.connect('fake-keyboard');
    await render(h.deps);
    await click('Training');
    await click('Right hand');
    await click('Play');
    act(() => h.frames.step());

    const before = commits;
    const lines = new Set<string>();
    let events = 0;
    let holds = 0;
    const stopped = () => h.transport.state === 'stopped';
    for (let guard = 0; guard < 2000 && !stopped(); guard++) {
      // One act per slice of time, so a stray state update would commit here and be seen.
      act(() => {
        h.transport.advanceBy(0.2);
        h.frames.step();
        const want = waitingFor();
        if (want.length === 0) return;
        holds++;
        lines.add(readout('waiting'));
        const time = () => ({ time: h.transport.audioTime });
        for (let wrong = 100; wrong < 107; wrong++) {
          h.midi.emitNoteOn(wrong, time());
          h.midi.emitNoteOff(wrong, time());
          events += 2;
        }
        h.frames.step();
        expect(h.transport.state).toBe('paused'); // wrong notes never move it on
        h.transport.wait(0.4);
        for (const key of want) h.midi.emitNoteOn(key, time());
        expect(h.transport.state).toBe('started');
        for (const key of want) h.midi.emitNoteOff(key, time());
        events += want.length * 2;
        h.frames.step();
      });
      if (!stopped()) expect(commits).toBe(before);
    }

    // The song ended: the one render, for the Play button and Stop.
    expect(stopped()).toBe(true);
    expect(commits).toBe(before + 1);
    expect(button('Play')).toBeDefined();
    expect(holds).toBe(14); // every right-hand note of Twinkle
    expect(events).toBeGreaterThan(200);
    expect(lines.size).toBeGreaterThan(3); // G4, D5, E5, C5, B4, A4

    act(() => h.frames.step());
    expect(readout('waiting')).toBe('Press Play to go again.');
    expect(readout('steps')).toBe('0 of 14 right first time');
    // Isai played the left hand, and the canvas showed the marks and the step after.
    const left = twinkle.notes.filter((n) => n.hand === 'left');
    for (const note of left) expect(onsOf(h.piano).some((c) => c.midi === note.midi)).toBe(true);
    const ctx = contexts.at(-1);
    expect(ctx?.circles().length).toBeGreaterThan(14);
    expect(ctx?.outlines().length).toBeGreaterThan(0);
    expect(h.piano.sounding.size).toBe(0);
  });
});

describe('playback', () => {
  it('loads audio on Play, then pauses, resumes and stops', async () => {
    const h = harness();
    await render(h.deps);
    expect(h.transport.scheduledCount).toBe(0); // nothing until Play
    await click('Play');
    expect(h.transport.scheduledCount).toBeGreaterThan(0);
    expect(button('Pause')).toBeDefined();
    await click('Pause');
    expect(h.transport.state).toBe('paused');
    await click('Play');
    await click('Stop');
    expect(h.transport.state).toBe('stopped');
    expect(button('Stop').disabled).toBe(true);
  });

  it('seeks with the position slider', async () => {
    const h = harness();
    await render(h.deps);
    await click('Play');
    const slider = container.querySelector<HTMLInputElement>('input[type=range]');
    expect(slider?.disabled).toBe(false);
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setValue?.call(slider, '4.5');
      slider?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(h.transport.state).toBe('started'); // seeking keeps playing
    act(() => h.frames.step());
    expect(readout('time')).toBe('0:04 / 0:09');
    act(() => {
      h.transport.advanceBy(1);
      h.frames.step();
    });
    expect(readout('time')).toBe('0:05 / 0:09');
  });

  it('switching songs disposes the old engine', async () => {
    const h = harness();
    await render(h.deps);
    await click('Play');
    expect(h.transport.scheduledCount).toBeGreaterThan(0);
    await click('Frère Jacques');
    expect(text()).toContain('Frère Jacques');
    expect(h.transport.scheduledCount).toBe(0);
    expect(h.transport.state).toBe('stopped');
  });

  it('says so when the piano falls back to a synth', async () => {
    const h = harness({ sound: 'synth' });
    await render(h.deps);
    await click('Play');
    expect(text()).toContain("piano sound didn't load");
    expect(h.transport.state).toBe('started');
  });

  it('offers to try again when sound cannot start, and keeps the technical detail', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const h = harness({ failAudio: true });
    await render(h.deps);
    await click('Play');
    expect(text()).toContain("Isai couldn't start sound");
    expect(container.querySelector('.t-faint.t-mono')?.textContent).toBe('no output');
    expect(logged).toHaveBeenCalled();
    await click('Try again');
    expect(text()).not.toContain("Isai couldn't start sound");
    logged.mockRestore();
  });

  it('starts audio inside the click, and Play stays usable while the piano loads', async () => {
    const h = harness({ slowAudio: true });
    await render(h.deps);
    const play = button('Play');
    // The context must be resumed before the click handler returns, not after a load.
    act(() => play.click());
    expect(h.resume).toHaveBeenCalledTimes(1);
    await act(async () => undefined);
    expect(text()).toContain('Tuning the piano');
    expect(play.disabled).toBe(false);
    // A second click (a browser that ignored the first) resumes the same context again.
    await click('Play');
    expect(h.resume).toHaveBeenCalledTimes(2);
    await act(async () => h.finishLoading());
    expect(h.transport.state).toBe('started');
    expect(text()).not.toContain('Tuning the piano');
  });

  it('stops following the slider only while it is dragged, however the drag ends', async () => {
    const h = harness();
    await render(h.deps);
    await click('Play');
    const slider = container.querySelector<HTMLInputElement>('input[type=range]');
    if (!slider) throw new Error('no slider');
    const frame = (seconds: number) =>
      act(() => {
        h.transport.advanceTo(seconds);
        h.frames.step();
      });
    frame(1);
    expect(Number(slider.value)).toBe(1);
    for (const end of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'] as const) {
      act(() => {
        slider.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      });
      const during = slider.value;
      frame(h.transport.seconds + 0.5);
      expect(slider.value).toBe(during); // not dragged around under your finger
      act(() => {
        if (end === 'blur') {
          slider.focus();
          slider.blur();
        } else slider.dispatchEvent(new Event(end, { bubbles: true }));
      });
      frame(h.transport.seconds + 0.5);
      expect(Number(slider.value)).toBeCloseTo(h.transport.seconds, 2);
    }
  });

  it('changes the keyboard size and warns about notes that do not fit', async () => {
    const h = harness();
    const low = { ...frere, notes: [{ ...frere.notes[0], midi: 30 }, ...frere.notes.slice(1)] };
    await render(h.deps, low);
    expect(text()).not.toContain("fit on");
    await click('49 keys');
    expect(button('49 keys').getAttribute('aria-pressed')).toBe('true');
    expect(text()).toContain("1 note doesn't fit on 49 keys");
  });

  it('opens a .song.json file, and shows an error for one that is not a song', async () => {
    const h = harness();
    await render(h.deps);
    const input = container.querySelector<HTMLInputElement>('input[type=file]');
    const open = async (file: File) => {
      await act(async () => {
        Object.defineProperty(input, 'files', { value: [file], configurable: true });
        input?.dispatchEvent(new Event('change', { bubbles: true }));
      });
    };
    await open(new File([JSON.stringify(frere)], 'frere.song.json'));
    expect(text()).toContain('From frere.song.json');
    expect(text()).toContain(frere.title);
    await open(new File(['not json'], 'notes.txt'));
    const alert = container.querySelector('[role=alert]')?.textContent ?? '';
    expect(alert).toContain("couldn't read this song");
    // Its own message, not a list of schema errors about a made-up document.
    expect(alert).toContain("notes.txt isn't a song file");
    expect(alert).not.toContain('schemaVersion');
    await open(new File([JSON.stringify({ title: 'half a song' })], 'half.json'));
    const invalid = container.querySelector('[role=alert]')?.textContent ?? '';
    expect(invalid).toContain("doesn't match the format");
    expect(invalid).toContain('must have required property');
  });

  it('pauses the keyboard while the tab is hidden and picks up again after', async () => {
    const h = harness();
    await render(h.deps);
    expect(h.frames.waiting).toBe(1);
    const setHidden = (hidden: boolean) =>
      act(() => {
        Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    setHidden(true);
    expect(h.frames.waiting).toBe(0);
    setHidden(false);
    expect(h.frames.waiting).toBe(1);
    Reflect.deleteProperty(document, 'hidden');
  });
});

describe('practice screen', () => {
  const frame = (h: { transport: FakeTransport; frames: ManualFrames }, seconds = 0) =>
    act(() => {
      if (seconds > 0) h.transport.advanceBy(seconds);
      h.frames.step();
    });

  it('starts in Listen, with Training and Performance a click away', async () => {
    const h = harness();
    await render(h.deps);
    expect(pressed('Listen')).toBe(true);
    expect(pressed('Training')).toBe(false);
    expect(button('Performance').disabled).toBe(false);
    expect(group('Hands')).toBeNull();
    expect(container.querySelector('[data-readout=waiting]')?.closest('[hidden]')).not.toBeNull();
    expect(text()).not.toContain('Connect your MIDI keyboard');
  });

  it('training offers the hands, what the other hand does, and asks for a keyboard', async () => {
    const h = harness();
    await render(h.deps);
    await click('Training');
    expect(pressed('Both hands')).toBe(true);
    expect(group('The other hand')).toBeNull(); // both hands: there is no other hand
    expect(container.querySelector('[data-readout=waiting]')?.closest('[hidden]')).toBeNull();
    expect(readout('waiting')).toBe('Press Play, then play the lit keys.');
    await click('Left hand');
    expect(pressed('Isai plays it')).toBe(true);
    await click('Muted');
    expect(pressed('Muted')).toBe(true);

    expect(text()).toContain('Connect your MIDI keyboard below');
    await click('Find my keyboard');
    await act(async () => {
      container.querySelector<HTMLInputElement>('input[type=radio]')?.click();
    });
    expect(text()).not.toContain('Connect your MIDI keyboard below');
    await click('Disconnect');
    expect(text()).toContain('Connect your MIDI keyboard below');
  });

  it('holds at a step, says what it waits for, and carries on when you play it', async () => {
    const h = harness();
    await h.midi.connect('fake-keyboard');
    await render(h.deps);
    await click('Training');
    await click('Right hand');
    await click('Play');
    frame(h, 0.1);
    expect(h.transport.state).toBe('paused');
    expect(readout('waiting')).toBe('Waiting for G4');
    expect(readout('steps')).toBe('Step 1 of 14 · 0 of 0 right first time');
    expect(h.piano.sounding.size).toBe(0); // nothing sounds while it waits

    act(() => h.midi.emitNoteOn(60, { time: h.transport.audioTime })); // not in the step
    act(() => h.midi.emitNoteOff(60));
    expect(h.transport.state).toBe('paused');

    act(() => h.midi.emitNoteOn(67, { time: h.transport.audioTime }));
    expect(h.transport.state).toBe('started');
    act(() => h.midi.emitNoteOff(67));
    frame(h, 0.05);
    expect(h.piano.sounding.has(43)).toBe(true); // Isai's left hand comes in with you
    expect(readout('waiting')).toBe('Next: G4');
    expect(readout('steps')).toBe('Step 2 of 14 · 0 of 1 right first time');

    // The next one, played cleanly while it waits.
    frame(h, 1);
    expect(readout('waiting')).toBe('Waiting for G4');
    act(() => h.midi.emitNoteOn(67, { time: h.transport.audioTime }));
    frame(h);
    expect(readout('steps')).toBe('Step 3 of 14 · 1 of 2 right first time');

    await click('Pause');
    frame(h);
    expect(readout('waiting')).toBe('Paused');
    await click('Stop');
    frame(h);
    expect(readout('waiting')).toBe('Press Play to go again.');
    expect(readout('steps')).toBe('1 of 2 right first time');
    expect(readout('time')).toBe('0:00 / 0:09');
  });

  it('mutes the other hand when asked', async () => {
    const h = harness();
    await h.midi.connect('fake-keyboard');
    await render(h.deps);
    await click('Training');
    await click('Right hand');
    await click('Muted');
    await click("My keyboard's sound"); // so only Isai's own notes reach the piano
    await click('Play');
    frame(h, 0.1);
    act(() => h.midi.emitNoteOn(67, { time: h.transport.audioTime }));
    frame(h, 0.3);
    expect(h.transport.state).toBe('started');
    expect(onsOf(h.piano)).toHaveLength(0);
  });

  it('listening needs no keyboard and plays both hands', async () => {
    const h = harness();
    await render(h.deps);
    await click('Play');
    frame(h, 9.7);
    expect(h.transport.state).toBe('stopped');
    expect(onsOf(h.piano)).toHaveLength(twinkle.notes.length);
    expect(button('Play')).toBeDefined();
  });

  it("keeps your notes and Isai's apart on the one piano", async () => {
    const h = harness();
    await h.midi.connect('fake-keyboard');
    await render(h.deps);
    await click('Play'); // Listen: Isai plays both hands
    frame(h, 0.1);
    expect(h.piano.sounding.has(67)).toBe(true); // Isai's first melody note
    // Playing along on the same key and letting go doesn't cut Isai's note...
    act(() => h.midi.emitNoteOn(67, { velocity: 90 }));
    act(() => h.midi.emitNoteOff(67));
    expect(h.piano.sounding.has(67)).toBe(true);
    // ...and stopping Isai doesn't cut a key you are still holding.
    act(() => h.midi.emitNoteOn(84, { velocity: 90 }));
    await click('Stop');
    expect([...h.piano.sounding]).toEqual([84]);
    act(() => h.midi.emitNoteOff(84));
    expect(h.piano.sounding.size).toBe(0);
  });

  it('plays at 40% and at 120%, with the notes rescheduled when the speed changes', async () => {
    const h = harness();
    await render(h.deps);
    expect(readout('speed')).toBe('100%');
    for (let i = 0; i < 12; i++) await click('Slower');
    expect(readout('speed')).toBe('40%');
    expect(text()).toContain('40 BPM');
    expect(button('Slower').disabled).toBe(true);

    await click('Play');
    frame(h, 12); // 12 s at 40% is 4.8 s of the song
    expect(readout('time')).toBe('0:04 / 0:09');
    // The second melody note (0.6 s into the song) sounded 1.5 s after Play.
    const second = onsOf(h.piano).filter((c) => c.midi === 67)[1];
    expect(second?.time).toBeCloseTo(h.transport.audioOffset + 1.5, 6);

    for (let i = 0; i < 16; i++) await click('Faster');
    expect(readout('speed')).toBe('120%');
    expect(text()).toContain('120 BPM');
    expect(button('Faster').disabled).toBe(true);
    expect(h.transport.state).toBe('started');
    frame(h, 1); // 1 s at 120% is 1.2 s of the song: 4.8 -> 6.0
    expect(readout('time')).toBe('0:06 / 0:09');
    const sounded = onsOf(h.piano).length;
    frame(h, 3.1); // the remaining 3.6 s of song take 3 s
    expect(h.transport.state).toBe('stopped');
    expect(onsOf(h.piano).length).toBeGreaterThan(sounded);
    // Every note sounded once, plus those still held when the speed changed (re-sounded).
    expect(onsOf(h.piano).length).toBeGreaterThanOrEqual(twinkle.notes.length);
  });

  it('loops bars 1–4, and the bar pickers move the loop', async () => {
    const h = harness();
    await render(h.deps);
    expect(pressed('Loop bars 1–4')).toBe(false);
    expect(container.querySelector('select')).toBeNull();
    await click('Loop bars 1–4');
    expect(pressed('Loop bars 1–4')).toBe(true);
    expect(container.querySelectorAll('select[aria-label="Loop from"] option')).toHaveLength(4);

    await click('Play');
    frame(h, 9.6 + 1.5); // once round the four bars, then 1.5 s into the next pass
    expect(h.transport.state).toBe('started');
    expect(readout('time')).toBe('0:01 / 0:09');
    // The opening bass note sounded at the start of each pass, 9.6 s apart: no gap, no stop.
    const wrapAt = h.transport.audioOffset + 9.6;
    const bass = onsOf(h.piano).filter((c) => c.midi === 43 && c.time !== undefined);
    expect(bass[0]?.time).toBeCloseTo(h.transport.audioOffset, 6);
    expect(bass.some((c) => Math.abs((c.time ?? 0) - wrapAt) < 1e-6)).toBe(true);

    await choose('Loop to', 2);
    expect(pressed('Loop bars 1–2')).toBe(true);
    frame(h, 4.8); // bars 1–2 are 4.8 s: round once, back where we were
    expect(readout('time')).toBe('0:01 / 0:09');
    frame(h, 2);
    expect(readout('time')).toBe('0:03 / 0:09');

    await choose('Loop from', 2);
    expect(pressed('Loop bar 2')).toBe(true);
    frame(h, 2.4); // bar 2 alone is 2.4 s
    expect(readout('time')).toBe('0:03 / 0:09');

    // "From" past "To" moves "To" along with it.
    await choose('Loop from', 3);
    expect(pressed('Loop bar 3')).toBe(true);
    await choose('Loop to', 4);
    await choose('Loop to', 1);
    expect(pressed('Loop bar 1')).toBe(true);

    await click('Loop bar 1');
    expect(pressed('Loop bar 1')).toBe(false);
    frame(h, 10); // no loop: the song runs out
    expect(h.transport.state).toBe('stopped');
  });

  it('loops by time when the song has no beats', async () => {
    const h = harness();
    await render(h.deps, { ...twinkle, tempo: { ...twinkle.tempo, beats: [] } });
    await click('Loop 0:00–0:08');
    const options = [...container.querySelectorAll('select[aria-label="Loop to"] option')];
    expect(options.map((o) => o.textContent)).toEqual(['0:02', '0:04', '0:06', '0:08', '0:09']);
    await choose('Loop from', 2);
    expect(pressed('Loop 0:02–0:08')).toBe(true);
    await click('Play');
    frame(h, 6.5);
    expect(readout('time')).toBe('0:02 / 0:09');
  });

  it('clicks the metronome on each beat while it is switched on', async () => {
    const h = harness();
    await render(h.deps);
    await click('Play');
    frame(h, 1);
    expect(h.metronome.calls).toHaveLength(0);
    await click('Metronome');
    expect(pressed('Metronome')).toBe(true);
    frame(h, 2); // beats at 1.2, 1.8, 2.4 (a downbeat)
    expect(onsOf(h.metronome).map((c) => c.midi)).toEqual([84, 84, 91]);
    await click('Metronome');
    frame(h, 2);
    expect(onsOf(h.metronome)).toHaveLength(3);
  });

  it('counts in one bar before the song starts', async () => {
    const h = harness();
    await h.midi.connect('fake-keyboard');
    await render(h.deps);
    await click('Training');
    await click('Count-in');
    expect(pressed('Count-in')).toBe(true);
    await click('Play');
    frame(h, 2.3); // a bar of Twinkle is 2.4 s
    expect(readout('waiting')).toBe('Count-in…');
    expect(readout('time')).toBe('0:00 / 0:09');
    expect(onsOf(h.metronome).map((c) => c.midi)).toEqual([91, 84, 84, 84]);
    expect(onsOf(h.piano)).toHaveLength(0);
    frame(h, 0.2);
    expect(readout('waiting')).toBe('Waiting for G2 G4');
    expect(onsOf(h.metronome)).toHaveLength(4); // the metronome itself is off
  });

  it('does not ask for notes that are off your keyboard', async () => {
    const h = harness();
    await h.midi.connect('fake-keyboard');
    const low = { ...frere, notes: [{ ...frere.notes[0], midi: 30 }, ...frere.notes.slice(1)] };
    await render(h.deps, low);
    await click('Training');
    await click('Play');
    frame(h, 0.1);
    expect(readout('waiting')).toBe('Waiting for F#1'); // it fits on 88 keys
    await click('49 keys');
    expect(text()).toContain('and training skips it');
    frame(h, 0.6);
    expect(readout('waiting')).toBe('Waiting for G4');
    expect(readout('steps')).toBe('Step 1 of 7 · 0 of 0 right first time');
  });

  it('says so when the hand you picked has nothing to play', async () => {
    const h = harness();
    await render(h.deps, frere);
    await click('Training');
    await click('Left hand');
    await click('Play');
    frame(h, 0.5);
    expect(h.transport.state).toBe('started');
    expect(readout('waiting')).toBe('There are no notes for this hand here.');
    expect(readout('steps')).toBe('');
  });

  it('keeps the choices made before the first Play', async () => {
    const h = harness();
    await h.midi.connect('fake-keyboard');
    await render(h.deps);
    await click('Training');
    await click('Left hand');
    await click('Slower');
    await click('Play');
    frame(h, 0.1);
    expect(readout('waiting')).toBe('Waiting for G2');
    expect(readout('speed')).toBe('95%');
  });
});

describe('MIDI panel', () => {
  it('finds, connects and disconnects a keyboard, and plays your notes', async () => {
    const h = harness();
    await render(h.deps);
    await click('Find my keyboard');
    expect(text()).toContain('Fake keyboard');
    const radio = container.querySelector<HTMLInputElement>('input[type=radio]');
    await act(async () => {
      radio?.click();
    });
    expect(h.midi.connectedDeviceId).toBe('fake-keyboard');
    expect(text()).toContain('Connected');
    act(() => h.midi.emitNoteOn(60, { velocity: 80 }));
    expect(h.piano.sounding.has(60)).toBe(true);
    act(() => h.midi.emitNoteOff(60));

    await click("My keyboard's sound");
    act(() => h.midi.emitNoteOn(62));
    expect(h.piano.sounding.has(62)).toBe(false);

    await click('Disconnect');
    expect(h.midi.connectedDeviceId).toBeNull();
  });

  it('shows the empty state when no keyboard is plugged in', async () => {
    const h = harness({ midi: new FakeMidiInput([]) });
    await render(h.deps);
    await click('Find my keyboard');
    expect(text()).toContain('No keyboards found');
    expect(button('Scan again')).toBeDefined();
  });

  it.each([
    ['unsupported', "This browser can't use MIDI keyboards", null],
    ['blocked', 'MIDI is blocked for this site', 'Try again'],
    ['failed', "We couldn't start MIDI", 'Try again'],
  ] as const)('shows the %s error with a next step', async (kind, title, retry) => {
    const failing: MidiInput = {
      ...new FakeMidiInput(),
      listDevices: () => Promise.reject(new MidiError(kind, kind)),
      connect: () => Promise.resolve(),
      disconnect: () => Promise.resolve(),
      onNoteOn: () => () => undefined,
      onNoteOff: () => () => undefined,
    };
    const h = harness({ midi: failing });
    await render(h.deps);
    await click('Find my keyboard');
    expect(container.querySelector('[role=alert]')?.textContent).toContain(title);
    if (retry) expect(button(retry)).toBeDefined();
  });

  it('names a busy keyboard', async () => {
    const busy = new FakeMidiInput();
    busy.connect = () => Promise.reject(new MidiError('busy', 'busy'));
    const h = harness({ midi: busy });
    await render(h.deps);
    await click('Find my keyboard');
    await act(async () => {
      container.querySelector<HTMLInputElement>('input[type=radio]')?.click();
    });
    expect(text()).toContain('Fake keyboard is in use by another app');
    expect(button('Scan again')).toBeDefined();
  });

  it('says so when a keyboard will not disconnect cleanly, and lets go of it anyway', async () => {
    const midi = new FakeMidiInput();
    const h = harness({ midi });
    await render(h.deps);
    await click('Find my keyboard');
    await act(async () => {
      container.querySelector<HTMLInputElement>('input[type=radio]')?.click();
    });
    expect(text()).toContain('Connected');
    midi.disconnect = () => Promise.reject(new Error('port would not close'));
    await click('Disconnect');
    expect(container.querySelector('[role=alert]')?.textContent).toContain("We couldn't start MIDI");
    expect(text()).not.toContain('Connected ·');
    expect(button('Try again')).toBeDefined();
  });

  it('drops a keyboard that was unplugged when you scan again', async () => {
    const devices = [{ id: 'k', name: 'Stage piano' }];
    const midi = new FakeMidiInput(devices);
    const h = harness({ midi });
    await render(h.deps);
    await click('Find my keyboard');
    await act(async () => {
      container.querySelector<HTMLInputElement>('input[type=radio]')?.click();
    });
    expect(midi.connectedDeviceId).toBe('k');
    devices.length = 0; // unplugged
    await click('Scan again');
    expect(midi.connectedDeviceId).toBeNull();
    expect(text()).toContain('No keyboards found');
  });
});

// ---------------------------------------------------------------- P6: performance mode

/** Let promise chains (IndexedDB, saved sessions) run to the end, inside act. */
async function settle() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** Unmount and mount again in the same page, as a reload does (the stores are what survive). */
async function reload(deps: AppDeps, view: View = 'song') {
  act(() => root.unmount());
  root = createRoot(container);
  await render(deps, undefined, view);
  await settle();
}

/** A number on the Results page. */
const result = (name: string) => container.querySelector(`[data-result="${name}"]`)?.textContent ?? '';

const sectionAccuracy = (label: string) =>
  container.querySelector(`[data-section="${label}"] .t-mono`)?.textContent ?? '';

/** The histogram bars' counts: all of them, and only those inside the perfect window. */
function histogram(): { all: number; inside: number } {
  const bars = [...container.querySelectorAll<HTMLElement>('.histogram-bar')];
  const sum = (list: HTMLElement[]) => list.reduce((total, bar) => total + Number(bar.dataset.count), 0);
  return { all: sum(bars), inside: sum(bars.filter((bar) => bar.classList.contains('is-in'))) };
}

/** What the timing chart says to a screen reader. */
const histogramLabel = () => container.querySelector('.histogram')?.getAttribute('aria-label') ?? '';

type ExampleSong = typeof twinkle | typeof frere;

/** A performance always counts in one bar. */
const countIn = (song: ExampleSong) =>
  ((song.tempo.beats[1] ?? 0) - (song.tempo.beats[0] ?? 0)) * song.timeSignature.num;

interface Press {
  /** Song seconds; the count-in is added. */
  at: number;
  midi: number;
}

/**
 * Play a performance on the practice screen, which must already be in Performance: Play,
 * each press at its time, then let the song run out. React must not commit from the first
 * frame after Play until the run ends (rule 5).
 */
async function perform(h: ReturnType<typeof harness>, song: ExampleSong, presses: Press[]) {
  await click('Play');
  act(() => h.frames.step());
  const before = commits;
  const lead = countIn(song);
  for (const press of [...presses].sort((a, b) => a.at - b.at)) {
    act(() => {
      h.transport.advanceTo(lead + press.at);
      h.midi.emitNoteOn(press.midi, { time: h.transport.audioTime });
      h.midi.emitNoteOff(press.midi, { time: h.transport.audioTime });
      h.frames.step();
    });
    expect(commits).toBe(before);
  }
  await act(async () => {
    h.transport.advanceTo(lead + song.durationSec + 1);
  });
  await settle();
  expect(commits).toBeGreaterThan(before); // the run ended: now React renders the result
}

/**
 * Twinkle, both hands: the right hand on time in phrase 1 and 80 ms late in phrase 2, the
 * left hand on time in phrase 1 and silent in phrase 2, and two wrong notes.
 */
function twinklePresses(): Press[] {
  const presses: Press[] = [];
  for (const note of twinkle.notes) {
    const phraseTwo = note.start >= 4.8;
    if (note.hand === 'right') presses.push({ at: note.start + (phraseTwo ? 0.08 : 0), midi: note.midi });
    else if (!phraseTwo) presses.push({ at: note.start, midi: note.midi });
  }
  presses.push({ at: 1, midi: 100 }, { at: 5, midi: 100 });
  return presses;
}

/** Frère Jacques (right hand only): bar 1 on time, then two notes 150 ms early and two missed. */
const FRERE_PRESSES: Press[] = [
  { at: 0, midi: 65 },
  { at: 0.5, midi: 67 },
  { at: 1, midi: 69 },
  { at: 1.5, midi: 65 },
  { at: 1.85, midi: 65 },
  { at: 2.35, midi: 67 },
];

/**
 * Results worked out by hand from the presses above and ADR 0006 (perfect 1, good 0.7,
 * ok 0.4, a wrong note costs 0.5 of a note):
 *
 * Twinkle: 14 right-hand and 7 left-hand notes, 21 in all.
 * - Right: 7 perfect + 7 good (80 ms) = (7 + 4.9) / 14 = 85%.
 * - Left: 3 perfect, 4 missed = 3 / 7 = 43%.
 * - Phrase 1 (0–4.8 s): 10 perfect of 10 = 100%. Phrase 2: 7 good, 4 missed = 4.9 / 11 = 45%.
 * - Total: 10 perfect + 7 good of 21 = 14.9 / 21 = 71%; 17 of 21 notes in time.
 * - Score: 100 × (14.9 − 2 × 0.5) / 21 = 66.2, shown as 66.
 * - Timing: (10 × 0 + 7 × 80 ms) / 17 = +33 ms, slightly late; a spread of 0 and 80 ms is uneven.
 * - Bars (2.4 s): 1 and 2 are perfect; 3 is 2.8 / 6 and 4 is 2.1 / 5. Bars 3–4 together
 *   are 4.9 / 11 = 45%, with 4 of 11 missed: the only two-bar window under 90% that is free.
 *
 * Frère Jacques: 8 notes, two 2-second bars, no sections, so one phrase "Bars 1–2".
 * - 4 perfect + 2 ok (150 ms early) = (4 + 0.8) / 8 = 60%, score 60, 6 of 8 in time.
 * - Timing: (4 × 0 − 2 × 150 ms) / 6 = −50 ms, early; uneven.
 * - Trouble spot: bars 1–2 at 60%, 2 of 8 missed.
 */
const FIXTURES = [
  {
    name: 'Twinkle',
    song: twinkle as ExampleSong,
    presses: twinklePresses(),
    numbers: { score: '66', accuracy: '71%', timing: '+33 ms', 'timing-words': 'slightly late, uneven', wrong: '2' },
    hands: { right: '85%', left: '43%' },
    inTime: '17 of 21 notes in time',
    sections: { 'Phrase 1': '100%', 'Phrase 2': '45%' },
    trouble: { id: '3-4', title: 'Bars 3–4', detail: '45% in time · 4 of 11 notes missed' },
    histogram: { all: 17, inside: 10, right: 14, left: 3 },
    label: '10 of 17 notes within 50 milliseconds; 0 early, 10 on the beat, 7 late.',
  },
  {
    name: 'Frère Jacques',
    song: frere as ExampleSong,
    presses: FRERE_PRESSES,
    numbers: { score: '60', accuracy: '60%', timing: '−50 ms', 'timing-words': 'early, uneven', wrong: '0' },
    hands: { right: '60%', left: '–' },
    inTime: '6 of 8 notes in time',
    sections: { 'Bars 1–2': '60%' },
    trouble: { id: '1-2', title: 'Bars 1–2', detail: '60% in time · 2 of 8 notes missed' },
    histogram: { all: 6, inside: 4, right: 6, left: 0 },
    label: '4 of 6 notes within 50 milliseconds; 2 early, 4 on the beat, 0 late.',
  },
];

/** Open a song on its overview and go into Performance. */
async function startPerformance(h: ReturnType<typeof harness>, song: ExampleSong) {
  await render(h.deps, song, 'song');
  await settle();
  await click('Performance');
  expect(pressed('Performance')).toBe(true);
}

describe('rule 5 in performance mode', () => {
  it('a whole performance run (every press, flash and wrong note) renders React only when it ends', async () => {
    const h = harness();
    await h.midi.connect('fake-keyboard');
    await startPerformance(h, twinkle);
    // perform() checks the commit count after every press and frame.
    await perform(h, twinkle, twinklePresses());
    expect(text()).toContain('Performance results');
    expect(contexts.at(-1)?.ops.length).toBeGreaterThan(0); // the keyboard kept drawing
  });
});

describe('song overview', () => {
  it('opens on the song: scale, chords, the two ways to practise and no sessions yet', async () => {
    const h = harness();
    await render(h.deps, undefined, 'song');
    await settle();
    const chips = (name: string) =>
      [...container.querySelectorAll(`[data-overview=${name}] .chip`)].map((chip) => chip.textContent);
    expect(chips('scale')).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#']);
    expect(chips('chords')).toEqual(['G', 'C', 'D']);
    expect(text()).toContain('Nothing yet');
    expect(text()).not.toContain('See last performance');
    expect(container.querySelector('[aria-label=Practice]')).toBeNull();

    await click('Frère Jacques');
    await settle();
    expect(chips('scale')).toEqual(['F', 'G', 'A', 'Bb', 'C', 'D', 'E']);
    expect(text()).toContain('This song has no chords');

    await click('Start training');
    expect(pressed('Training')).toBe(true);
    await click('Back to song');
    expect(container.querySelector('[aria-label="Song overview"]')).not.toBeNull();
  });

  it('spells the scale the way the key signature does (D minor has a B flat)', async () => {
    const h = harness();
    const dMinor = { ...twinkle, tonality: { key: 'D', mode: 'minor', scale: [2, 4, 5, 7, 9, 10, 0] } };
    await render(h.deps, dMinor, 'song');
    await settle();
    const scale = [...container.querySelectorAll('[data-overview=scale] .chip')].map((chip) => chip.textContent);
    expect(scale).toEqual(['D', 'E', 'F', 'G', 'A', 'Bb', 'C']);
  });
});

describe('performance', () => {
  it.each(FIXTURES)('a run of $name ends on Results with the hand-checked numbers', async (fixture) => {
    const h = harness();
    await h.midi.connect('fake-keyboard');
    await startPerformance(h, fixture.song);
    expect(readout('waiting')).toBe('Press Play. After the count-in, play straight through.');
    await perform(h, fixture.song, fixture.presses);

    expect(text()).toContain('Performance results');
    expect(text()).toContain('Both hands · 100% tempo · full song');
    for (const [name, value] of Object.entries(fixture.numbers)) expect(result(name), name).toBe(value);
    expect(result('right-hand')).toBe(fixture.hands.right);
    expect(result('left-hand')).toBe(fixture.hands.left);
    expect(text()).toContain(fixture.inTime);
    for (const [label, value] of Object.entries(fixture.sections)) {
      expect(sectionAccuracy(label), label).toBe(value);
    }

    const spots = [...container.querySelectorAll<HTMLElement>('[data-trouble]')];
    expect(spots.map((spot) => spot.dataset.trouble)).toEqual([fixture.trouble.id]);
    expect(spots[0]?.textContent).toContain(fixture.trouble.title);
    expect(spots[0]?.textContent).toContain(fixture.trouble.detail);

    expect(histogram()).toEqual({ all: fixture.histogram.all, inside: fixture.histogram.inside });
    expect(histogramLabel()).toBe(`Timing histogram: ${fixture.label}`);
    await click('Right');
    expect(histogram().all).toBe(fixture.histogram.right);
    await click('Left');
    expect(histogram().all).toBe(fixture.histogram.left);
    // The keyboard and latency panels are out of the way, but still mounted.
    expect(container.querySelector('[aria-labelledby=midi-title]')?.closest('[hidden]')).not.toBeNull();
  });

  it('locks the run, and Finish ends it early with the notes that were due', async () => {
    const h = harness();
    await h.midi.connect('fake-keyboard');
    await startPerformance(h, twinkle);
    await click('Play');
    expect(button('Slower').disabled).toBe(true);
    expect(button('Training').disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[type=range]')?.disabled).toBe(true);
    const lead = countIn(twinkle);
    act(() => {
      for (const note of twinkle.notes.filter((n) => n.start < 2.4 && n.hand === 'right')) {
        h.transport.advanceTo(lead + note.start);
        h.midi.emitNoteOn(note.midi, { time: h.transport.audioTime });
        h.midi.emitNoteOff(note.midi, { time: h.transport.audioTime });
      }
      h.transport.advanceTo(lead + 2.3);
      h.frames.step();
    });
    expect(readout('steps')).toBe('4 in time · 0 wrong');
    await click('Finish');
    await settle();
    expect(h.transport.state).toBe('stopped');
    // Bar 1 was due: four right-hand notes hit, the opening bass note missed.
    expect(text()).toContain('4 of 5 notes in time');
    expect(result('left-hand')).toBe('0%');
  });

  it('says a run is too short to score when it ends in the count-in', async () => {
    const h = harness();
    await h.midi.connect('fake-keyboard');
    await startPerformance(h, twinkle);
    await click('Play');
    act(() => h.transport.advanceTo(1));
    await click('Finish');
    await settle();
    expect(text()).toContain('Too short to score');
    expect(container.querySelector('.histogram')).toBeNull();
  });

  it('loops a trouble spot in training, lists the run, reopens it and plays again', async () => {
    const h = harness();
    await h.midi.connect('fake-keyboard');
    await startPerformance(h, twinkle);
    await perform(h, twinkle, twinklePresses());

    await click('Loop bars 3–4 in training');
    expect(pressed('Training')).toBe(true);
    expect(pressed('Loop bars 3–4')).toBe(true);
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="Loop from"]')?.value).toBe('3');

    await click('Back to song');
    await settle();
    const rows = [...container.querySelectorAll('[data-session]')];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('Performance');
    expect(rows[0]?.textContent).toContain('66');
    expect(rows[0]?.textContent).toContain('100% tempo, both hands');

    await click('See last performance');
    expect(result('score')).toBe('66');
    await click('Play again');
    expect(pressed('Performance')).toBe(true);
    expect(readout('waiting')).toBe('Press Play. After the count-in, play straight through.');
  });

  it('keeps a training run as a session too', async () => {
    const h = harness();
    await h.midi.connect('fake-keyboard');
    await render(h.deps, undefined, 'song');
    await settle();
    await click('Start training');
    await click('Right hand');
    await click('Play');
    act(() => {
      h.transport.advanceBy(0.1);
      h.frames.step();
    });
    expect(readout('waiting')).toBe('Waiting for G4');
    act(() => h.midi.emitNoteOn(67, { time: h.transport.audioTime }));
    act(() => h.midi.emitNoteOff(67, { time: h.transport.audioTime }));
    await click('Stop');
    await click('Back to song');
    await settle();
    const row = container.querySelector('[data-session=training]');
    expect(row?.textContent).toContain('Training');
    expect(row?.textContent).toContain('1 of 1 right first time');
    expect(text()).not.toContain('See last performance'); // a training run has no result page
  });

  it('a performance left half way is not kept', async () => {
    const h = harness();
    await h.midi.connect('fake-keyboard');
    await startPerformance(h, twinkle);
    await click('Play');
    act(() => h.transport.advanceTo(4));
    await click('Back to song');
    await settle();
    expect(h.transport.state).toBe('stopped');
    expect(container.querySelectorAll('[data-session]')).toHaveLength(0);
  });
});

describe('kept on this device', () => {
  function memoryStorage() {
    const items = new Map<string, string>();
    return {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    };
  }

  it('remembers the keyboard size, "play my notes" and the last keyboard after a reload', async () => {
    const storage = memoryStorage();
    const first = harness({ settings: new LocalSettingsStore(() => storage) });
    await render(first.deps);
    await click('49 keys');
    await click("My keyboard's sound");
    await click('Find my keyboard');
    await act(async () => {
      container.querySelector<HTMLInputElement>('input[type=radio]')?.click();
    });
    expect(first.midi.connectedDeviceId).toBe('fake-keyboard');

    const second = harness({ settings: new LocalSettingsStore(() => storage) });
    await reload(second.deps, 'practice');
    expect(pressed('49 keys')).toBe(true);
    expect(pressed("My keyboard's sound")).toBe(true);
    // The keyboard from last time is connected as soon as a scan finds it, and sound
    // starts inside the click, not after the scan's await (ADR 0004).
    const find = button('Find my keyboard');
    act(() => find.click());
    expect(second.resume).toHaveBeenCalledTimes(1);
    await settle();
    expect(second.midi.connectedDeviceId).toBe('fake-keyboard');
    expect(text()).toContain('Connected');
  });

  it('keeps sessions in IndexedDB across a reload', async () => {
    const database = new IDBFactory();
    const first = harness({ sessions: new IndexedDbSessionStore(() => database) });
    await first.midi.connect('fake-keyboard');
    await startPerformance(first, frere);
    await perform(first, frere, FRERE_PRESSES);
    expect(text()).not.toContain("couldn't save");

    const second = harness({ sessions: new IndexedDbSessionStore(() => database) });
    await reload(second.deps);
    await click('Frère Jacques');
    await settle();
    const rows = [...container.querySelectorAll('[data-session=performance]')];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('60');
    await click('See last performance');
    expect(result('score')).toBe('60');
    expect(sectionAccuracy('Bars 1–2')).toBe('60%');
  });

  it('copes with a session store that rejects: no history, and the result says it was not saved', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing: SessionStore = {
      persistent: true,
      add: () => Promise.reject(new Error('quota exceeded')),
      list: () => Promise.reject(new Error('database closed')),
    };
    const h = harness({ sessions: failing });
    await h.midi.connect('fake-keyboard');
    await startPerformance(h, frere);
    await click('Back to song');
    expect(text()).toContain('Nothing yet'); // not a skeleton for ever
    await click('Performance');
    await perform(h, frere, FRERE_PRESSES);
    expect(result('score')).toBe('60');
    expect(text()).toContain("Isai couldn't save this result on this browser");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('still works when localStorage and IndexedDB throw (private mode), and says nothing is saved', async () => {
    const denied = (): never => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    const h = harness({
      settings: new LocalSettingsStore(denied),
      sessions: new ResilientSessionStore(new IndexedDbSessionStore(denied)),
    });
    await h.midi.connect('fake-keyboard');
    await startPerformance(h, frere);
    await click('49 keys');
    expect(pressed('49 keys')).toBe(true); // the choice holds for the visit
    await perform(h, frere, FRERE_PRESSES);
    expect(result('score')).toBe('60');
    expect(text()).toContain("Isai couldn't save this result on this browser");

    await click('Back to song');
    await settle();
    expect(container.querySelectorAll('[data-session=performance]')).toHaveLength(1);
    expect(text()).toContain("Isai can't save on this browser");
  });
});

describe('latency card', () => {
  const PERIOD = 60 / CALIBRATION.bpm;
  const ALL_CLICKS = Array.from({ length: CALIBRATION.clicks }, (_, i) => i);

  async function connectKeyboard() {
    await click('Find my keyboard');
    await act(async () => {
      container.querySelector<HTMLInputElement>('input[type=radio]')?.click();
    });
  }

  /** Tap `late` seconds after each listed click (transport position 0 is heard first). */
  function tap(h: ReturnType<typeof harness>, clicks: number[], late: number) {
    for (const i of clicks) {
      act(() => {
        h.transport.advanceTo(CALIBRATION.start + i * PERIOD + late);
        h.midi.emitNoteOn(60, { time: h.transport.audioTime });
        h.midi.emitNoteOff(60, { time: h.transport.audioTime });
      });
    }
  }

  async function runOut(h: ReturnType<typeof harness>) {
    await act(async () => {
      h.transport.advanceTo(CALIBRATION.start + CALIBRATION.clicks * PERIOD + 0.1);
    });
  }

  it('calibrates the connected keyboard, and the offset is taken off a performance', async () => {
    const h = harness();
    await render(h.deps, frere, 'song');
    await settle();
    expect(button('Calibrate').disabled).toBe(true);
    expect(text()).toContain('Connect your keyboard above to calibrate it');
    await connectKeyboard();
    expect(button('Calibrate').disabled).toBe(false);

    await click('Calibrate');
    expect(text()).toContain('Tap any key in time with the clicks');
    tap(h, ALL_CLICKS, 0.03);
    await runOut(h);
    expect(readout('offset')).toBe('+30 ms');
    expect(text()).toContain('Set to +30 ms, from 12 taps.'); // the four lead-in clicks don't count
    expect(onsOf(h.metronome)).toHaveLength(CALIBRATION.clicks);
    expect(h.transport.state).toBe('stopped');

    // Every press 30 ms late is on time once the offset is taken off.
    await click('Performance');
    await perform(
      h,
      frere,
      frere.notes.map((n) => ({ at: n.start + 0.03, midi: n.midi })),
    );
    expect(result('score')).toBe('100');
    expect(result('timing')).toBe('0 ms');
    expect(result('timing-words')).toBe('on the beat, steady');
    expect(histogramLabel()).toBe('Timing histogram: 8 of 8 notes within 50 milliseconds; 0 early, 8 on the beat, 0 late.');
  });

  it('keeps Play off while the clicks run', async () => {
    const h = harness();
    await render(h.deps, frere);
    await connectKeyboard();
    await click('Calibrate');
    expect(button('Play').disabled).toBe(true);
    await click('Stop the clicks');
    expect(button('Play').disabled).toBe(false);
    expect(h.transport.state).toBe('stopped');
  });

  it('says so when it hears too few steady taps, and keeps the old offset', async () => {
    const h = harness();
    await render(h.deps, frere, 'song');
    await connectKeyboard();
    await click('Calibrate');
    tap(h, [4, 5, 6], 0.03);
    await runOut(h);
    expect(container.querySelector('[role=alert]')?.textContent).toContain("couldn't hear enough steady taps");
    expect(readout('offset')).toBe('0 ms');
  });

  it('"Play any key to test" shows the offset of each tap until the clicks are stopped', async () => {
    const h = harness();
    await render(h.deps, frere, 'song');
    await connectKeyboard();
    await click('Play any key to test');
    expect(readout('tap')).toBe('–');
    const before = commits;
    tap(h, [0], 0.02);
    expect(readout('tap')).toBe('+20 ms');
    tap(h, [1], -0.015);
    expect(readout('tap')).toBe('−15 ms');
    expect(commits).toBe(before); // each tap is written through a ref (rule 5)
    await click('Stop the clicks');
    expect(h.transport.state).toBe('stopped');
    expect(container.querySelector('[data-readout=tap]')).toBeNull();
    expect(readout('offset')).toBe('0 ms'); // testing never changes the offset
  });
});
