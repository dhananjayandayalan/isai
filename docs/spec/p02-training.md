---
id: spec-p02-training
phase: P2
title: Training mode — playback waits for the right notes
status: draft
track: web
depends_on: [spec-p01-playback]
---

# P2 — Training mode

## Goal

On the Practice screen, a learner picks a hand (right, left or both), a speed and
optionally a bar range. Playback runs until the next notes for that hand, then holds with
those keys lit ("Waiting for G4 B4") until the learner plays them, then carries on. A
metronome and a count-in help them keep the beat. This is the first half of the practice
engine. Performance mode (P6) reuses it with a different policy.

Songs still come from `schema/examples/` or a local `.song.json`. The pipeline is untouched.

## Scope

### P1 carry-over (first commits)
- The review's blocking fix: create and resume the `AudioContext` synchronously in the
  click (see `p01-playback.md`).
- Review suggestions 1–8 and 11, the ADR 0004 note and the `preview.html` recipes.
  P0 review #13: untrack `.idea/`.
- Seeking mid-note re-sounds notes that are still held at the new position (the P1 open
  item), because training resumes mid-song all the time.

### Engine — `web/src/engine/practice/`
- **`steps.ts`.** Groups the selected hand's notes into steps: notes whose onsets fall
  within a chord tolerance (default 35 ms) form one step. Each step has a start time, its
  expected MIDI pitches and the hand of each pitch. A note that is still held when the
  next step starts isn't expected again. It's a pure function, built once per song,
  hand and loop.
- **`matcher.ts`.** Decides when a step is satisfied:
  - Every expected pitch has had a note-on since the step became current (with a small
    early grace, default 150 ms, for learners who play just before the hold), or was
    already held from the previous step when the step expects it to sound again.
  - Exact MIDI pitch by default. A pitch-class option ("any octave") exists in the
    engine but has no UI until P7.
  - Wrong notes are recorded (for P6 and for feedback) but don't block.
  - Velocity 0 counts as note-off (already true in the adapter).
- **`engine.ts`.** One practice engine with a pluggable policy:
  - **Training policy.** It schedules a hold on the transport just before each step's
    start, pauses there, and resumes when the matcher reports the step done. While
    holding, nothing sounds. When it resumes, the step's notes for the *other* hand
    sound as normal.
  - The interface leaves room for P6's performance policy (no holds; matches go to a
    scorer) without changes to steps or matcher.
- **Hands.** Right, left or both. The hand you aren't practising is either played by
  Isai (default) or muted. The keyboard always shows it, dimmed.
- **Speed.** 40–120% in 5% steps (default 100%). Speed is a rate between song time and
  transport time. Notes are rescheduled when it changes. Pitch doesn't change (it's
  synthesised). Rule 6 still holds: the transport is the clock.
- **Loop.** A bar range repeats seamlessly. Bars come from `tempo.beats` grouped by
  `timeSignature.num`, assuming the first beat is a downbeat (P3 adds `tempo.downbeats`;
  the bar helper must accept them when present). A song with no beats loops by seconds
  in 2-second steps.
- **Metronome and count-in.** A click on each beat from `tempo.beats` (accented
  downbeat), scaled by speed, through a separate `Instrument` voice. A one-bar count-in
  before play and before each loop pass, both toggleable.
- **Tests (fakes only; no Tone.js).** Steps: empty song, single note, chords within and
  just outside the tolerance, repeated notes on one key, a held note across steps, a
  hand filter. Matcher: exact, missing one pitch, extra wrong notes, early grace edges,
  a note held from before, velocity 0. Engine on `FakeTransport`: hold times, resume,
  other-hand notes sound after resume, a loop wrapping across a held note, speed change
  mid-song, count-in timing, seek while holding, stop while holding (no hanging notes).

### Piano — `web/src/piano/`
- In training, the current step's keys are lit in hand colour. The next step's keys are
  outlined. A correct key flashes the success token; a wrong key flashes the error
  token. All of it is drawn in the existing rAF loop from engine refs (rule 5).

### Page — Practice screen
- Follows `design/prototype/Practice.dc.html`: mode switch (Performance disabled with
  "Coming soon" until P6), hand choice, speed, loop picker ("Loop bars 1–4"), metronome
  and count-in toggles, and the "Waiting for …" readout. Note names use `midiToName`
  until P7 adds notation choices.
- The readout and step counter are written through refs, not React state.
- Rule 5 test extended: a whole training run of an example song (200+ MIDI events, all
  holds and resumes) causes no React commits beyond the controls the test clicks.

## Needs owner approval before building

- **New ADR — practice engine.** One engine with training and performance policies; steps
  and the chord tolerance; matching rules (exact pitch, early grace, wrong notes don't
  block); speed as a rate between song time and transport time; other-hand behaviour.
  Proposed in the first commit and accepted before the engine commits.
- **No schema change.** Bars are derived from beats. The pickup-bar limitation (the
  first beat might not be a downbeat) is accepted until P3.
- **No new dependencies expected.**

## Out of scope

Performance mode, scoring, results and session history (P6). Latency calibration and
saved settings (P6–P7). Falling notes, staff and notation choices (P7). Sustain pedal
(P7). Any pipeline work. Accounts and the library (P8).

## Exit criteria

- [ ] P1 blocking fix merged; P1 marked `done`
- [ ] Practice-engine ADR accepted
- [ ] `steps`, `matcher`, `engine` and the bar helper have unit tests for every case above; `engine/` ≥ 90% lines
- [ ] Training runs end to end on both example songs with `FakeMidiInput`: every step holds, resumes on the right notes, and ignores wrong ones
- [ ] Speed 40% and 120%, a loop of bars 1–4, the metronome and count-in all work in a DOM test with `FakeTransport`
- [ ] The extended rule 5 test passes
- [ ] The rule 6 guard catches the three P1 review bypass forms
- [ ] By hand in Chrome with a real keyboard (owner): practise each example song right hand, left hand and both at 60%, with a loop
- [ ] Web lint, typecheck, tests and build pass; `check-tokens.mjs` passes; `/schema-sync` shows no diff
