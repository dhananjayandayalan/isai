// Plays the notes you play on your MIDI keyboard through Isai's piano ("Play my notes
// through Isai"). Off for a digital piano with its own speakers. The sustain pedal holds
// released notes until it comes up (ADR 0007); the velocity curve shapes your touch.

import type { Instrument } from '../audio/types';
import { applyVelocityCurve, type VelocityCurve } from '../audio/velocity';
import type { MidiInput, Unsubscribe } from '../midi/MidiInput';

export interface MonitorOptions {
  /** The instrument to play, or null while audio hasn't loaded. */
  instrument: () => Instrument | null;
  /** Read on every note-on, so the toggle takes effect at once. */
  enabled: () => boolean;
  /** Read on every note-on; normal when left out. */
  velocityCurve?: () => VelocityCurve;
}

export function monitorMidi(midi: MidiInput, options: MonitorOptions): Unsubscribe {
  // Notes this monitor started, so turning the toggle off mid-note still releases them.
  const sounding = new Set<number>();
  /** Keys let go while the pedal was down: still sounding until it comes up. */
  const sustained = new Set<number>();
  let pedalDown = false;

  const release = (note: number) => {
    sustained.delete(note);
    if (sounding.delete(note)) options.instrument()?.noteOff(note);
  };

  const offOn = midi.onNoteOn((e) => {
    // A key struck again under the pedal: end the held note before the new one.
    if (sustained.has(e.note)) release(e.note);
    const instrument = options.instrument();
    if (!instrument || !options.enabled()) return;
    const velocity = applyVelocityCurve(e.velocity, options.velocityCurve?.() ?? 'normal');
    instrument.noteOn(e.note, velocity); // no time: play now, without lookahead
    sounding.add(e.note);
  });
  const offOff = midi.onNoteOff((e) => {
    if (pedalDown && sounding.has(e.note)) sustained.add(e.note);
    else release(e.note);
  });
  const offPedal = midi.onPedal((e) => {
    pedalDown = e.down;
    if (pedalDown) return;
    for (const note of [...sustained]) release(note);
  });
  return () => {
    offOn();
    offOff();
    offPedal();
    const instrument = options.instrument();
    for (const note of sounding) instrument?.noteOff(note);
    sounding.clear();
    sustained.clear();
  };
}
