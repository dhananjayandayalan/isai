---
id: adr-0013
title: The rule-based arranger, its levels and one arrangement per Song
status: proposed
date: 2026-11-15
phase: P5
supersedes: null
---

# 0013 — The rule-based arranger, its levels and one arrangement per Song

## Context

After P5 a friend analyses a film song and practises a sensible two-hand version. The
arranger must be rules, not a model (rule 7): deterministic, explainable and unit-tested.
Learners differ, so it needs levels. Two more forces shape it:
- the output has to be physically playable, which a checker can enforce;
- the Song schema holds one `notes` list, while uploaded audio is deleted after analysis
  (rule 8), so a Song can't be re-arranged later without its inputs.

## Options considered

1. **Rules with three levels and a checker (chosen).** The melody goes in the right hand:
   phrases moved by octaves, snapped to a grid chosen per song, grace notes removed, and
   the note rate capped per level. Chord patterns go in the left hand, by level and time
   signature, with voice leading. A checker and fixer enforce playability.
2. **A learned arranger** (a sequence model trained on piano covers). It could sound more
   idiomatic, but it isn't deterministic or explainable, needs training data we don't
   have, and breaks rule 7.
3. **Several levels in one Song** (`arrangements: [{ level, notes }]`, schema 0.4.0). A
   learner could switch level without re-analysis. But it's a schema change and a web
   change, with no UI to use it before P8's library.

## Decision

Option 1. The patterns:

| Level | 4/4 | 3/4 |
|---|---|---|
| `easy` | the bass at each chord change and bar, held | the bass on beat 1 |
| `medium` | a block chord on beats 1 and 3, and on changes | bass on 1, chord on 2 and 3 |
| `full` | broken 1-5-8-5 in eighths, a passing bass before changes | arpeggio 1-5-8 |

Right-hand note rates are capped at easy 2, medium 4, and full uncapped, per beat. The
rules:
- **Span:** each hand at most a 9th and 4 notes at a time.
- **Gap:** at least 2 semitones between the hands.
- **Keys and length:** no same-key overlap, nothing shorter than a 1/16, A0–C8.

The fixer works in the spec's order: the left hand drops an octave, else the right-hand
phrase rises, else the left hand's colliding notes go. A violation left after fixing
raises: it's an arranger bug, not a song problem.

**One arrangement per Song.** `--level all` writes three Songs from one analysis; only the
arranger re-runs, because of the cache. piano-solo keeps its transcription unless
`--simplify easy|medium` asks for an arrangement. P8 revisits `arrangements` as an
additive minor version, when the library and its level switch exist and the worker always
writes all three.

## Consequences

- Hypothesis checks that any generated progression and melody gives a playable, identical
  arrangement at every level. On the owner's 2:39 film song, the full-mix and a-cappella
  arrangements have zero violations.
- The patterns are plain: no genre styles, no fingering, no drum-driven rhythms (out of
  scope). They're a base the owner's playability checklist will push on.
- A level change before P8 means re-running `isai analyse` with the audio at hand; with
  the cache that takes seconds.
- Chords from audio use the template-and-Viterbi baseline. The learned recogniser's spike
  waits for golden `.lab` references, and its ADR comes after it.
