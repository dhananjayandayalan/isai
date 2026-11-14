import { describe, expect, it } from 'vitest';
import twinkle from '../../../schema/examples/twinkle-g-major.json';
import type { KeySpec } from './keys';
import { NoteNamer, QUALITY_TEXT, type LaneChord } from './labels';
import { QUALITIES, RomanNumerals, type ChordQuality, type ChordShape } from './roman';

const C_MAJOR: KeySpec = { key: 'C', mode: 'major' };
const A_MINOR: KeySpec = { key: 'A', mode: 'minor' };
const chord = (root: number, quality: ChordQuality, bass?: number): ChordShape =>
  bass === undefined ? { root, quality } : { root, quality, bass };

describe('Roman numerals', () => {
  const c = new RomanNumerals(C_MAJOR);

  it('names the diatonic triads and sevenths of a major key', () => {
    const triads = [chord(0, 'maj'), chord(2, 'min'), chord(4, 'min'), chord(5, 'maj'), chord(7, 'maj'), chord(9, 'min'), chord(11, 'dim')];
    expect(triads.map((t) => c.numeral(t))).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
    const sevenths = [chord(0, 'maj7'), chord(2, 'min7'), chord(7, '7'), chord(11, 'hdim7')];
    expect(sevenths.map((t) => c.numeral(t))).toEqual(['IM7', 'ii7', 'V7', 'viiø7']);
  });

  it('has a numeral for every chord quality in the schema', () => {
    const expected: Record<ChordQuality, string> = {
      maj: 'V',
      min: 'v',
      dim: 'v°',
      aug: 'V+',
      sus2: 'Vsus2',
      sus4: 'Vsus4',
      '5': 'V5',
      maj6: 'Vadd6',
      min6: 'vadd6',
      '7': 'V7',
      maj7: 'VM7',
      min7: 'v7',
      minmaj7: 'vM7',
      dim7: 'v°7',
      hdim7: 'vø7',
      '9': 'V9',
      maj9: 'VM9',
      min9: 'v9',
      add9: 'Vadd9',
    };
    for (const quality of Object.keys(QUALITIES) as ChordQuality[]) {
      expect(c.numeral(chord(7, quality)), quality).toBe(expected[quality]);
    }
    expect(Object.keys(QUALITY_TEXT).sort()).toEqual(Object.keys(QUALITIES).sort());
  });

  it('writes inversions as figures', () => {
    expect(c.numeral(chord(0, 'maj', 4))).toBe('I6');
    expect(c.numeral(chord(0, 'maj', 7))).toBe('I64');
    expect(c.numeral(chord(11, 'dim', 2))).toBe('vii°6');
    expect(c.numeral(chord(7, '7', 11))).toBe('V65');
    expect(c.numeral(chord(7, '7', 2))).toBe('V43');
    expect(c.numeral(chord(7, '7', 5))).toBe('V42');
    expect(c.numeral(chord(11, 'hdim7', 2))).toBe('viiø65');
    expect(c.numeral(chord(0, 'maj7', 11))).toBe('IM42');
    expect(c.numeral(chord(2, 'min7', 2))).toBe('ii7'); // bass on the root is root position
  });

  it('names a bass that is not a chord tone, or a chord without figures, by its scale degree', () => {
    expect(c.numeral(chord(0, 'maj', 10))).toBe('I/♭7');
    expect(c.numeral(chord(5, 'maj', 7))).toBe('IV/5');
    expect(c.numeral(chord(7, 'sus4', 2))).toBe('Vsus4/2');
  });

  it('marks borrowed chords with accidentals', () => {
    expect(c.numeral(chord(10, 'maj'))).toBe('♭VII');
    expect(c.numeral(chord(8, 'maj'))).toBe('♭VI');
    expect(c.numeral(chord(3, 'maj'))).toBe('♭III');
    expect(c.numeral(chord(1, 'maj'))).toBe('♭II');
    expect(c.numeral(chord(5, 'min'))).toBe('iv');
    expect(c.numeral(chord(6, 'dim7'))).toBe('♯iv°7');
    // In E major, a C major chord is ♭VI (C natural, not B#).
    expect(new RomanNumerals({ key: 'E', mode: 'major' }).numeral(chord(0, 'maj'))).toBe('♭VI');
  });

  it('names secondary dominants by the chord they resolve to', () => {
    expect(c.numeral(chord(2, 'maj'), chord(7, 'maj'))).toBe('V/V');
    expect(c.numeral(chord(9, '7'), chord(2, 'min'))).toBe('V7/ii');
    expect(c.numeral(chord(4, '7'), chord(9, 'min'))).toBe('V7/vi');
    expect(c.numeral(chord(2, '7', 6), chord(7, 'maj'))).toBe('V65/V');
    // Not secondary: diatonic, resolving to I, not resolving, or resolving outside the key.
    expect(c.numeral(chord(7, '7'), chord(0, 'maj'))).toBe('V7');
    expect(c.numeral(chord(2, 'maj'), chord(0, 'maj'))).toBe('II');
    expect(c.numeral(chord(3, 'maj'), chord(8, 'maj'))).toBe('♭III');
    expect(c.numeral(chord(2, 'min'), chord(7, 'maj'))).toBe('ii');
  });

  it('counts a minor key from the natural minor, with the leading-tone chord as vii', () => {
    const a = new RomanNumerals(A_MINOR);
    const triads = [chord(9, 'min'), chord(11, 'dim'), chord(0, 'maj'), chord(2, 'min'), chord(4, 'min'), chord(5, 'maj'), chord(7, 'maj')];
    expect(triads.map((t) => a.numeral(t))).toEqual(['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']);
    expect(a.numeral(chord(4, 'maj'))).toBe('V');
    expect(a.numeral(chord(4, '7'), chord(9, 'min'))).toBe('V7'); // to the tonic: just V7
    expect(a.numeral(chord(8, 'dim7'))).toBe('vii°7');
    expect(a.numeral(chord(2, 'maj'))).toBe('IV');
    expect(a.degree(6)).toEqual({ index: 5, alteration: 1 }); // F#, the raised sixth
    expect(a.degree(3)).toEqual({ index: 3, alteration: 1 }); // D#, the raised fourth
  });

  it('counts a modal key from its own scale', () => {
    const dorian = new RomanNumerals({ key: 'D', mode: 'modal', scale: [2, 4, 5, 7, 9, 11, 0] });
    expect(dorian.numeral(chord(2, 'min'))).toBe('i');
    expect(dorian.numeral(chord(7, 'maj'))).toBe('IV');
    expect(dorian.numeral(chord(0, 'maj'))).toBe('VII');
  });

  it('names the chords of the Twinkle example', () => {
    const g = new RomanNumerals({ key: 'G', mode: 'major' });
    const chords = twinkle.chords as unknown as ChordShape[];
    expect(chords.map((ch, i) => g.numeral(ch, chords[i + 1]))).toEqual(['I', 'IV', 'I', 'IV', 'I', 'V', 'I']);
  });
});

