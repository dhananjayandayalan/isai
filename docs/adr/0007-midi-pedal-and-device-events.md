---
id: adr-0007
title: MidiInput gains sustain-pedal and device-change events
status: accepted
date: 2026-11-14
phase: P7
supersedes: null
---

# 0007 — `MidiInput` gains sustain-pedal and device-change events

Amends [ADR 0003](0003-midi-behind-interface.md), which keeps `MidiInput` to note-on,
note-off and device listing and asks for an explicit interface change for anything more.

## Context

P7 needs two things the interface can't express:

- **The sustain pedal** (control change 64). "Play my notes" should sustain while the
  pedal is down, and the keyboard display should show sustained keys.
- **Keyboards plugged in or out.** Today the learner presses "Scan again". Web MIDI
  reports changes through `MIDIAccess.onstatechange`. Native adapters (CoreMIDI, the
  Android MIDI API) have their own equivalents.

Rules 4 and 6 still hold: only `web/src/midi/` touches Web MIDI, and event times are on
the audio clock.

## Options considered

1. **A raw control-change event** (`onControlChange(cb)` with controller number and
   value). General, but every caller would re-learn CC 64's on/off threshold, and it
   invites MPE and other CC work that is out of scope.
2. **A pedal event and a device event, both named for what they mean** (`onPedal`,
   `onDevicesChanged`). Narrow, easy for a native adapter to map, and the threshold lives
   in one place.
3. **Poll `listDevices()`** instead of a device event. That needs a timer, which rule 6
   forbids, and it would still miss the pedal.

## Decision

Option 2. `MidiInput` gains:

- `onPedal(listener): Unsubscribe`. The listener gets
  `{ down: boolean, value: number, channel, time, deviceId }` for the **sustain pedal
  only** (CC 64 on the connected device). `down` is `value >= 64`. `time` is on the audio
  clock, mapped the same way as note times. Repeated values on the same side of 64 are
  passed on (half-pedalling shows in `value`).
- `onDevicesChanged(listener): Unsubscribe`. The listener gets the current device list
  whenever an input appears or disappears. When access to MIDI hasn't been granted yet,
  nothing fires; `listDevices()` still asks for access. "Scan again" stays as a fallback.
- When the connected device disappears, the adapter emits the new list. The caller
  decides what to do (the panel drops the connection and says so).

The practice engine and the scorer ignore the pedal: it doesn't change which keys were
pressed. Only the monitor ("play my notes") and the keyboard display use it.

`FakeMidiInput` gets `emitPedal(value, options)` and `setDevices(list)`, which emits a
device change.

## Consequences

- Plugging in a keyboard is noticed without a click, and the last keyboard reconnects
  by itself.
- Every adapter must implement two more methods. A native adapter without device events
  can return a no-op unsubscribe and rely on "Scan again".
- Other controllers (soft pedal, sostenuto, MPE, SysEx) still need their own interface
  change.
