// @vitest-environment jsdom
import { act, Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import frere from '../../schema/examples/frere-jacques-a-cappella.json';
import twinkle from '../../schema/examples/twinkle-g-major.json';
import App, { type AppDeps } from './App';
import { AudioEngine } from './audio/engine';
import { FakeInstrument } from './audio/FakeInstrument';
import { FakeTransport } from './audio/FakeTransport';
import type { InstrumentSound } from './audio/types';
import { FakeMidiInput } from './midi/FakeMidiInput';
import type { MidiInput } from './midi/MidiInput';
import { MidiError } from './midi/WebMidiInput';
import { ManualFrames, RecordingContext } from './piano/testing';
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

describe('practice screen', () => {
  const frame = (h: { transport: FakeTransport; frames: ManualFrames }, seconds = 0) =>
    act(() => {
      if (seconds > 0) h.transport.advanceBy(seconds);
      h.frames.step();
    });

  it('starts in Listen, with Performance still to come', async () => {
    const h = harness();
    await render(h.deps);
    expect(pressed('Listen')).toBe(true);
    expect(pressed('Training')).toBe(false);
    expect(button('Performance Coming soon').disabled).toBe(true);
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
    expect(text()).toContain('and training skips them');
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
