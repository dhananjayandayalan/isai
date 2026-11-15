import { describe, expect, it } from 'vitest';
import { keyDegrees, LETTERS, scaleSteps, signature, wrapAccidental, type KeyMode, type KeySpec } from './keys';
import { solfege } from './solfege';
import { Speller, spelledName, staffStep } from './spelling';
import { MADHYA_BASE, octaveWord, SwaraNamer } from './swaras';

const major = (key: string): KeySpec => ({ key, mode: 'major' });
const minor = (key: string): KeySpec => ({ key, mode: 'minor' });

/** Every major and minor key name with its signature: + sharps, − flats. */
const SIGNATURES: [string, KeyMode, number][] = [
  ['C', 'major', 0],
  ['G', 'major', 1],
  ['D', 'major', 2],
  ['A', 'major', 3],
  ['E', 'major', 4],
  ['B', 'major', 5],
  ['F#', 'major', 6],
  ['C#', 'major', 7],
  ['F', 'major', -1],
  ['Bb', 'major', -2],
  ['Eb', 'major', -3],
  ['Ab', 'major', -4],
  ['Db', 'major', -5],
  ['Gb', 'major', -6],
  ['Cb', 'major', -7],
  ['A', 'minor', 0],
  ['E', 'minor', 1],
  ['B', 'minor', 2],
  ['F#', 'minor', 3],
  ['C#', 'minor', 4],
  ['G#', 'minor', 5],
  ['D#', 'minor', 6],
  ['A#', 'minor', 7],
  ['D', 'minor', -1],
  ['G', 'minor', -2],
  ['C', 'minor', -3],
  ['F', 'minor', -4],
  ['Bb', 'minor', -5],
  ['Eb', 'minor', -6],
  ['Ab', 'minor', -7],
];

