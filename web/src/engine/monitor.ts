// Plays the notes you play on your MIDI keyboard through Isai's piano ("Play my notes
// through Isai"). Off for a digital piano with its own speakers.

import type { Instrument } from '../audio/types';
import type { MidiInput, Unsubscribe } from '../midi/MidiInput';

export interface MonitorOptions {
  /** The instrument to play, or null while audio hasn't loaded. */
  instrument: () => Instrument | null;
  /** Read on every note-on, so the toggle takes effect at once. */
  enabled: () => boolean;
}

export function monitorMidi(midi: MidiInput, options: MonitorOptions): Unsubscribe {
  // Notes this monitor started, so turning the toggle off mid-note still releases them.
  const sounding = new Set<number>();
  const offOn = midi.onNoteOn((e) => {
    const instrument = options.instrument();
    if (!instrument || !options.enabled()) return;
    instrument.noteOn(e.note, e.velocity); // no time: play now, without lookahead
    sounding.add(e.note);
  });
  const offOff = midi.onNoteOff((e) => {
    if (sounding.delete(e.note)) options.instrument()?.noteOff(e.note);
  });
  return () => {
    offOn();
    offOff();
    const instrument = options.instrument();
    for (const note of sounding) instrument?.noteOff(note);
    sounding.clear();
  };
}
