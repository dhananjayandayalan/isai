// Two players share one piano: Isai (the practice engine) and the learner (their MIDI keys
// through "Play my notes through Isai"). The instrument releases every voice of a pitch at
// once, so without this a note-off from one player would cut the other's note on the same
// key. Each player gets a part; a key is released only when no part still holds it.

import type { Instrument } from './types';

interface Sharing {
  /** How many parts hold each key. */
  readonly holders: Uint8Array;
  readonly parts: Map<string, Instrument>;
}

const sharings = new WeakMap<Instrument, Sharing>();

/**
 * `owner`'s part of `instrument`. The same part comes back for the same instrument and
 * owner, so callers don't have to keep it. A part's `noteOff` and `releaseAll` only stop
 * what that part started.
 */
export function instrumentPart(instrument: Instrument, owner: string): Instrument {
  let sharing = sharings.get(instrument);
  if (!sharing) {
    sharing = { holders: new Uint8Array(128), parts: new Map() };
    sharings.set(instrument, sharing);
  }
  let part = sharing.parts.get(owner);
  if (!part) {
    part = createPart(instrument, sharing.holders);
    sharing.parts.set(owner, part);
  }
  return part;
}

function createPart(instrument: Instrument, holders: Uint8Array): Instrument {
  /** 1 for every key this part holds. */
  const mine = new Uint8Array(128);

  const noteOff = (midi: number, time?: number) => {
    if (!mine[midi]) return; // not this part's note (or out of range)
    mine[midi] = 0;
    const left = (holders[midi] ?? 1) - 1;
    holders[midi] = left;
    if (left === 0) instrument.noteOff(midi, time);
  };

  return {
    loaded: instrument.loaded,
    noteOn(midi, velocity, time) {
      if (midi >= 0 && midi <= 127 && !mine[midi]) {
        mine[midi] = 1;
        holders[midi] = (holders[midi] ?? 0) + 1;
      }
      instrument.noteOn(midi, velocity, time);
    },
    noteOff,
    releaseAll(time) {
      for (let midi = 0; midi < mine.length; midi++) noteOff(midi, time);
    },
  };
}
