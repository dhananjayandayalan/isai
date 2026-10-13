import { describe, expect, it } from 'vitest';
import twinkle from '../../../schema/examples/twinkle-g-major.json';
import { FakeInstrument } from '../audio/FakeInstrument';
import { FakeTransport } from '../audio/FakeTransport';
import { parseSong, type Note, type Song } from '../song';
import { activeNotesAt, buildNoteIndex, type ActiveNote } from './activeNotes';
import { createPlayer, type PlayerState } from './player';

function note(start: number, end: number, midi: number, hand: Note['hand'] = 'right', velocity = 80): Note {
  return { start, end, midi, velocity, hand, source: 'arranged' };
}

function songWith(notes: Note[], durationSec = 10): Song {
  const base = parseSong(twinkle);
  return { ...base, durationSec, notes };
}

const midis = (active: ActiveNote[]) => active.map((n) => n.midi).sort((a, b) => a - b);

describe('activeNotesAt', () => {
  const index = buildNoteIndex([
    note(2, 3, 64),
    note(0, 1, 60, 'left'),
    note(0.5, 4, 48, 'left'), // long note spanning others
    note(1, 2, 62),
  ]);

  it('returns notes with start <= t < end', () => {
    expect(midis(activeNotesAt(index, 0))).toEqual([60]);
    expect(midis(activeNotesAt(index, 0.75))).toEqual([48, 60]);
    expect(midis(activeNotesAt(index, 1))).toEqual([48, 62]); // 60 ends exactly at 1
    expect(midis(activeNotesAt(index, 2.5))).toEqual([48, 64]);
    expect(midis(activeNotesAt(index, 3.99))).toEqual([48]);
    expect(activeNotesAt(index, 4)).toEqual([]);
    expect(activeNotesAt(index, -1)).toEqual([]);
  });

  it('keeps the hand of each note', () => {
    const hands = activeNotesAt(index, 0.75).map((n) => `${n.midi}:${n.hand}`).sort();
    expect(hands).toEqual(['48:left', '60:left']);
  });

  it('reuses the output array', () => {
    const out: ActiveNote[] = [{ midi: 1, hand: 'right' }];
    const result = activeNotesAt(index, 2.5, out);
    expect(result).toBe(out);
    expect(midis(out)).toEqual([48, 64]);
  });

  it('handles an empty song and a single note', () => {
    expect(activeNotesAt(buildNoteIndex([]), 0)).toEqual([]);
    const single = buildNoteIndex([note(1, 2, 72)]);
    expect(midis(activeNotesAt(single, 1.5))).toEqual([72]);
    expect(activeNotesAt(single, 2)).toEqual([]);
  });

  it('lists both of two overlapping notes on the same key', () => {
    const same = buildNoteIndex([note(0, 2, 60), note(1, 3, 60)]);
    expect(midis(activeNotesAt(same, 1.5))).toEqual([60, 60]);
    expect(midis(activeNotesAt(same, 2.5))).toEqual([60]);
  });

  it('matches a full scan on the example song', () => {
    const song = parseSong(twinkle);
    const idx = buildNoteIndex(song.notes);
    for (let t = 0; t <= song.durationSec; t += 0.05) {
      const expected = song.notes.filter((n) => n.start <= t && t < n.end).map((n) => n.midi);
      expect(midis(activeNotesAt(idx, t))).toEqual(expected.sort((a, b) => a - b));
    }
  });
});

function setup(notes: Note[], durationSec = 10) {
  const transport = new FakeTransport(100);
  const piano = new FakeInstrument();
  const player = createPlayer(songWith(notes, durationSec), transport, piano);
  const states: PlayerState[] = [];
  player.onStateChange((s) => states.push(s));
  return { transport, piano, player, states };
}

