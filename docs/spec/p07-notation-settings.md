---
id: spec-p07-notation-settings
phase: P7
title: Notation, display and settings — names, swaras, Roman numerals, staff, falling notes, pedal
status: in-progress
track: web
depends_on: [spec-p02-training]
---

# P7 — Notation, display and settings

## Goal

Learners see the music the way they think about it: letter names, solfège, swaras (Sa Ri
Ga), Roman numerals for chords, or a scrolling staff. A falling-notes view shows what's
coming. The sustain pedal works, keyboards are noticed when plugged in, and every choice
on the Devices screen is saved.

## Scope

### Theory — `web/src/theory/` (≥ 90% coverage)
- **Spelling** (`spelling.ts`): spell each pitch for the song's key (F# in D major, Gb in
  Db major), with key signatures for all 30 major and minor key names, and accidentals
  for non-diatonic notes chosen by the direction of motion.
- **Letters:** `C D E` with octave numbers on demand.
- **Solfège:** movable do, with do-based minor by default (`la`-based as an option);
  chromatic syllables (di, ra, ri, me…).
- **Swaras:** relative to the tonic (Sa).
  - The 12 swarasthanas named S, R1, R2/G1, R3/G2, G3, M1, M2, P, D1, D2/N1, D3/N2, N3.
  - Where two names share a position, the default spelling follows the song's scale (a
    major scale shows S R2 G3 M1 P D2 N3).
  - Short display (S R G M P D N) or detailed display (with numbers).
  - Octave dots: mandra below, tara above.
  - Raga-aware spelling comes in P10.
- **Roman numerals** (`roman.ts`): chord label → numeral relative to key and mode (I, ii,
  V7, ♭VII, viiø7), inversions as figures (V6, V65), and borrowed chords with
  accidentals. Secondary dominants (V/V) when the next chord resolves them.
- Tests: all 12 keys × major and minor for spelling; every chord quality in the schema
  for Roman numerals; swara names across octave boundaries.

### Display — `web/src/piano/` and `web/src/notation/`
- **Key labels** in the chosen system on the keyboard (current step keys and C keys).
- **Falling notes** (`FallingNotes.ts`, canvas, rAF): note bars fall onto the keyboard in
  hand colours. A look-ahead of 2–8 seconds (adjustable). Bar lines from beats and
  downbeats. A chord-label lane in the chosen system. It shares the keyboard's layout,
  so columns line up for every keyboard size.
- **Scrolling staff** (`StaffRenderer.ts`, canvas): a grand staff with clefs and key
  signature, and noteheads with accidentals and ledger lines placed by time (not engraved
  rhythm), bar lines and a playhead. Hands on separate staves. This is a reading aid,
  not printable sheet music.
- Displays read from engine refs only (rule 5). Each renderer is tested on a fake 2D
  context.
- **Reduced motion:** with `prefers-reduced-motion`, falling notes step instead of
  scrolling smoothly.

### MIDI — `web/src/midi/` (interface change)
- `MidiInput` gains `onPedal(cb)` (sustain CC 64; on at ≥ 64) and `onDevicesChanged(cb)`
  (from `MIDIAccess.onstatechange`). `FakeMidiInput` and `WebMidiInput` implement both.
  "Scan again" stays as a fallback.
- The pedal holds notes for "play my notes" sound and on the keyboard display. Training
  and scoring ignore the pedal (it doesn't change which keys were pressed).
- Velocity curve setting (soft, normal, hard) applied when monitoring your notes.

### Sounds
- "App sound" choice: grand piano (Salamander), electric piano (a second sampled set with
  a compatible licence) and "Off (use my keyboard)". A second `Instrument` behind the
  same interface (ADR 0004's deferred second instrument).

### Devices screen and settings
- Follows `design/prototype/Devices.dc.html`:
  - input device, keyboard size, app sound, velocity, sustain pedal test
  - latency (from P6)
  - note names (Letters, Solfège, Swaras, Roman numerals for chords, Staff)
  - metronome default, "Show the arranged hand I'm not playing"
- Every setting is saved through `SettingsStore`, versioned with defaults for missing
  keys.

### Accessibility
- Every control is reachable by keyboard and has a label. Hand colours stay
  distinguishable for common colour-vision deficiencies (checked against the tokens).
  Notation text respects the user's font size.

## Needs owner approval before building

- **ADR amending 0003:** `MidiInput` gains `onPedal` and `onDevicesChanged`. The ADR says
  platform features need an explicit interface change, so this is that change.
- **Second instrument samples:** the source, licence and size. Self-hosting is still a
  P9 job; until then, a runtime URL like the piano's.
- **Solfège convention:** do-based minor as default (proposed) or la-based.
- **No notation library.** The staff is a custom canvas renderer. A full engraving
  library (e.g. VexFlow) would be a large dependency and isn't needed for a time-placed
  reading aid. If the owner wants printable sheet music, that's a separate phase.
- **No schema change.**

## Out of scope

Printable or engraved sheet music. Raga-specific swara spelling and gamaka display (P10).
Settings synced across devices (P8). Native MIDI adapters. MPE and other CCs. Tamil-script
UI text (see `docs/reference/public-launch.md`, i18n).

## Exit criteria

- [ ] ADR (MidiInput change) accepted; sample licence approved
- [ ] Spelling, solfège, swaras and Roman-numeral tests pass; `web/src/theory/` ≥ 90% lines
- [ ] Falling notes and staff draw correctly on a fake context for all keyboard sizes; out-of-range notes are marked
- [ ] Pedal and device-change events are covered in the adapter and fake tests; unplug/replug updates the device list without "Scan again"
- [ ] Every Devices setting persists across reloads and survives storage errors
- [ ] Rule 4, 5 and 6 tests still pass with falling notes and staff running
- [ ] Keyboard-only navigation of Practice and Devices works (DOM test plus a check by hand)
- [ ] By hand (owner): practise with swaras, then Roman numerals, then the staff; the pedal sustains your notes
- [ ] Web lint, typecheck, tests and build pass; `check-tokens.mjs` passes
