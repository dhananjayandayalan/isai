# Review — P7 Notation, display and settings

- **Branch:** `p7-notation` vs `p6-performance` (13 commits, 55 files, +4524 / −169). The
  branch is cut from `p6-performance`; nothing from P1, P2, P6 or P7 is on `main` yet.
- **Reviewed:** 2026-11-14
- **Inputs:** `CLAUDE.md`, `docs/spec/p07-notation-settings.md`, `docs/spec/plans/P7.md`,
  ADRs 0003, 0004, 0005, 0007, `design/system/STYLE_GUIDE.md`, `reports/review-P6.md`

## Verdict: needs work (two small blocking fixes, owner checks pending)

The phase is in scope and every automated check passes. Hard rules 4–6 hold and are tested
with the stage running. The theory and notation code is fully covered, and each renderer is
tested on a fake context at every keyboard size.

Two blocking issues:

- After opening the Devices screen from a Results page and switching songs, Done shows the
  old song's result next to the new song.
- The note names on the keys ignore the learner's font size, which the spec asks for and the
  plan says is done.

The by-hand checks (keyboard-only use, and practising with swaras, Roman numerals, the staff
and the pedal) are **pending**, not failed.

## Blocking

1. **Done can return to a result that belongs to another song.**
   - The song picker and "Open a .song.json file" stay in the top row on the Devices screen.
     `pick()` leaves the results page only when the *current* view is `results`
     (`web/src/App.tsx:220-223`).
   - On the Devices screen the view is `devices` and `returnTo` stays `results`
     (`App.tsx:232`). Done then goes back to it (`App.tsx:390`), and `showResults` is true
     (`App.tsx:273`).
   - Probe: perform Twinkle, open MIDI & keyboard from Results, pick Frère Jacques, press
     Done. The page shows "Twinkle, Twinkle, Little Star · Performance results" while Frère
     Jacques is the open song. "Loop bars 3–4 in training" would then open Frère Jacques
     with Twinkle's bar numbers, and "Play again" plays the other song.
   - P6 didn't have this path: the panels were hidden on the results page.
   - **Fix:**
     - In `pick()` (and so in opening a file), treat the page under the Devices screen like
       the view: if `returnTo` is `results`, set it to `song`.
     - Add a DOM test of exactly that path: Done lands on the new song's overview.

2. **Key names don't follow the learner's font size.**
   - The spec asks that "notation text respects the user's font size"
     (`docs/spec/p07-notation-settings.md:81`). The plan says canvas text sizes are read
     from the root font size (`docs/spec/plans/P7.md:98`).
   - That holds for the stage: `readStageColors` scales by the root font size
     (`web/src/notation/stage.ts`). It doesn't hold for the keys:
     - `Keyboard` reads the piano colours once with no scale (`web/src/piano/Keyboard.tsx:32-34`).
     - `readPianoColors` builds `labelFont` from `--text-2xs` as written, 11 px
       (`web/src/piano/KeyboardRenderer.ts:79`).
   - The swara and solfège names on the keys are the main place a learner reads the chosen
     notation, and they stay at 11 px whatever the browser's font setting.
   - **Fix:**
     - Pass the root font size to `readPianoColors` and scale the label font, as the stage
       does. The fit check already reads the size from the font, so names that no longer
       fit drop out on their own.
     - Re-read on the same events as the stage colours.
     - Add a unit test: a 20 px root gives a 14 px label font.

## Pending (owner)

- **Check by hand.** Keyboard-only use of Practice and Devices (the DOM test covers names and
  tab stops, not focus order or visible focus). Then practise with swaras, Roman numerals and
  the staff, with the pedal sustaining your notes.
- **Sign off the spelling change.** The spec says notes outside the key are spelled by the
  direction of motion (`p07-notation-settings.md:23-24`). P7 does that for black keys only.
  A white key outside the key keeps its plain letter (B, not C♭; G in G♯ minor, not F𝄪),
  because the literal rule wrote B♮ falling to B♭ as "C♭". It's in the plan's differences;
  it needs your yes.
- **Sign off the other differences** in the plan:
  - "Note names" also sits on Practice.
  - Hiding the other hand also hides it on the keys.
  - Key names are dropped when they don't fit.
  - `add6` for sixth chords.
- **`.env.example`:** add `VITE_EPIANO_SAMPLES_URL=`.
- **ADRs 0005 and 0006** are still `proposed`. ADR 0007 is accepted.

## Checks

