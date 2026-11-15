---
id: spec-p01-playback
phase: P1
title: Playback — hear and see a song on the piano
status: in-review
track: web
depends_on: [spec-p00-foundation]
---

# P1 — Playback (in review)

## Goal

Open a Song, press play, and hear it on a sampled piano while an on-screen keyboard lights
the keys in time. Connect a MIDI keyboard and see (and optionally hear) your own notes on
the same keyboard. This put hard rules 4–6 into real code before the practice modes are
built on them.

## Scope (as built)

### Web
- **MIDI.** `WebMidiInput` on the raw Web MIDI API (no WebMidi.js). All channels; a
  note-on with velocity 0 counts as note-off; other messages are ignored. Timestamps are
  mapped to the audio clock through an injected `AudioClock` (ADR 0003/0004). Distinct
  errors for unsupported, permission denied, and unknown or busy device. "Scan again"
  instead of hot-plug events.
- **Audio.** `Transport` and `Instrument` interfaces in `audio/types.ts`. `audio/tone.ts`
  is the only Tone.js importer. It's loaded lazily, runs on a native `AudioContext` (for
  `getOutputTimestamp()`), and uses the Salamander samples from the Tone.js host,
  overridable with `VITE_PIANO_SAMPLES_URL`. It falls back to a `PolySynth`.
- **Engine.** `activeNotes` (start-sorted index, binary search) and `player` (play, pause,
  stop, seek; `releaseAll()` on seek and stop; counts notes per key so overlapping notes
  on one key don't cut each other off). `monitorMidi` plays your notes when enabled.
- **Piano.** `layout` (49/61/76/88 keys), `KeyboardRenderer` (plain TS, fake-context
  tested), `PianoController` (rAF loop, held-keys `Uint8Array`, pauses when the tab is
  hidden). Song-note pills use `--piano-pill-*` tokens (the `--hand-*` tokens were
  invisible on white keys in the dark theme).
- **Page.** Song picker (examples plus a local `.song.json`), transport bar with ref-driven
  readout, keyboard size `.seg`, and a MIDI panel with every STYLE_GUIDE §6 state.
- **Guards.** ESLint rule 4 and rule 6 guards with probe tests. Rule 5 render-count test
  (200 notes + 100 frames → 0 extra React commits). The Song validator is precompiled
  (ajv standalone), so there's no `new Function` at runtime.

### Pipeline (P0 review tidy-ups)
`ScaleMode` rename, a single version source, `SchemaNotFoundError` with exit code 3, a
cached validator, console-script and `gen_models` tests.

### Decisions
ADR 0004 accepted. `tone` and `jsdom` approved; `@testing-library/react` wasn't needed.

## Results

| | |
|---|---|
| Main bundle | 294.4 kB (84.8 kB gzip) |
| Tone.js chunk | 340.8 kB (79.4 kB gzip), loaded on first Play or Connect |
| Web tests | 173, 93.4% lines (`theory/`, `engine/`, `midi/` 100%) |
| Pipeline tests | 119, 94% lines (`theory/` 100%) |

## Open before `done`

Blocking (from `reports/review-P1.md`):
- [x] **Start audio inside the click.** Create the `AudioContext` and call `resume()`
  synchronously at the start of `AudioEngine.load()`, before any `await`. Inject the
  context factory. Keep Play clickable while loading. Test that the factory runs
  synchronously. Without this, WebKit (Safari, iOS, a future Tauri shell) never starts
  audio. *(Done on `p2-training`: `AudioEngine` takes `createContext` and `load(context)`;
  tested in `audio.test.ts` and `App.dom.test.tsx`.)*

Owner:
- [ ] By-hand check in Chrome with a real MIDI keyboard, with DevTools open (the headless
  run reported an unread console or network problem).
- [ ] Add `VITE_PIANO_SAMPLES_URL=` to `.env.example`.

Non-blocking review suggestions, picked up in P2's housekeeping: rule 6 guard gaps
(`new Date()`, `Date['now']`, destructured `performance.now`), audio errors kept and shown,
a separate "not JSON" message, a guarded MIDI disconnect, seek-drag cancel, end-of-song
timing, the `Keyboard.tsx` effect order, `preview.html` recipes, an ADR 0004 note on the
native `AudioContext`, and a visibility-change test.

## Out of scope (was)

Training and performance modes, notation, falling notes, speed, looping, metronome,
pedal and CC, hot-plug, latency calibration, saved settings, native MIDI, any pipeline
audio processing, Supabase and deployment.

## Exit criteria

- [x] ADR 0004 accepted; dependencies approved
- [x] Web install / test / lint / typecheck / build pass
- [x] Pipeline sync / pytest / ruff / pyright pass
- [x] `/schema-sync` shows no diff (types, models, validator)
- [x] Web MIDI only in `src/midi/`; ESLint fails on a probe that breaks rule 4
- [x] ESLint fails on `Date.now` / `performance.now` / `setTimeout` / `setInterval` probes
- [x] Rule 5 render-count test passes
- [x] Unit tests for `WebMidiInput`, `player`, `activeNotes`, `layout`, `midiToName`, with edge cases
- [x] `theory/` ≥ 90% in both packages
- [x] No ajv compiler at runtime; no `new Function(` or `eval(` in built JS
- [ ] By hand in Chrome with a real MIDI keyboard (owner)
- [x] `check-tokens.mjs` passes
- [x] `isai analyse` still writes a valid Song
- [ ] Review blocking fix merged