describe('key signatures', () => {
  it.each(SIGNATURES)('%s %s has %i', (key, mode, expected) => {
    const spec = { key, mode };
    expect(signature(spec)).toBe(expected);
    const degrees = keyDegrees(spec);
    // Seven different letters, and the accidentals all go one way.
    expect(new Set(degrees.map((d) => d.letter)).size).toBe(7);
    expect(degrees.every((d) => Math.sign(d.accidental) * Math.sign(expected) >= 0)).toBe(true);
  });

  it('covers 30 key names', () => {
    expect(SIGNATURES).toHaveLength(30);
  });

  it("uses a modal key's own seven-note scale, and the major scale otherwise", () => {
    const dorian = { key: 'D', mode: 'modal' as const, scale: [2, 4, 5, 7, 9, 11, 0] };
    expect(scaleSteps(dorian)).toEqual([0, 2, 3, 5, 7, 9, 10]);
    expect(signature(dorian)).toBe(0);
    expect(scaleSteps({ key: 'D', mode: 'modal', scale: [2, 4, 6] })).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(scaleSteps({ key: 'D', mode: 'modal' })).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it('wraps accidentals into −6 … 5', () => {
    expect(wrapAccidental(11)).toBe(-1);
    expect(wrapAccidental(-11)).toBe(1);
    expect(wrapAccidental(0)).toBe(0);
  });
});

const names = (speller: Speller, midis: number[], octave = false) =>
  speller.line(midis).map((note) => spelledName(note, octave));

describe('spelling', () => {
  // The seven notes from each tonic, for all 12 tonics in major and minor.
  const TONICS_MAJOR: [string, string][] = [
    ['C', 'C D E F G A B'],
    ['Db', 'Db Eb F Gb Ab Bb C'],
    ['D', 'D E F# G A B C#'],
    ['Eb', 'Eb F G Ab Bb C D'],
    ['E', 'E F# G# A B C# D#'],
    ['F', 'F G A Bb C D E'],
    ['F#', 'F# G# A# B C# D# E#'],
    ['G', 'G A B C D E F#'],
    ['Ab', 'Ab Bb C Db Eb F G'],
    ['A', 'A B C# D E F# G#'],
    ['Bb', 'Bb C D Eb F G A'],
    ['B', 'B C# D# E F# G# A#'],
  ];
  const TONICS_MINOR: [string, string][] = [
    ['C', 'C D Eb F G Ab Bb'],
    ['C#', 'C# D# E F# G# A B'],
    ['D', 'D E F G A Bb C'],
    ['Eb', 'Eb F Gb Ab Bb Cb Db'],
    ['E', 'E F# G A B C D'],
    ['F', 'F G Ab Bb C Db Eb'],
    ['F#', 'F# G# A B C# D E'],
    ['G', 'G A Bb C D Eb F'],
    ['G#', 'G# A# B C# D# E F#'],
    ['A', 'A B C D E F G'],
    ['Bb', 'Bb C Db Eb F Gb Ab'],
    ['B', 'B C# D E F# G A'],
  ];

  function scaleNames(spec: KeySpec): string {
    const speller = new Speller(spec);
    return keyDegrees(spec)
      .map((d) => spelledName(speller.pitch(60 + d.pc)))
      .join(' ');
  }

  it.each(TONICS_MAJOR)('%s major is spelled %s', (key, expected) => {
    expect(scaleNames(major(key))).toBe(expected);
  });

  it.each(TONICS_MINOR)('%s minor is spelled %s', (key, expected) => {
    expect(scaleNames(minor(key))).toBe(expected);
  });

  it('spells F# in D major and Gb in Db major', () => {
    expect(spelledName(new Speller(major('D')).pitch(66))).toBe('F#');
    expect(spelledName(new Speller(major('Db')).pitch(66))).toBe('Gb');
  });

  it('raises a black key outside the key on the way up and lowers it on the way down', () => {
    const c = new Speller(major('C'));
    expect(names(c, [60, 61, 62])).toEqual(['C', 'C#', 'D']);
    expect(names(c, [62, 61, 60])).toEqual(['D', 'Db', 'C']);
    expect(names(c, [67, 68, 69])).toEqual(['G', 'G#', 'A']);
    expect(names(c, [69, 68, 67])).toEqual(['A', 'Ab', 'G']);
    // A whole ascending line raises every black key, until the last note, which stands alone.
    expect(names(c, [61, 63, 66, 68, 70])).toEqual(['C#', 'D#', 'F#', 'G#', 'Bb']);
  });

  it('decides a note on its own (or repeated) by the key: #4 and, in minor, the raised 3, 6 and 7', () => {
    const c = new Speller(major('C'));
    expect([61, 63, 66, 68, 70].map((m) => spelledName(c.pitch(m)))).toEqual(['Db', 'Eb', 'F#', 'Ab', 'Bb']);
    const a = new Speller(minor('A'));
    expect([61, 66, 68, 70].map((m) => spelledName(a.pitch(m)))).toEqual(['C#', 'F#', 'G#', 'Bb']);
    expect(names(a, [68, 68])).toEqual(['G#', 'G#']);
  });

  it('writes a white key outside the key as its plain letter, whichever way the line goes', () => {
    const f = new Speller(major('F'));
    expect(names(f, [71, 70, 69])).toEqual(['B', 'Bb', 'A']);
    expect(names(f, [69, 71, 72])).toEqual(['A', 'B', 'C']);
    // In E major, C natural (not B#); in Ab major, D natural (not Ebb).
    expect(spelledName(new Speller(major('E')).pitch(72))).toBe('C');
    expect(names(new Speller(major('Ab')), [63, 62, 61])).toEqual(['Eb', 'D', 'Db']);
  });

  it('keeps the octave with the letter: Cb4 is MIDI 59 and B#3 is MIDI 60', () => {
    expect(spelledName(new Speller(major('Gb')).pitch(59), true)).toBe('Cb4');
    expect(spelledName(new Speller(major('C#')).pitch(60), true)).toBe('B#3');
    expect(spelledName(new Speller(major('C')).pitch(21), true)).toBe('A0');
  });

  it('spells across a gap in a modal scale', () => {
    // Harmonic minor on A has a three-semitone gap from F to G#.
    const harmonic = new Speller({ key: 'A', mode: 'modal', scale: [9, 11, 0, 2, 4, 5, 8] });
    expect(spelledName(harmonic.pitch(68))).toBe('G#');
    expect(spelledName(harmonic.pitch(67))).toBe('G');
    expect(harmonic.isDiatonic(67)).toBe(false);
    expect(harmonic.isDiatonic(68)).toBe(true);
    // A black key in a gap with no neighbour in the scale either side: the letter below, raised.
    const noNeighbours = new Speller({ key: 'C', mode: 'modal', scale: [0, 1, 2, 4, 5, 7, 8] });
    expect(spelledName(noNeighbours.pitch(70))).toBe('A#');
  });

  it('writes double accidentals where the key itself has them', () => {
    // Fb major has Bbb as its fourth degree.
    expect(spelledName(new Speller(major('Fb')).pitch(69))).toBe('Bbb');
    // In G# minor the leading tone is written G, the plain letter, rather than F##.
    expect(spelledName(new Speller(minor('G#')).pitch(67))).toBe('G');
  });

  it('gives each letter and octave its own staff step', () => {
    const c = new Speller(major('C'));
    expect(staffStep(c.pitch(60))).toBe(28);
    expect(staffStep(c.pitch(62))).toBe(29);
    expect(staffStep(c.pitch(72))).toBe(35);
    // Cb4 sits on the C line though it sounds as B3.
    expect(staffStep(new Speller(major('Gb')).pitch(59))).toBe(28);
    expect(LETTERS[c.pitch(71).letter]).toBe('B');
  });
});

describe('solfège', () => {
  const sing = (spec: KeySpec, midis: number[], minorStyle: 'do' | 'la' = 'do') => {
    const speller = new Speller(spec);
    return speller.line(midis).map((note) => solfege(note, spec, minorStyle));
  };

  it('names a major scale from do, in any key', () => {
    expect(sing(major('C'), [60, 62, 64, 65, 67, 69, 71, 72])).toEqual(['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Ti', 'Do']);
    expect(sing(major('Eb'), [63, 65, 67, 68, 70, 72, 74])).toEqual(['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Ti']);
  });

  it('do-based minor lowers the third, sixth and seventh', () => {
    expect(sing(minor('A'), [69, 71, 72, 74, 76, 77, 79])).toEqual(['Do', 'Re', 'Me', 'Fa', 'Sol', 'Le', 'Te']);
  });

  it('la-based minor puts la on the tonic', () => {
    expect(sing(minor('A'), [69, 71, 72, 74, 76, 77, 79], 'la')).toEqual(['La', 'Ti', 'Do', 'Re', 'Mi', 'Fa', 'Sol']);
    // The raised sixth and seventh: fi and si.
    expect(sing(minor('A'), [78, 80, 81], 'la')).toEqual(['Fi', 'Si', 'La']);
    // A major key ignores the minor convention.
    expect(sing(major('C'), [60], 'la')).toEqual(['Do']);
  });

  it('uses the chromatic syllables going up and coming down', () => {
    expect(sing(major('C'), [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72])).toEqual([
      'Do', 'Di', 'Re', 'Ri', 'Mi', 'Fa', 'Fi', 'Sol', 'Si', 'La', 'Li', 'Ti', 'Do',
    ]);
    expect(sing(major('C'), [72, 71, 70, 69, 68, 67, 66, 65, 64, 63, 62, 61, 60])).toEqual([
      'Do', 'Ti', 'Te', 'La', 'Le', 'Sol', 'Se', 'Fa', 'Mi', 'Me', 'Re', 'Ra', 'Do',
    ]);
  });

  it('has a syllable for the rare alterations', () => {
    const spec = major('C');
    expect(solfege({ midi: 59, letter: 0, accidental: -1, octave: 4 }, spec)).toBe('De');
    expect(solfege({ midi: 65, letter: 2, accidental: 1, octave: 4 }, spec)).toBe('Mi♯');
    expect(solfege({ midi: 64, letter: 3, accidental: -1, octave: 4 }, spec)).toBe('Fa♭');
    expect(solfege({ midi: 72, letter: 6, accidental: 1, octave: 4 }, spec)).toBe('Ti♯');
  });
});

describe('swaras', () => {
  it('names a major scale S R2 G3 M1 P D2 N3', () => {
    const namer = new SwaraNamer({ key: 'C', mode: 'major', scale: [0, 2, 4, 5, 7, 9, 11] });
    expect([60, 62, 64, 65, 67, 69, 71].map((m) => namer.name(m, 'detailed').text)).toEqual([
      'S', 'R2', 'G3', 'M1', 'P', 'D2', 'N3',
    ]);
    expect([60, 62, 64, 65, 67, 69, 71].map((m) => namer.name(m).text).join(' ')).toBe('S R G M P D N');
  });

  it('names all twelve positions, sharing names by the scale', () => {
    const plain = new SwaraNamer({ key: 'C', mode: 'major', scale: [0, 2, 4, 5, 7, 9, 11] });
    expect(Array.from({ length: 12 }, (_, i) => plain.position(i))).toEqual([
      'S', 'R1', 'R2', 'G2', 'G3', 'M1', 'M2', 'P', 'D1', 'D2', 'N2', 'N3',
    ]);
    // Mayamalavagowla: S R1 G3 M1 P D1 N3, so 2 is G1 and 9 is N1.
    const mayamalavagowla = new SwaraNamer({ key: 'C', mode: 'modal', scale: [0, 1, 4, 5, 7, 8, 11] });
    expect(mayamalavagowla.position(2)).toBe('G1');
    expect(mayamalavagowla.position(9)).toBe('N1');
    // No R below 3 and no D below 10: R3 and D3.
    const sparse = new SwaraNamer({ key: 'C', mode: 'modal', scale: [0, 3, 5, 7, 10] });
    expect(sparse.position(3)).toBe('R3');
    expect(sparse.position(10)).toBe('D3');
  });

  it('is relative to the tonic, and natural minor reads S R2 G2 M1 P D1 N2', () => {
    const aMinor = new SwaraNamer(minor('A'));
    expect([69, 71, 72, 74, 76, 77, 79].map((m) => aMinor.name(m, 'detailed').text)).toEqual([
      'S', 'R2', 'G2', 'M1', 'P', 'D1', 'N2',
    ]);
  });

  it('puts madhya Sa on the tonic in MIDI 60–71 and counts octaves across the boundary', () => {
    const g = new SwaraNamer({ key: 'G', mode: 'major', scale: [7, 9, 11, 0, 2, 4, 6] });
    expect(MADHYA_BASE).toBe(60);
    expect(g.name(67)).toEqual({ text: 'S', octave: 0 }); // G4
    expect(g.name(66)).toEqual({ text: 'N', octave: -1 }); // F#4, just below: mandra
    expect(g.name(78)).toEqual({ text: 'N', octave: 0 }); // F#5
    expect(g.name(79)).toEqual({ text: 'S', octave: 1 }); // G5: tara
    expect(g.name(43)).toEqual({ text: 'S', octave: -2 }); // G2: anumandra
    expect(g.name(91).octave).toBe(2);
    const c = new SwaraNamer(major('C'));
    expect(c.name(59)).toEqual({ text: 'N', octave: -1 });
    expect(c.name(60)).toEqual({ text: 'S', octave: 0 });
  });

  it('has words for the octaves', () => {
    expect([-3, -2, -1, 0, 1, 2, 3].map(octaveWord)).toEqual([
      '3 octaves down', 'anumandra', 'mandra', '', 'tara', 'atitara', '3 octaves up',
    ]);
  });
});