describe('player', () => {
  it('schedules note-on and note-off on the audio clock with velocity', () => {
    const { transport, piano, player } = setup([note(1, 2, 60, 'right', 90), note(0, 1.5, 48, 'left', 50)]);
    player.play();
    transport.advanceTo(3);
    expect(piano.calls).toEqual([
      { type: 'on', midi: 48, velocity: 50, time: 100 },
      { type: 'on', midi: 60, velocity: 90, time: 101 },
      { type: 'off', midi: 48, time: 101.5 },
      { type: 'off', midi: 60, time: 102 },
    ]);
  });

  it('moves through play, pause and stop, notifying only on changes', () => {
    const { transport, player, states, piano } = setup([note(0, 5, 60)]);
    expect(player.state).toBe('stopped');
    player.play();
    player.play();
    transport.advanceTo(2);
    player.pause();
    player.pause();
    expect(player.seconds).toBe(2);
    expect(piano.sounding.size).toBe(0); // pause silences
    player.play();
    transport.advanceTo(3);
    player.stop();
    expect(player.seconds).toBe(0);
    expect(states).toEqual(['playing', 'paused', 'playing', 'stopped']);
  });

  it('stops notifying unsubscribed listeners', () => {
    const { player } = setup([note(0, 1, 60)]);
    const seen: PlayerState[] = [];
    const unsubscribe = player.onStateChange((s) => seen.push(s));
    player.play();
    unsubscribe();
    player.pause();
    expect(seen).toEqual(['playing']);
  });

  it('resumes from the paused position', () => {
    const { transport, piano, player } = setup([note(1, 2, 60), note(3, 4, 62)]);
    player.play();
    transport.advanceTo(2.5);
    player.pause();
    player.play();
    transport.advanceTo(5);
    const ons = piano.calls.filter((c) => c.type === 'on').map((c) => c.midi);
    expect(ons).toEqual([60, 62]);
  });

  it('seeking mid-note leaves nothing hanging and skips earlier notes', () => {
    const { transport, piano, player } = setup([note(0, 3, 60), note(4, 5, 62)]);
    player.play();
    transport.advanceTo(1); // 60 is sounding
    player.seek(2);
    expect(piano.sounding.size).toBe(0);
    transport.advanceTo(6);
    // 60's note-off at 3 is ignored (already released); 62 plays normally.
    expect(piano.calls.filter((c) => c.type === 'off').map((c) => c.midi)).toEqual([62]);
    expect(piano.sounding.size).toBe(0);
  });

  it('seeking while stopped positions the song for the next play', () => {
    const { transport, piano, player, states } = setup([note(1, 2, 60), note(3, 4, 62)]);
    player.seek(2.5);
    expect(player.state).toBe('paused');
    expect(states).toEqual(['paused']);
    player.play();
    transport.advanceTo(5);
    expect(piano.calls.filter((c) => c.type === 'on').map((c) => c.midi)).toEqual([62]);
  });

  it('clamps seeks to the song', () => {
    const { player } = setup([note(0, 1, 60)], 4);
    player.seek(-3);
    expect(player.seconds).toBe(0);
    player.seek(99);
    expect(player.seconds).toBe(4);
  });

  it('keeps an overlapping note on the same key sounding until its own end', () => {
    const { transport, piano, player } = setup([note(0, 2, 60), note(1, 3, 60)]);
    player.play();
    transport.advanceTo(2.5);
    expect(piano.calls.filter((c) => c.type === 'off')).toEqual([]);
    expect(piano.sounding.has(60)).toBe(true);
    transport.advanceTo(4);
    expect(piano.calls.filter((c) => c.type === 'off')).toEqual([{ type: 'off', midi: 60, time: 103 }]);
  });

  it('stops at the end of the song', () => {
    const { transport, player, states } = setup([note(0, 1, 60)], 2);
    player.play();
    transport.advanceTo(10);
    expect(player.state).toBe('stopped');
    expect(player.seconds).toBe(0);
    expect(states).toEqual(['playing', 'stopped']);
  });

  it('plays an empty song and stops at once', () => {
    const { transport, piano, player } = setup([], 0);
    expect(player.duration).toBe(0);
    player.play();
    transport.advanceTo(0.1);
    expect(player.state).toBe('stopped');
    expect(piano.calls.filter((c) => c.type === 'on')).toEqual([]);
  });

  it('plays a single note', () => {
    const { transport, piano, player } = setup([note(0.5, 1, 67)], 1);
    player.play();
    transport.advanceTo(2);
    expect(piano.calls.filter((c) => c.type !== 'releaseAll').map((c) => c.type)).toEqual(['on', 'off']);
  });

  it('does not sound velocity-0 notes', () => {
    const { transport, piano, player } = setup([note(0, 1, 60, 'right', 0), note(0, 1, 64)]);
    player.play();
    transport.advanceTo(2);
    expect(piano.calls.filter((c) => c.type === 'on').map((c) => c.midi)).toEqual([64]);
  });

  it('dispose clears everything it scheduled', () => {
    const { transport, player, states } = setup([note(0, 1, 60), note(1, 2, 62)]);
    expect(transport.scheduledCount).toBe(5); // 2 notes x on/off + end of song
    player.dispose();
    expect(transport.scheduledCount).toBe(0);
    player.play();
    expect(states).toEqual([]); // listeners were dropped
  });

  it('schedules each note once, not per frame', () => {
    const song = parseSong(twinkle);
    const transport = new FakeTransport();
    createPlayer(song, transport, new FakeInstrument());
    expect(transport.scheduledCount).toBe(song.notes.length * 2 + 1);
  });
});