describe('NoteNamer', () => {
  const G: KeySpec = { key: 'G', mode: 'major', scale: [7, 9, 11, 0, 2, 4, 6] };
  const D7: LaneChord = { root: 2, quality: '7', label: 'D7' };
  const AmOverC: LaneChord = { root: 9, quality: 'min', bass: 0, label: 'Am/C' };

  it('names notes in letters, with octave numbers on request', () => {
    expect(new NoteNamer(G).note(66)).toEqual({ text: 'F#', dotsAbove: 0, dotsBelow: 0 });
    expect(new NoteNamer(G, { octaves: true }).note(66).text).toBe('F#4');
    expect(new NoteNamer(G, { notation: 'roman' }).note(67).text).toBe('G');
    expect(new NoteNamer(G, { notation: 'staff' }).note(70, -1).text).toBe('Bb');
  });

  it('names notes in solfège', () => {
    const namer = new NoteNamer(G, { notation: 'solfege' });
    expect([67, 69, 71, 72].map((m) => namer.note(m).text)).toEqual(['Do', 'Re', 'Mi', 'Fa']);
    const minor = new NoteNamer({ key: 'E', mode: 'minor' }, { notation: 'solfege', minor: 'la' });
    expect(minor.note(64).text).toBe('La');
  });

  it('names notes in swaras, with octave dots', () => {
    const namer = new NoteNamer(G, { notation: 'swaras' });
    expect(namer.note(67)).toEqual({ text: 'S', dotsAbove: 0, dotsBelow: 0 });
    expect(namer.note(79)).toEqual({ text: 'S', dotsAbove: 1, dotsBelow: 0 });
    expect(namer.note(55)).toEqual({ text: 'S', dotsAbove: 0, dotsBelow: 1 });
    expect(new NoteNamer(G, { notation: 'swaras', swaraDetail: 'detailed' }).note(69).text).toBe('R2');
  });

  it('says a note in words for screen readers', () => {
    expect(new NoteNamer(G, { notation: 'swaras' }).spoken(79)).toBe('tara S');
    expect(new NoteNamer(G, { notation: 'swaras' }).spoken(67)).toBe('S');
    expect(new NoteNamer(G, { notation: 'solfege' }).spoken(74)).toBe('Sol');
    expect(new NoteNamer(G, { octaves: true }).spoken(60)).toBe('C4');
  });

  it('names chords for the lane in each system', () => {
    expect(new NoteNamer(G).chord(D7)).toBe('D7');
    expect(new NoteNamer(G, { notation: 'staff' }).chord(AmOverC)).toBe('Am/C');
    expect(new NoteNamer(G, { notation: 'roman' }).chord(D7, { root: 7, quality: 'maj' })).toBe('V7');
    expect(new NoteNamer(G, { notation: 'solfege' }).chord(D7)).toBe('Sol 7');
    expect(new NoteNamer(G, { notation: 'solfege' }).chord(AmOverC)).toBe('Re m/Fa');
    expect(new NoteNamer(G, { notation: 'swaras' }).chord({ root: 7, quality: 'maj', label: 'G' })).toBe('S');
    expect(new NoteNamer(G, { notation: 'swaras', swaraDetail: 'detailed' }).chord(AmOverC)).toBe('R2 m/M1');
  });
});
