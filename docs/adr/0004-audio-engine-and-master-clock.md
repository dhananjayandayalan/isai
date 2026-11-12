---
id: adr-0004
title: Tone.js transport is the audio engine and master clock
status: accepted
date: 2026-10-13
phase: P1
supersedes: null
---

# 0004 — Tone.js transport is the audio engine and master clock

## Context

P1 plays a Song on a sampled piano while a canvas keyboard lights the keys and a MIDI
keyboard adds the learner's notes. CLAUDE.md rule 6 says all timing comes from the audio
clock; rule 5 says the piano animates on `requestAnimationFrame`, not React renders. Three
clocks are in play: the `AudioContext` clock (what you hear), the DOM high-resolution clock
(`MIDIMessageEvent.timeStamp`, rAF timestamps) and wall time. Training and performance
modes later compare the learner's notes with the song's notes, so the clocks must agree.

## Options considered

1. **Raw Web Audio** (`AudioContext`, `AudioBufferSourceNode`, own lookahead scheduler).
   No dependency, but we would rewrite a transport (play, pause, seek, scheduling) and a
   sampler with pitch-shifting between samples.
2. **Tone.js** (`Tone.Transport`, `Tone.Sampler`). Mature transport with lookahead
   scheduling on the audio clock, a sampler that fills gaps between samples, and synths
   for a fallback. About 8.4 MB unpacked with `standardized-audio-context`.
3. **A higher-level piano player** (e.g. `smplr`). Smaller, but no transport; we would
   still need our own scheduler.

## Decision

Use option 2.

- **One clock.** The Tone.js transport (on `AudioContext.currentTime`) is the only song
  clock. The player schedules note-on/off on it; the keyboard reads `transport.seconds`
  every rAF frame. No `Date.now`, `performance.now`, `setTimeout` or `setInterval` in
  `web/src/` (an ESLint rule enforces it).
- **MIDI time mapping.** MIDI adapters convert device timestamps to audio-clock seconds
  through an injected `AudioClock`, using one `AudioContext.getOutputTimestamp()` pair:
  `audio = contextTime + (domTimestamp − performanceTime) / 1000`. This keeps ADR 0003's
  rule that adapters own the mapping.
- **Behind interfaces.** Only `web/src/audio/tone.ts` imports `tone`. Engine, piano and UI
  code depend on `Transport` and `Instrument` interfaces, so tests use fakes and never
  create an `AudioContext`. `tone` is loaded with a dynamic `import()` on the first user
  gesture (which browsers also need to start audio), so first page load doesn't pay for it.
- **Samples.** The piano uses the Salamander Grand Piano samples (CC-BY 3.0, credited)
  from the Tone.js host at runtime, overridable with `VITE_PIANO_SAMPLES_URL`. If they fail
  to load, a `PolySynth` plays instead and the UI says so. Samples cannot live in git
  (rule 8 tooling blocks audio files); self-hosting comes with deployment.
- **Deferred.** Output latency compensation and calibration, and a second instrument.

### Notes added after P1 (2026-11-12; no change to the decision)

- **Tone runs on a native `AudioContext`.** The `standardized-audio-context` wrapper Tone
  creates by default has no `getOutputTimestamp()`, which the MIDI time mapping above
  needs. So the app creates a native `AudioContext` and hands it to `Tone.setContext`.
  Anyone changing `web/src/audio/tone.ts` should keep that.
- **The context starts inside the click.** "Loaded on the first user gesture" means the
  `AudioContext` is created and `resume()` is called synchronously in the click handler
  (`AudioEngine.load()`), before the `tone` chunk is fetched. WebKit (Safari, iOS, a Tauri
  shell on macOS) only starts audio that begins inside the gesture. Every later click
  resumes the context again, so a suspended context always has a way out.

## Consequences

- Swapping Tone.js later means rewriting one file plus its fakes, not the engine.
- The first Play has a short delay while `tone` and the samples load; the UI shows a
  loading state.
- Runtime depends on a third-party sample host until deployment self-hosts the samples.
- Training and performance modes can compare MIDI event times with scheduled note times
  directly, since both are audio-clock seconds.
