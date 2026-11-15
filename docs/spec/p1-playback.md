---
id: spec-p1-playback
phase: P1
title: Playback — hear and see a song on the piano
status: ready
depends_on: [spec-p0-foundation]
---

# P1 — Playback

## Goal

Open a Song, press play, and hear it on a sampled piano while an on-screen keyboard lights
the keys in time. Connect a MIDI keyboard and see (and optionally hear) your own notes on
the same keyboard. This puts hard rules 4–6 (MIDI through `MidiInput`, no React render per
note, audio clock as master) into real code before training and performance modes are
built on top of them.

The pipeline is unchanged except for the open P0 review tidy-ups. Songs still come from
`schema/examples/` or a local `.song.json` file.

## Scope

### Web — `web/`

**MIDI — `src/midi/`**
- `WebMidiInput.ts`: a `MidiInput` adapter on the raw Web MIDI API
  (`navigator.requestMIDIAccess({ sysex: false })`). Use the browser API directly; no
  WebMidi.js.
  - Listens on every channel. Note-on with velocity 0 counts as note-off. Messages other
    than notes (CC, pitch bend, clock, SysEx) are ignored.
  - Converts event timestamps to the audio clock inside the adapter (ADR 0003). Read one
    `AudioContext.getOutputTimestamp()` pair, then
    `time = contextTime + (event.timeStamp - performanceTime) / 1000`. The adapter gets
    the clock through a small injected `AudioClock` interface, so tests can supply a fake.
  - Distinct errors for unsupported browsers (no `requestMIDIAccess`), permission denied,
    and unknown or busy devices.
- The `MidiInput` interface does not change. There is no hot-plug event, so the device
  list has a "Scan again" action.
- Tests use a fake `MIDIAccess`/`MIDIInput` covering note-on, note-off, velocity-0
  note-on, ignored messages, timestamp mapping, the error cases, and disconnect removing
  the message handler.

**Audio — `src/audio/`**
- `transport.ts`: a thin wrapper over the Tone.js transport and context. It provides
  `start/pause/stop/seek`, `seconds` (current song position), and `AudioClock` (for the
  MIDI adapter). `Tone.start()` runs only from a user gesture. All timing comes from here
  (rule 6).
- `piano.ts`: a sampled piano (`Tone.Sampler`) behind an `Instrument` interface
  (`noteOn(midi, velocity, time)`, `noteOff(midi, time)`, `releaseAll()`, `loaded`).
  Samples load from a URL in `VITE_PIANO_SAMPLES_URL`. The default is the Salamander
  Grand Piano set Tone.js hosts (CC-BY 3.0; credited in the README and an About line).
  If samples fail to load, it falls back to a `PolySynth` and shows the "Piano sound
  failed" state.
- Engine code and tests depend only on the interfaces; tests use fakes, not Tone.js.

**Engine — `src/engine/`**
- `player.ts`: schedules a Song's notes on the transport (note-on at `start` and note-off
  at `end`, with velocity) and supports play, pause, stop and seek. Seeking or stopping
  calls `releaseAll()` so no notes hang.
- `activeNotes.ts`: a pure function giving the notes sounding at song time `t`, with each
  note's hand. It uses a start-sorted index so each frame does a lookup, not a full scan.
  The keyboard reads it every frame.
- Tests: scheduling order and times, pause/resume position, seek mid-note (no hanging
  notes), empty song, single note, overlapping notes on the same key, and hand assignment.

**Piano — `src/piano/`**
- `layout.ts`: a pure function for key geometry for a MIDI range: white and black key
  positions, and which song notes fall outside the range.
- `Keyboard.ts`: a canvas renderer driven by `requestAnimationFrame`. On each frame it
  reads `activeNotes(transport.seconds)` plus a held-keys buffer filled by `MidiInput`
  listeners (refs and typed arrays, no React state). Drawing follows the design tokens:
  keys use `--piano-*`, song notes use `--piano-pill-right` / `--piano-pill-left` with a
  `--piano-pill-edge` outline (the `--hand-*` tokens were invisible on white keys in the
  dark theme; see the plan), and your notes use
  `--piano-white-active` / `--piano-black-active`. Song notes outside the range show as a
  marker at that end of the keyboard. It stops its rAF loop when unmounted or when the
  tab is hidden.
- Keyboard sizes 49 (C2–C6), 61 (C2–C7), 76 (E1–G7) and 88 (A0–C8), chosen with a `.seg`
  control. The default is 88. The choice is not saved yet.
- Each C key is labelled with its octave (C4 and so on), using a `midiToName` helper in
  `src/theory/`.
- Tests: layout (key counts and black-key positions for every size, out-of-range notes),
  `midiToName`, and the renderer drawing into a fake 2D context.

**Page — `src/App.tsx`**
- Song picker: the two schema examples plus "Open a .song.json file" (validated with
  `parseSong`; invalid files show the existing error state with a next step).
- Transport bar: play/pause (`.btn-play`), stop, a position/seek slider, and current time
  and duration. The position display updates from rAF through a ref, not React state.
- MIDI panel: device list (`.choice`), connect and disconnect, and "Play my notes through
  Isai" (on by default; turn it off for a digital piano with its own speakers).
- States from STYLE_GUIDE §6: piano sound loading or failed; MIDI waiting for permission,
  no keyboards, blocked, unsupported browser, device busy.
- `node design/system/check-tokens.mjs` passes.

**Guards and validation**
- ESLint rule 6 guard: `Date.now`, `performance.now`, `setTimeout` and `setInterval` are
  errors in `src/` outside tests. `requestAnimationFrame` is allowed (rule 5 requires it).
