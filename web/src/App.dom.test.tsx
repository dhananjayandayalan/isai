// @vitest-environment jsdom
import { act, Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import frere from '../../schema/examples/frere-jacques-a-cappella.json';
import App, { type AppDeps } from './App';
import { AudioEngine } from './audio/engine';
import { FakeInstrument } from './audio/FakeInstrument';
import { FakeTransport } from './audio/FakeTransport';
import type { InstrumentSound } from './audio/types';
import { FakeMidiInput } from './midi/FakeMidiInput';
import type { MidiInput } from './midi/MidiInput';
import { MidiError } from './midi/WebMidiInput';
import { ManualFrames, RecordingContext } from './piano/testing';

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
  frames: ManualFrames;
}

interface HarnessOptions {
  midi?: MidiInput;
  sound?: InstrumentSound;
  failAudio?: boolean;
  /** Hold the audio load until the test calls `finishLoading()`. */
  slowAudio?: boolean;
}

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
  const deps: AppDeps = { audio, midi: options.midi ?? fakeMidi, frames };
  return {
    ...({ deps, midi: fakeMidi, transport, piano, frames } satisfies Harness),
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

async function render(deps: AppDeps, source?: unknown) {
  await act(async () => {
    root.render(
      <Profiler id="app" onRender={() => commits++}>
        <App deps={deps} {...(source === undefined ? {} : { source })} />
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

describe('rule 5: no React render per note', () => {
  it('200 MIDI notes and 100 playing frames cause no React commits', async () => {
    const h = harness();
    await h.midi.connect('fake-keyboard');
    await render(h.deps);
    await click('Play');
    expect(h.transport.state).toBe('started');
    act(() => h.frames.step()); // settle the first frame after mounting

    const before = commits;
    const readout = container.querySelector('.t-mono')?.textContent;
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
    expect(container.querySelector('.t-mono')?.textContent).not.toBe(readout);
    expect(container.querySelector('.t-mono')?.textContent).toBe('0:03 / 0:09');
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
    expect(h.transport.seconds).toBe(4.5);
  });

  it('switching songs disposes the old player', async () => {
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
    expect(text()).not.toContain("don't fit");
    await click('49 keys');
    expect(button('49 keys').getAttribute('aria-pressed')).toBe('true');
    expect(text()).toContain("1 notes don't fit on 49 keys");
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
