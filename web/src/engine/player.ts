// Plays a Song on the transport (ADR 0004): every note-on and note-off is scheduled on the
// audio clock once, and the transport fires them as the song advances. No timers.

import type { Instrument, Transport } from '../audio/types';
import type { Unsubscribe } from '../midi/MidiInput';
import type { Song } from '../song';

export type PlayerState = 'stopped' | 'playing' | 'paused';

export interface Player {
  readonly state: PlayerState;
  /** Song position in seconds; read it every frame, it is not React state. */
  readonly seconds: number;
  readonly duration: number;
  play(): void;
  pause(): void;
  /** Stop and go back to the start. */
  stop(): void;
  /** Move to a position (clamped to the song); keeps playing if playing. */
  seek(seconds: number): void;
  /** Called on play / pause / stop transitions only, never per note. */
  onStateChange(listener: (state: PlayerState) => void): Unsubscribe;
  /** Clear everything this player scheduled. */
  dispose(): void;
}

export function createPlayer(song: Song, transport: Transport, instrument: Instrument): Player {
  const duration = song.durationSec;
  const listeners = new Set<(state: PlayerState) => void>();
  let state: PlayerState = 'stopped';
  // Notes sounding per key, so the end of one note doesn't cut off an overlapping note on
  // the same key (Tone releases every voice of a pitch at once).
  const sounding = new Uint16Array(128);

  const silence = () => {
    instrument.releaseAll();
    sounding.fill(0);
  };

  const setState = (next: PlayerState) => {
    if (next === state) return;
    state = next;
    for (const listener of [...listeners]) listener(next);
  };

  const ids: number[] = [];
  for (const note of song.notes) {
    if (note.velocity === 0) continue; // silent by MIDI convention; the keyboard still lights it
    ids.push(
      transport.schedule(note.start, (time) => {
        sounding[note.midi] = (sounding[note.midi] ?? 0) + 1;
        instrument.noteOn(note.midi, note.velocity, time);
      }),
      transport.schedule(note.end, (time) => {
        const count = sounding[note.midi] ?? 0;
        if (count === 0) return; // started before a seek or pause; already released
        sounding[note.midi] = count - 1;
        if (count === 1) instrument.noteOff(note.midi, time);
      }),
    );
  }
  ids.push(
    transport.schedule(duration, () => {
      player.stop();
    }),
  );

  const player: Player = {
    get state() {
      return state;
    },
    get seconds() {
      return Math.min(transport.seconds, duration);
    },
    duration,
    play() {
      if (state === 'playing') return;
      transport.start();
      setState('playing');
    },
    pause() {
      if (state !== 'playing') return;
      transport.pause();
      silence();
      setState('paused');
    },
    stop() {
      transport.stop();
      silence();
      setState('stopped');
    },
    seek(seconds) {
      transport.seek(Math.min(Math.max(seconds, 0), duration));
      silence();
      if (state === 'stopped') setState('paused');
    },
    onStateChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      for (const id of ids.splice(0)) transport.clear(id);
      transport.stop();
      silence();
      listeners.clear();
    },
  };
  return player;
}
