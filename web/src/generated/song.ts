/* Generated from schema/song.schema.json by `pnpm gen:types`. Do not edit by hand. */

/**
 * One analysed song: tempo, tonality, chords and a playable two-hand arrangement. Contract between pipeline and web (ADR 0002).
 */
export interface Song {
  /**
   * Version of this schema the file was written against. Every supported version is listed, newest last; the pipeline writes the newest (ADR 0008).
   */
  schemaVersion: '0.1.0' | '0.2.0' | '0.3.0';
  /**
   * Stable identifier of the song analysis.
   */
  id: string;
  title: string;
  /**
   * Which pipeline path produced the song.
   */
  sourceType: 'piano-solo' | 'full-mix' | 'a-cappella' | 'carnatic';
  durationSec: number;
  tempo: Tempo;
  timeSignature: TimeSignature;
  tonality: Tonality;
  chords: Chord[];
  notes: Note[];
  sections?: Section[];
  meta: Meta;
}
export interface Tempo {
  /**
   * Average tempo in beats per minute.
   */
  bpm: number;
  /**
   * Beat times in seconds from the start of the audio.
   */
  beats: number[];
  /**
   * Times in seconds of the first beat of each bar, from the start of the audio. Optional; added in 0.2.0.
   */
  downbeats?: number[];
}
export interface TimeSignature {
  num: number;
  den: 2 | 4 | 8 | 16;
}
export interface Tonality {
  /**
   * Tonic note name, e.g. "G" or "Bb".
   */
  key: string;
  mode: 'major' | 'minor' | 'modal';
  /**
   * Measured tonic frequency (shruti for Carnatic songs).
   */
  tonicHz?: number;
  /**
   * Pitch classes of the scale (0 = C), in scale order from the tonic.
   *
   * @minItems 1
   */
  scale: [number, ...number[]];
  /**
   * Raga name, for Carnatic songs.
   */
  raga?: string;
}
export interface Chord {
  start: number;
  end: number;
  /**
   * Root pitch class (0 = C).
   */
  root: number;
  /**
   * Chord quality, Harte-style shorthand.
   */
  quality:
    | 'maj'
    | 'min'
    | 'dim'
    | 'aug'
    | 'sus2'
    | 'sus4'
    | '5'
    | 'maj6'
    | 'min6'
    | '7'
    | 'maj7'
    | 'min7'
    | 'minmaj7'
    | 'dim7'
    | 'hdim7'
    | '9'
    | 'maj9'
    | 'min9'
    | 'add9';
  /**
   * Bass pitch class when it differs from the root (slash chord).
   */
  bass?: number;
  /**
   * Display label, e.g. "G", "Am7", "C/E".
   */
  label: string;
}
export interface Note {
  start: number;
  end: number;
  midi: number;
  velocity: number;
  hand: 'left' | 'right';
  source: 'transcribed' | 'arranged';
}
export interface Section {
  start: number;
  end: number;
  label: string;
}
export interface Meta {
  pipelineVersion: string;
  createdAt: string;
  confidence: Confidence;
}
/**
 * Pipeline confidence per estimate, 0 to 1.
 */
export interface Confidence {
  key: number;
  tempo: number;
  chords: number;
  /**
   * Confidence in the transcribed notes. Optional; added in 0.3.0.
   */
  notes?: number;
}
