---
id: spec-p06-performance
phase: P6
title: Performance mode — scoring, results, latency calibration
status: draft
track: web
depends_on: [spec-p02-training]
---

# P6 — Performance mode

## Goal

A learner plays a song (or a loop) straight through without the playback waiting, and
then sees how they did: an overall score, timing (early or late), per-hand accuracy,
results by section, and the trouble spots, with a one-click "Loop bars 5–8 in training".
Scoring is fair because the app is calibrated for the learner's audio and MIDI latency.
Past results are kept on this device.

## Scope

### Engine — `web/src/engine/practice/`
- **Performance policy** for the P2 engine: no holds. Each step is open for a timing
  window; MIDI events go to the scorer.
- **`scorer.ts`** (pure, deterministic):
  - Match played notes to expected notes one-to-one per pitch: nearest onset within the
    widest window, greedy in time order, ties going to the earlier expected note.
  - Windows are in heard seconds, so speed doesn't change difficulty: **perfect**
    ±50 ms, **good** ±100 ms, **ok** ±160 ms; beyond that the note is **missed**. Exact
    values go in the practice-engine ADR amendment.
  - Wrong notes: note-ons that match nothing, counted separately.
  - Per note: the signed offset (early is negative).
  - Totals per hand, per section (`sections`, or 4-bar phrases), and overall:
    - accuracy = weighted hits / expected notes
    - timing = mean and spread of the absolute offset
    - wrong notes per minute
  - The overall score formula is written down in the ADR, e.g.
    `100 × (perfect + 0.7·good + 0.4·ok) / expected − wrong-note penalty`, floored at 0.
  - Trouble spots: the 3 bar ranges (2–4 bars each) with the lowest accuracy.
- **Latency** (`latency.ts`): the effective input time is
  `midiTime − outputLatency − userOffset`, where `outputLatency` comes from the audio
  context (`outputLatency` or `baseLatency`, through the `Transport` interface) and
  `userOffset` from calibration.
- Tests: perfect play; everything late by 80 ms; random jitter; missed notes; extra
  notes; chords partly played; the same pitch twice in a window; a loop pass boundary;
  speed 50% (windows unchanged in heard time); latency offset applied; an empty song;
  a single note. Golden-file tests: fixed event streams give a fixed result JSON.

### Calibration — `web/src/settings/` and Devices screen
- "Calibrate": Isai plays 16 clicks at 90 BPM, the learner taps any key in time, and the
  median offset after dropping outliers becomes `userOffset` for that MIDI device. Also
  "Play any key to test" with live offset readout (from the prototype's Devices screen).
- `SettingsStore` interface with a `localStorage` implementation, storing the keyboard
  size, the last device, "play my notes" and the latency offset per device. Settings are
  read at startup, with defaults when storage is empty or unavailable.

### Sessions — `web/src/sessions/`
- A `SessionStore` interface with an IndexedDB implementation (local only). A session
  records:
  - song id, title, `schemaVersion` and `pipelineVersion`
  - mode, hands, speed, loop range, start time and duration
  - the scorer result (totals plus per-section)
  - `version: 1` for the record shape
- Raw MIDI events are not stored (privacy and size). P8 adds a Supabase implementation
  and imports these local sessions.
- Training sessions are recorded too: time practised, steps completed, wrong notes.

### Pages
- **Practice:** the Performance switch is enabled. A count-in starts the run, a live
  hit/miss flash shows on keys, and "Finish" ends early.
- **Results** (`design/prototype/Results.dc.html`): score, early/late histogram,
  left/right hand, by section, trouble spots, and actions (play again, loop the trouble
  spot in training, back to the song). Rendered once from the result object.
- **Song overview, local version:** key, tempo, scale, chord list, "Start training",
  "Performance", "Your sessions" and "See last performance" for the opened song. Built
  without the library; the library comes in P8.
- Rule 5: scoring runs in the engine. React only renders the finished result.

## Needs owner approval before building

- **Practice-engine ADR amendment (or a new ADR):** windows, matching, score formula,
  latency model.
- **Dependencies:** `fake-indexeddb` (dev only, small). Optionally `idb` (runtime, ~5 kB)
  instead of hand-written IndexedDB code.
- **No schema change.** The session record is a web type, not part of the Song contract.
  It becomes a database table in P8.

## Out of scope

Server-side sessions and the library (P8). Notation choices, falling notes and staff
(P7). Sustain-pedal scoring. Velocity or dynamics scoring. Leaderboards or sharing
results. Automatic latency detection without the learner tapping.

## Exit criteria

- [ ] ADR (amendment) accepted
- [ ] Scorer unit and golden-file tests cover every case above; `engine/` ≥ 90% lines
- [ ] Calibration measures a known injected offset within ±5 ms with `FakeMidiInput` and `FakeTransport`
- [ ] A performance run of each example song produces a Results page; per-hand and per-section numbers match a hand-checked fixture
- [ ] Sessions survive a reload; the app still works when IndexedDB or `localStorage` throws (private mode)
- [ ] Rule 5 test covers a full performance run
- [ ] By hand (owner): calibrate, play an example song deliberately late, and see "late" on the results
- [ ] Web lint, typecheck, tests and build pass; `check-tokens.mjs` passes
