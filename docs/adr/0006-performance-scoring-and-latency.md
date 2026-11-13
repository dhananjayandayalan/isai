---
id: adr-0006
title: Performance scoring, latency model and local practice records
status: proposed
date: 2026-11-13
phase: P6
supersedes: null
---

# 0006 — Performance scoring, latency model and local practice records

## Context

P6 adds performance mode to the practice engine (ADR 0005): playback never waits, and the
learner's notes are scored by timing. Scores are only fair if the app knows how late the
learner hears Isai and how late their key presses arrive. Results and practice history are
kept on the device until P8 adds a backend. Rules 5 and 6 still apply.

## Options considered

1. **Score after the run** from a recording of every key press. Simple, but there is
   nothing to show on the keys while playing, and raw MIDI would have to be kept around.
2. **Score while playing, one note at a time.** Each key press is matched as it arrives.
   The same code gives the live mark on the key and the final result, and no raw events
   are kept.
3. **Score steps through the training matcher.** Reuses code, but the matcher answers
   "has this step been played?", not "how early or late was each note?".

For time: compare key times with note times **on the audio clock** (pauses would have to
be tracked), or **on the transport** (heard seconds since the run was laid out; a loop is
already unrolled there, ADR 0005).

## Decision

Option 2, on the transport timeline.

- **Policy.** `performance`: no holds, the learner's hand is silent (as in training), a
  one-bar count-in always starts the run, there is no pause, and every key press goes to
  the scorer. "Finish" ends a run early.
- **Expected notes.** The same notes training expects (ADR 0005 steps: the practised
  hand, not silent, on the learner's keyboard, not already held), each at its own onset.
  Each loop pass expects its notes again.
- **Matching.** A key press is matched to the nearest expected note of the same pitch that
  is not yet matched and lies within the widest window. A tie goes to the earlier note.
  Presses are handled in the order they arrive. A press that matches nothing is a wrong
  note.
- **Windows**, in heard seconds, so speed changes neither: **perfect** ±50 ms, **good**
  ±100 ms, **ok** ±160 ms. Later than that the note is **missed**.
- **Score.** `100 × (perfect + 0.7·good + 0.4·ok − 0.5·wrong) ÷ expected`, floored at 0.
  **Accuracy** is the same without the wrong-note term. Timing is the mean signed offset
  (early is negative), the mean absolute offset and its standard deviation.
- **A run that ends early** scores the notes whose window had closed, plus any later note
  that was hit. A run with no scored notes is "too short to score".
- **Sections.** `song.sections` when the Song has them, otherwise four-bar phrases.
- **Trouble spots.** Two-bar windows under 90% are ranked by accuracy (then by misses,
  then by position). Up to three that don't overlap are kept. As each is kept it grows by
  its neighbouring bars that are also under 90%, the weaker first, up to four bars.
- **Latency.** Effective key time = `midiTime − outputLatency − userOffset`.
  - `midiTime` is already on the audio clock (ADR 0004). Where the browser has
    `getOutputTimestamp()`, that mapping lands on the time being *heard*, so
    `Transport.outputLatency` is 0. Without it, `outputLatency` is the context's
    `outputLatency` (or `baseLatency`).
  - `userOffset` covers what the browser can't know (keyboard, USB, Bluetooth speakers,
    the learner). **Calibration** measures it: Isai plays 16 clicks at 90 BPM, the learner
    taps any key, the first four clicks are a lead-in, taps more than 150 ms from the
    median are dropped, and the median of the rest (at least 6) is the offset. It is
    stored per MIDI device, limited to ±300 ms.
  - Only performance mode uses the offset. Training keeps ADR 0005's windows.
- **Settings** go through a `SettingsStore` interface (`localStorage` now): keyboard
  size, last device, "play my notes", latency offset per device.
- **Sessions** go through a `SessionStore` interface (IndexedDB now, Supabase in P8). A
  session keeps the song's id and versions, the mode and choices, when it started, how
  long it lasted, and the result. **No raw MIDI events are stored.** If storage fails
  (private mode), sessions are kept in memory for the visit and the page says so.
- **Calendar time.** A session needs a date. `web/src/sessions/wallClock.ts` is the one
  file allowed to use `Date`, by a narrow exception in the rule 6 lint guard. It gives
  dates for records and formats them for display. Nothing may use it for timing: run
  length still comes from the audio clock.

## Consequences

- The scorer is pure and deterministic: fixed event streams give fixed result JSON
  (golden-file tests).
- `Transport` gains `outputLatency`. `PracticeSettings` gains `latencyOffset`. The engine
  gains `finish()` and `onResult()`.
- The live mark on a key is "hit" or "not in the song here"; a note the learner never
  plays shows up in the result, not on the keyboard.
- Any-octave matching (ADR 0005, no UI yet) does not apply to performance mode.
- Sustain-pedal, velocity and dynamics are not scored.
- The rule 6 guard now has one named exception. `lint-guards.test.ts` checks that it
  covers that file only.
- The session record (`version: 1`) becomes the shape of the P8 `sessions` table.