- Rule 5 test: render the page, emit 200 notes through `FakeMidiInput` and run 100
  player frames, then check the React commit count did not grow.
- **ajv standalone (review #2).** `gen:types` also precompiles the Song validator into
  `src/generated/` (ajv standalone, ESM). `src/song.ts` uses that validator, the ajv
  compiler moves to `devDependencies`, and nothing calls `new Function` at runtime. So
  `/schema-sync` regenerates the validator along with the types.

### Pipeline — `pipeline/` (P0 review tidy-ups only)

- **#7** Rename `theory.scales.Mode` to `ScaleMode` (and `MODES` to `SCALE_MODES`), so it
  is not confused with the schema's `tonality.mode` before the tonality phase.
- **#3** Keep the version in one place: `isai.__version__` reads
  `importlib.metadata.version("isai")`.
- **#4** Add a `SchemaNotFoundError` with its own exit code (3) and a message pointing at
  `ISAI_SCHEMA_DIR`. Test the `SongValidationError` path (exit 1).
- **#5** `test_console_script_runs` runs the installed `isai` entry point, not
  `python -m isai.cli`.
- **#6** Unit test `gen_models.build_command`: required flags and the output path.
- **#8** Cache the schema validator, and clear both caches in the `ISAI_SCHEMA_DIR`
  override test.

None of these changes the Song that `isai analyse` writes.

## Needs owner approval before building

- **Dependencies over ~5 MB:**
  - `tone` (runtime): 5.4 MB unpacked, plus `standardized-audio-context` at 3.0 MB. The
    browser bundle cost will be measured and reported in the plan.
  - A DOM test environment for the rule 5 render-count test (dev only): `jsdom` 5.5 MB,
    plus `@testing-library/react` at 0.3 MB. Alternative: drop the render-count test and
    keep the rule 5 check structural (the keyboard controller is plain TypeScript, tested
    without React). This weakens the exit criterion.
- **New ADR 0004 — audio engine and master clock.** Tone.js transport as the master
  clock; how MIDI timestamps map onto it; visuals read transport time in rAF; where piano
  samples come from (a third-party URL now, self-hosted later); latency compensation
  deferred. Proposed in P1 and accepted by the owner before the audio code merges.
- **Third-party sample host.** The default piano loads samples from the Tone.js GitHub
  Pages host at runtime. Rule 8 covers song audio, not instrument samples. The samples
  can't live in git anyway: `.gitignore` excludes `*.mp3`/`*.ogg` and the guard hook
  blocks audio writes. Self-hosting comes with deployment.
- **No schema change.** P1 only reads existing Song fields (`notes[].start/end/midi/
  velocity/hand`, `durationSec`, `tempo.bpm`). `/schema-sync` must still show no diff in
  the types.

## Out of scope

- Training mode (waiting for correct notes) and performance mode (scoring), along with
  hit detection, timing windows and results.
- Falling-notes stage, piano roll, staff, and notation systems (solfège, swaras, Roman
  numerals). Only the C-octave labels are in P1.
- Tempo or speed control, looping, hand muting, metronome, count-in.
- Sustain pedal and any CC handling. `MidiInput` has no CC events; that is a later
  interface change.
- Device hot-plug events, latency calibration, saving settings (keyboard size, device,
  sound).
- Native MIDI adapters (Tauri, iOS, Safari) and the Tauri shell.
- Any audio processing in the pipeline: ingest, separation, rhythm, tonality,
  transcription, harmony, arranger, worker.
- Supabase, upload, songbook, auth, deployment, self-hosted samples.
- Remaining P0 review suggestions: #9 (lint and type-check config JS files), #11 (the
  worker-era error states beyond what P1 adds), and #13 (untrack `.idea/`).

## Exit criteria

- [ ] ADR 0004 written and accepted; the dependencies above approved
- [ ] `pnpm install`, `pnpm test --run`, `pnpm lint`, `pnpm typecheck`, `pnpm build` all pass in `web/`
- [ ] `uv sync`, `uv run pytest`, `uv run ruff check . && uv run ruff format --check .`, `uv run pyright` all pass in `pipeline/`
- [ ] `/schema-sync` shows no diff on a clean tree (types, Pydantic models and the precompiled validator)
- [ ] Nothing outside `web/src/midi/` touches Web MIDI, and ESLint fails on a probe that does
- [ ] ESLint fails on a probe using `Date.now`, `performance.now`, `setTimeout` or `setInterval` in `web/src/`
- [ ] The rule 5 test passes: 200 MIDI notes plus 100 player frames cause no extra React commits
- [ ] `WebMidiInput`, `player`, `activeNotes`, `layout` and `midiToName` have unit tests, including empty song, single note, overlapping notes, seek mid-note and notes outside the keyboard range
- [ ] `web/src/theory/` ≥ 90% line coverage; pipeline `theory/` stays ≥ 90%; `gen_models.py` > 0%
- [ ] `src/song.ts` imports no ajv compiler, and the built JS contains no `new Function(` or `eval(` (any hit from a dependency is explained in the plan)
- [ ] By hand in Chrome with a real MIDI keyboard: an example song plays with sound and keys light in time; your notes light (and sound when enabled); unplugging and scanning again recovers; the page works without MIDI permission
- [ ] `node design/system/check-tokens.mjs` passes
- [ ] `isai analyse README.md --out .cache/p1` still writes a valid Song; `/golden-eval` is not required because no analysis behaviour changes (golden audio is still `TODO`)
- [ ] Everything committed in small conventional commits on `p1-playback`
