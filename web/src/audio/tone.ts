// The only file that imports Tone.js (ADR 0004). `tone` is loaded with a dynamic import on
// the first Play or Connect click. The AudioContext is created and resumed in that click
// by AudioEngine, before this file has even loaded, because WebKit only starts audio that
// begins inside the gesture. Not unit-tested (it needs a real AudioContext); the
// interfaces it implements are exercised through FakeTransport / FakeInstrument.

import type { AudioClock } from '../midi/AudioClock';
import type { Instrument, InstrumentSound, LoadedAudio, Transport, TransportState } from './types';

type ToneModule = typeof import('tone');

/** Salamander Grand Piano (CC-BY 3.0, Alexander Holm), as hosted by Tone.js. */
export const DEFAULT_SAMPLES_URL = 'https://tonejs.github.io/audio/salamander/';

/** Sample files every minor third from A0 to C8; the Sampler pitch-shifts between them. */
export function salamanderUrls(): Record<string, string> {
  const urls: Record<string, string> = { A0: 'A0.mp3' };
  for (let octave = 1; octave <= 7; octave++) {
    urls[`C${octave}`] = `C${octave}.mp3`;
    urls[`D#${octave}`] = `Ds${octave}.mp3`;
    urls[`F#${octave}`] = `Fs${octave}.mp3`;
    urls[`A${octave}`] = `A${octave}.mp3`;
  }
  urls.C8 = 'C8.mp3';
  return urls;
}

/**
 * Build the transport and piano on `context`, which the caller created and resumed inside
 * a click. Nothing here waits for the context to run: if the browser left it suspended,
 * the next click resumes it (AudioEngine.load) and the song starts then.
 */
export async function createToneAudio(
  context: AudioContext,
  samplesUrl: string = DEFAULT_SAMPLES_URL,
): Promise<LoadedAudio> {
  const Tone = await import('tone');
  Tone.setContext(context);
  return {
    clock: audioClock(context),
    transport: toneTransport(Tone, context),
    piano: tonePiano(Tone, samplesUrl),
    metronome: toneClick(Tone),
  };
}

/** Map DOM timestamps onto the audio clock through one output timestamp pair (ADR 0004). */
function audioClock(context: AudioContext): AudioClock {
  return {
    now: () => context.currentTime,
    fromDomTimestamp(ms) {
      const stamp = context.getOutputTimestamp?.();
      if (stamp?.contextTime === undefined || stamp.performanceTime === undefined) {
        return context.currentTime;
      }
      return stamp.contextTime + (ms - stamp.performanceTime) / 1000;
    },
  };
}

function toneTransport(Tone: ToneModule, context: AudioContext): Transport {
  const transport = Tone.getTransport();
  return {
    get state() {
      return transport.state as TransportState;
    },
    get seconds() {
      // Position at the audio clock's "now", not Tone's now() (which adds the lookahead).
      return Math.max(0, transport.getSecondsAtTime(context.currentTime));
    },
    get lookahead() {
      return Tone.getContext().lookAhead;
    },
    start: () => {
      // Pass the position explicitly: after stop() + seek(), Tone would otherwise start at 0.
      transport.start(undefined, transport.seconds);
    },
    pause: (time) => {
      transport.pause(time);
    },
    stop: (time) => {
      transport.stop(time);
    },
    seek: (seconds) => {
      transport.seconds = seconds;
    },
    schedule: (at, callback) => transport.schedule((time) => callback(time), at),
    clear: (id) => {
      transport.clear(id);
    },
  };
}

function tonePiano(Tone: ToneModule, samplesUrl: string): Instrument {
  let voice: Voice | null = null;

  const loaded = new Promise<InstrumentSound>((resolve) => {
    let settled = false;
    const sampler = new Tone.Sampler({
      urls: salamanderUrls(),
      baseUrl: samplesUrl,
      release: 1,
      onload: () => {
        if (settled) return;
        settled = true;
        voice = sampler;
        resolve('sampled');
      },
      onerror: (error) => {
        if (settled) return;
        settled = true;
        // Kept in the console for whoever checks why the piano fell back to a synth.
        console.error('Isai: piano samples failed to load; using a synth.', error);
        sampler.dispose();
        voice = new Tone.PolySynth(Tone.Synth).toDestination();
        resolve('synth');
      },
    }).toDestination();
  });

  const hz = (midi: number) => Tone.Frequency(midi, 'midi').toFrequency();
  return {
    loaded,
    // Live notes (time omitted) skip Tone's lookahead so your keyboard sounds at once.
    noteOn(midi, velocity, time) {
      voice?.triggerAttack(hz(midi), time ?? Tone.immediate(), velocity / 127);
    },
    noteOff(midi, time) {
      voice?.triggerRelease(hz(midi), time ?? Tone.immediate());
    },
    releaseAll(time) {
      voice?.releaseAll(time ?? Tone.immediate());
    },
  };
}

/**
 * The metronome click: a very short synth blip. `noteOn` plays one whole click (the pitch
 * tells an accented beat from a plain one), so `noteOff` has nothing to do.
 */
function toneClick(Tone: ToneModule): Instrument {
  const synth = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
    volume: -6,
  }).toDestination();
  return {
    loaded: Promise.resolve('synth'),
    noteOn(midi, velocity, time) {
      const hz = Tone.Frequency(midi, 'midi').toFrequency();
      synth.triggerAttackRelease(hz, 0.04, time ?? Tone.immediate(), velocity / 127);
    },
    noteOff() {},
    releaseAll(time) {
      synth.triggerRelease(time ?? Tone.immediate());
    },
  };
}

/** What a Sampler and the PolySynth fallback have in common. */
interface Voice {
  triggerAttack(note: number, time: number, velocity: number): unknown;
  triggerRelease(note: number, time: number): unknown;
  releaseAll(time: number): unknown;
}
