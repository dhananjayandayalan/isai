---
id: adr-0003
title: MIDI input goes through a MidiInput interface
status: accepted
date: 2026-10-13
phase: P0
supersedes: null
---

# 0003 — MIDI input goes through a `MidiInput` interface

## Context

Learners connect a MIDI keyboard. The Web MIDI API works in Chromium browsers and Firefox,
but not in Safari, not in a Tauri webview on macOS, and not on iOS. A native shell (Tauri)
or app may come later and will need a native MIDI path. The training engine also needs to
be tested without real hardware.

## Options considered

1. **Call `navigator.requestMIDIAccess` / WebMidi.js wherever it is needed.** Fastest to
   start; every caller then has to change when a native path arrives, and tests need a
   browser MIDI mock.
2. **A small `MidiInput` interface in `web/src/midi/` with adapters.** One Web MIDI adapter
   now, native adapters later, a fake for tests. Slight upfront design.
3. **Native-only from the start (Tauri + midir).** Covers macOS, but forces a desktop build
   before the web app is proven.

## Decision

Use option 2. `web/src/midi/MidiInput.ts` defines the interface: `listDevices()`,
`connect(deviceId)`, `onNoteOn(cb)` and `onNoteOff(cb)` (each returning an unsubscribe
function), and `disconnect()`. Nothing outside `web/src/midi/` touches
`navigator.requestMIDIAccess` or WebMidi.js (CLAUDE.md hard rule 4).

P0 ships only the interface and a `FakeMidiInput` for tests. The Web MIDI adapter comes in
the phase that needs a real keyboard; native adapters plug in behind the same interface.

## Consequences

- The engine and UI are testable with `FakeMidiInput`.
- Adding Safari, Tauri or iOS support means writing one adapter, not touching callers.
- Event timestamps must be mapped to the audio clock inside the adapter (rule 6), so
  adapters carry that responsibility.
- The interface is the lowest common denominator; platform-specific features (SysEx, MPE)
  need an explicit interface change.