| Check | Result |
|---|---|
| Phase gate | pass: everything is in the P7 spec; nothing from P8 (synced settings, library) or P10 (raga-aware swaras, gamakas). No engraving library, no MPE or other controllers |
| ADR 0003 / 0007 | pass: `onPedal` and `onDevicesChanged` exactly as ADR 0007 decides (`web/src/midi/MidiInput.ts`); CC 64 only; the caller disconnects a device that has gone (`MidiPanel.tsx:110`) |
| ADR 0004 | pass: the electric piano is a second `Instrument` behind `SwitchableInstrument` (`web/src/audio/voices.ts`); only `tone.ts` imports Tone; samples at a runtime URL with an env override |
| ADR 0005 | pass: the engine never subscribes to the pedal. A probe confirmed a training hold stays held through pedal down and up |
| Rule 1, schema | pass: no schema or generated change; chords read through the generated `Chord` type |
| Rule 4, MIDI | pass: `requestMIDIAccess` only in `web/src/midi/WebMidiInput.ts`; lint guard unchanged |
| Rule 5, renders | pass: falling notes, the staff, the lane, sustained keys and the Devices readouts are drawn or written through refs. The DOM test of 200 notes, the pedal and 100 frames with letters and with the staff commits nothing |
| Rule 6, clock | pass: the stage reads the engine's position; no new `Date` or timers (`wallClock.ts` remains the one exception) |
| Rule 8, audio | pass: no audio in git; samples are streamed from a pinned CC BY 3.0 copy, credited in the footer |
| Rule 9, naming | pass: English module names; musical terms (swara, madhya, mandra, tara) in their own form |
| Theory tests | pass: spelling for 12 tonics × major and minor plus all 30 key names; solfège do- and la-based with chromatic syllables; all 12 swara positions, shared names by scale, octaves across boundaries; Roman numerals for all 19 qualities, inversions, borrowed and secondary chords. `theory/` 100% lines |
| Edge cases | pass: empty index and single note on the stage; a song with no beats (no bar lines, stepped position unchanged); a song with no chords on the staff; notes off a 49-key keyboard as edge markers; tempo changes come from the beat array as given |
| Exit criteria | 7 of 9 met; the keyboard-only check by hand and the practice check are the owner's |
| Typecheck, lint | pass |
| Tests | 704 in 27 files pass; coverage 97.9% lines (`theory/`, `notation/`, `midi/`, `engine/` 100%; `piano/` 99.5%; `audio/` 73% because `tone.ts` needs a real AudioContext, as since P1) |
| Build | pass; main bundle 372.1 kB (109.8 kB gzip), up 27 kB from P6 |
| `check-tokens.mjs` | pass |

## Suggestions

1. **Two DOM tests can pass without checking anything.**
   - "hides the hand you are not playing when asked" (`web/src/App.dom.test.tsx:1658-1670`)
     only asserts that no bar has alpha 0.3. It passes if the stage drew nothing. Assert the
     right-hand bars are there and no left-hand bars are.
   - The keyboard-only test checks `div[onclick]` (`App.dom.test.tsx:1744`), but React
     handlers never appear as attributes. Drop it, or check that every element with a click
     handler is a native control.
   - The plan promised "a sensible order"; nothing checks focus order.
2. **No test says the engine ignores the pedal.** It does (probe above), but ADR 0007 states
   it, so a short engine test should pin it: pedal events during a hold and during a scored
   run change nothing.
3. **MidiPanel writes a ref during render** (`web/src/MidiPanel.tsx:110`). React 19 advises
   against it. Assign it in an effect, so a render that React throws away can't leave a
   stale handler.
4. **`GHOST_ALPHA` is defined twice** (`web/src/notation/StaffRenderer.ts:96` and
   `FallingNotes.ts:35`). Share one constant.
5. **Staff glyphs scale with staff spacing, not with font size** (`StaffRenderer.ts:167,
   200, 215`). That is right for clefs and accidentals, which must fit the lines. Worth a
   comment, so nobody "fixes" it under blocking issue 2.
6. **Chords spell against a chord tone, not the next melody note.** `labelNotes` and
   `buildStaffNotes` take the next note of the same hand, which for a chord is a note struck
   at the same time (`FallingNotes.ts:65`). A chromatic note in a chord is then spelled by
   its neighbour in the chord. Taking the next note with a later start would match the
   direction of motion more closely.
7. **The Devices velocity readout shows the raw key velocity** (`web/src/Devices.tsx:93`),
   not what the curve makes of it. Showing both ("72 → 90") would explain what the curve
   does.
8. **A replugged keyboard reconnects without a click**, so if the browser had suspended
   audio, the learner's notes are silent until the next click. It's in the plan's
   differences; a short hint in the panel would help.
