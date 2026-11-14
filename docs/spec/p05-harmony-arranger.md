---
id: spec-p05-harmony-arranger
phase: P5
title: Harmony and arranger — chords and a playable two-hand arrangement
status: ready
track: pipeline
depends_on: [spec-p04-transcription]
---

# P5 — Harmony and arranger

## Goal

Every source type gets chords and a playable two-hand arrangement. The melody goes in the
right hand; the left hand plays chord-based patterns that suit the time signature and a
difficulty level. The arranger is rules, not a model (rule 7): deterministic, explainable,
and heavily unit-tested. After P5, a friend can analyse a film song and practise a
sensible two-hand version of it.

## Scope

### Harmony — `isai/harmony/`
- A `ChordRecogniser` protocol returning chord segments `(start, end, root, quality,
  bass)` snapped to the beat grid.
- **Baseline (always built, pure and tested):**
  - Beat-synchronous chroma from the harmonic stems (other + bass for full-mix; the
    audio for piano-solo), or from transcribed notes when that's more reliable.
  - Templates for the schema's chord qualities, restricted at first to `maj`, `min`, `7`,
    `maj7`, `min7`, `dim`, `sus4`.
  - Viterbi smoothing with a key-aware transition prior (diatonic chords are cheaper;
    staying on a chord is cheaper than changing).
  - Bass from the lowest stable pitch class (bass stem or transcription) for inversions.
  - The templates, the prior and the label formatting live in `theory/chords.py`.
- **Spike** in `pipeline/spikes/chords/`: compare the baseline with one learned
  recogniser on golden songs that have `.lab` references. Adopt the learned one only if
  it beats the baseline by ≥ 5 points WCSR (weighted chord symbol recall) and its licence
  fits. Decide through an ADR.
- **a-cappella:** no audio harmony. `harmony/from_melody.py` suggests chords from the
  melody, rule-based: per bar (or half bar at slow tempi), choose the diatonic chord
  covering the most melody duration on strong beats, prefer I, IV, V, vi, force a
  cadence at phrase ends, and change chords at most once per bar.
- `label` uses one style everywhere (`G`, `Em7`, `D/F#`). Roman numerals are the web's job
  (P7).

### Arranger — `isai/arrange/`
Input: melody notes (vocal melody, or the top voice of a piano transcription), chords,
beats, downbeats, time signature, key. Output: `notes[]` with hands and
`source: "arranged"`.

- **Right hand (`melody.py`):**
  - Move whole phrases by octaves (never single notes) so most of the melody sits in
    C4–C6.
  - Light quantisation to the beat grid (nearest 1/8 or 1/16, chosen per song from onset
    statistics; triplet grid in compound feel).
  - Remove grace-note clutter shorter than a 1/16 at the current tempo.
  - Cap the note rate per difficulty.
- **Left hand (`accompany.py`), patterns by level:**

  | Level | 4/4 | 3/4 | Range |
  |---|---|---|---|
  | `easy` | root on each chord change, held | root on beat 1 | C2–C3 |
  | `medium` (default) | root + fifth, or a block triad on beats 1 and 3 | root, then triad on 2 and 3 (waltz) | C2–C4 |
  | `full` | broken chords (1-5-8-5 or Alberti), passing bass on changes | arpeggio 1-5-8 | C2–C4 |

  - Voice leading: choose the triad inversion with the least movement from the previous
    one.
- **Playability constraints (`constraints.py`), checked after arranging and enforced by
  tests:**
  - Each hand spans ≤ a 9th at any instant; ≤ 4 notes per hand at once.
  - The hands never overlap: a ≥ 2-semitone gap; when they collide, the left hand drops
    an octave or the right-hand phrase moves up.
  - No two notes on the same key overlap; minimum duration 1/16 at the song's tempo.
  - Every note's MIDI number is within A0–C8.
- **piano-solo** keeps the transcription (P4) by default. `--simplify easy|medium`
  arranges it instead, from its top voice plus recognised chords.
- **Determinism:** pure functions, no randomness, stable sorting. Property-based tests
  (Hypothesis) generate random chord and melody inputs and check that every constraint
  holds and that output is identical across runs.
- CLI: `--level easy|medium|full` (default `medium`).

### Sections (optional, only if time allows)
Novelty-based section boundaries from a self-similarity matrix, labelled A, B, A′… into
the existing optional `sections` field. If skipped, P6 groups results by 4-bar phrases.

### Golden eval
- Chord WCSR (root plus major/minor), and full quality, against `.lab` references.
  **Initial target** ≥ 0.65 root+maj/min on full-mix songs.
- Arrangement checks on every golden output: 0 constraint violations, plus the owner's
  playability checklist (melody recognisable, left hand fits the chords, no awkward
  jumps), recorded per song in the report.

## Needs owner approval before building

- **Chord recogniser ADR**, after the spike (the baseline needs no ADR beyond the
  arranger one).
- **Arranger ADR:** levels, patterns, constraints, and the decision that one Song holds
  one arrangement.
- **Possible schema change: several levels in one Song.** One option is
  `arrangements: [{ level, notes }]`, so a learner can switch level without re-analysis.
  This matters because uploaded audio is deleted (rule 8), so a different level later
  needs a re-upload. Recommendation: decide this in P5. The cheap alternative is to run
  the arranger for all three levels and store three Songs.
- **Dependency:** `hypothesis` (dev only, small).

## Out of scope

Fingering suggestions. Left-hand styles per genre (film-song rhythms, ballad patterns)
beyond the three levels. Lyrics. Drum-driven rhythm patterns. Carnatic accompaniment
(P10). Automatic source-type detection. The worker (P8).

## Exit criteria

- [ ] Arranger ADR (and chords ADR if a learned model is adopted) accepted; the multi-level schema decision made
- [ ] Every source type except carnatic produces a Song with chords and two hands
- [ ] Constraint checker and property tests pass; `arrange/`, `harmony/` pure code and `theory/` ≥ 90% lines
- [ ] Byte-identical output on repeated runs (test)
- [ ] `/golden-eval` report with chord metrics and constraint results committed; targets met or explained
- [ ] Owner plays one arranged song of each source type through training mode and signs off the checklist
- [ ] Pipeline ruff, pyright and pytest pass; `/schema-sync` clean
