# Review — P2 Training

- **Branch:** `p2-training` vs `p1-playback` (15 commits, 69 files, +7951 / −762). `main` is
  30 commits behind: nothing from P1 or P2 is merged yet.
- **Reviewed:** 2026-11-13
- **Inputs:** `CLAUDE.md`, `docs/spec/p02-training.md`, `docs/spec/plans/P2.md`, ADRs 0001–0005,
  `design/system/STYLE_GUIDE.md`, `reports/review-P1.md`

## Verdict: needs work (one small blocking fix, two owner gates)

The phase is in scope and every automated check passes. Hard rules 4–6 hold in code and are
enforced by lint and tests. The engine has every test case the spec lists, and the built app
was driven in headless Chrome with the real transport.

One blocking code issue: the engine silences the whole piano voice it shares with "Play my
notes through Isai", so the learner's own held note is cut at every loop wrap, seek, speed
change and at the end of the song.

Two gates in the plan are the owner's and are still open: ADR 0005 is `proposed`, and P1 is
not merged or `done`. The by-hand keyboard check is **pending**, not failed.

## Blocking

1. **The engine cuts the learner's own notes.**
   - The engine and `monitorMidi` play through the same `Instrument`. `monitorMidi` sounds
     the learner's keys on it (`web/src/engine/monitor.ts:20`), on by default.
   - The engine calls `piano.releaseAll` on that voice at a loop boundary
     (`web/src/engine/practice/engine.ts:697`), at the end of the song (`:709`) and in
     `silence()` (`:746`), which runs on every seek, speed change, hand or mode change and
     on stop. Tone's `releaseAll` releases every voice, whoever started it
     (`web/src/audio/tone.ts:131-132`).
   - So a key the learner is still holding goes silent at those moments. The clearest
     case is a training loop: the learner plays the last note of the loop, holds it, and it
     is cut at the wrap. A probe test (pressed a key through the monitor, then wrapped,
     sought and changed speed) confirmed the note is no longer sounding in all three cases.
   - The engine already knows which keys it started (`sounding`, `:671`), so it doesn't
     need `releaseAll`.
   - **Fix:**
     - Release only the keys the engine started: walk `sounding` and call `noteOff` for
       each key with a count above zero, at the same `time` as today.
     - Add engine tests: a note started outside the engine survives a loop wrap, a seek, a
       speed change, stop and the end of the song; the engine's own notes are still cut.

## Pending (owner)

- **Accept ADR 0005.** The spec says the ADR is "accepted before the engine commits"
  (`docs/spec/p02-training.md:91`), and it is the first exit criterion (`:105`). It is still
  `proposed` (`docs/adr/0005-practice-engine.md:4`), and the engine is built on it. The plan
  says so openly; it still needs the owner's yes or changes.
- **Merge the P1 fix and mark P1 `done`.** The P1 blocking fix is `b3f5c11` on this branch.
  The plan's first exit criterion is unticked.
- **By-hand check** in Chrome with a real keyboard, for P1 and P2. The headless runs cover
  logic and scheduling. They can't cover how a hold feels through real speakers and a real
  keyboard's latency.
- **Sign off the differences from the spec** (`docs/spec/plans/P2.md`, "Differences from the
  plan"). Two change what the spec says:
  - A **Listen** mode sits next to Training and is the default. The spec's switch has
    Training and Performance only.
  - Right and wrong keys are marked by **shape** (disc, disc with a cross), not by a success
    and an error colour (`docs/spec/p02-training.md:74`), because the design system is greys
    only.
- **`.env.example`** still needs `VITE_PIANO_SAMPLES_URL=`. Claude can't edit `.env.*` files.
- **Commit `0501eeb`** put the specs for P3–P10, `00-architecture.md` and `docs/reference/`
  on this branch. Confirm that is where they should land.

## Checks

| Area | Result | Evidence |
|---|---|---|
| Phase gate | **pass** | Everything is in the P2 spec: practice engine, steps, matcher, bars, speed, loop, metronome, count-in, overlay, practice screen. `git diff p1-playback...HEAD` touches no file in `schema/`, `pipeline/`, `web/src/generated/`, `web/package.json` or the lockfile. Performance mode is a disabled "Coming soon" segment only (`web/src/Practice.tsx`). No scoring, notation, saved settings or backend. Listen mode goes beyond the spec's wording but is P1's behaviour on the new engine (see Pending). |
| ADR 0001 | pass | `docs/adr/0005-practice-engine.md` has the required frontmatter and sections. |
| ADR 0002 | pass | No schema change. The engine reads `tempo.downbeats` only through `'downbeats' in song.tempo` (`engine.ts:284`), so it works before P3 adds the field and doesn't need a type change. |
| ADR 0003 | pass | MIDI reaches the engine only through `MidiInput` (`engine.ts`, the MIDI section from `:853`). The DOM tests use `FakeMidiInput`. |
| ADR 0004 | pass | Decision unchanged; `8ce3c85` adds notes only. Only `audio/tone.ts` imports `tone`. The engine uses `Transport`, `Instrument` and an injected clock. The two additions to `Transport` (`pause(time)`, `lookahead`) and the metronome voice are behind the same interfaces. |
| ADR 0005 | **not accepted** | Code follows it: policies, steps by onset with 35 ms chord tolerance (`steps.ts:39`), 150 ms early grace (`matcher.ts:17`), hold as a transport event (`engine.ts:612`), idempotent events (`:656`), ignore while holding (`:659`). Status is `proposed` (see Pending). |
| Rule 1 schema-first | pass | No schema or generated file in the diff. |
| Rule 4 MIDI via `MidiInput` | pass | No `requestMIDIAccess` outside `web/src/midi/`. `lint-guards.test.ts` still runs the probes. |
| Rule 5 no per-note re-render | pass | Engine state the page shows is read in the frame callback and written through refs (`Practice.tsx`, the `[data-readout=…]` nodes). The extended test runs a whole training pass of Twinkle (14 holds, 224 MIDI events), each slice in its own `act()`, and sees exactly one commit, when the song ends (`web/src/App.dom.test.tsx`). |
| Rule 6 audio clock | pass | No wall-clock calls in app code. `5e45591` closes the three bypass forms from the P1 review, with probes for each. Holds, resumes and catch-up all work in audio-clock seconds. |
| Rules 7, 8 | n/a | `arrange/` untouched; no audio files in the diff. |
| Rule 9 naming | pass | English names only. |
| Tests for the spec's cases | pass | `steps`: chords, tolerance, held keys, velocity 0, range, playable. `matcher`: early grace, held-over keys, repeats, wrong notes, any-octave. `bars`: bars from beats, a song with no beats. `engine`: hold and resume, catch-up and its barriers, loop passes, count-in in every pass, speed change mid-song, seek, lagging transport, end of song. |
| Coverage | pass | `engine/practice/` 99.8% lines, `Practice.tsx` 99.3%, `piano/` 99.4%, overall 96.4%. `audio/tone.ts` 17% (suggestion 4). |
| Design system | pass | New tokens went through every step of "Changing the system": `tokens.css`, `tokens.json`, `components.css`, `preview.html`, `STYLE_GUIDE.md`. `check-tokens.mjs` passes. |
| Code quality | pass with suggestions | One blocking issue above. The engine is long (about 900 lines) but split into clear sections and almost fully covered. |
| P1 review follow-ups | pass | Blocking 1 fixed (`b3f5c11`). Suggestions 1–5, 7–11 done (`5e45591`, `cb224e7`, `8ce3c85`). Suggestion 6 (end-of-song timing) is fixed in the new engine (`engine.ts:708-710`). |

## Full checks (run during this review)

| Package | Command | Result |
|---|---|---|
| web | `pnpm lint` | pass |
| web | `pnpm typecheck` | pass |
| web | `pnpm test --run --coverage` | 363 passed in 15 files. Lines 96.4%, `engine/practice/` 99.8%, `engine/` 100%, `midi/` 100%, `piano/` 99.4%, `theory/` 100%, `audio/tone.ts` 17% |
| web | `pnpm build` | pass. Main 316.7 kB (91.8 kB gzip); Tone chunk 340.8 kB (79.4 kB gzip) + 2.1 kB wrapper |
| design | `node design/system/check-tokens.mjs` | pass |
| pipeline | not run | No pipeline file in the diff. |
| schema | not run | No schema or generated file in the diff. |

## Exit criteria

| Criterion | Met? |
|---|---|
| P1 blocking fix merged; P1 marked `done` | **pending (owner)**: the fix is on this branch, not merged |
| Practice-engine ADR accepted | **pending (owner)**: ADR 0005 is `proposed` |
| `steps`, `matcher`, `engine`, bar helper tested for every case; `engine/` ≥ 90% | yes (99.8%) |
| Training runs end to end on both example songs with `FakeMidiInput` | yes |
| Speed 40% and 120%, loop bars 1–4, metronome, count-in in a DOM test | yes |
| Extended rule 5 test | yes |
| Rule 6 guard catches the three P1 bypass forms | yes |
| Lint, typecheck, tests, build, `check-tokens.mjs`, `/schema-sync` | yes |
| By hand in Chrome with a real keyboard | **pending (owner)** |

## Suggestions (not blocking)

1. **A stale comment.** `web/src/piano/PianoController.ts:2` and `:24` still say the position
   comes "from the player". `player.ts` is gone; it is the practice engine now.
2. **"1 notes don't fit".** `web/src/Practice.tsx:462` doesn't handle the singular, and
   `App.dom.test.tsx:373` asserts the wrong text.
3. **A releasing monitor note can cut Isai's note on the same key.** If the learner's key
   and Isai's other-hand note are the same pitch, `monitorMidi`'s `noteOff`
   (`monitor.ts:24`) releases both, because Tone releases every voice of a pitch. Rare. The
   blocking fix has the same shape in reverse; a per-source count in the instrument wrapper
   would solve both for good.
4. **`audio/tone.ts` is 17% covered and the browser scripts aren't in the repo.** The
   headless Chrome runs that found the count-in bug live outside git. Checking them in
   under `web/scripts/` (not in CI yet) would let the next phase repeat them.
5. **`KeyboardRenderer.ts` imports the key flags from the engine module**
   (`web/src/piano/KeyboardRenderer.ts:6`). Type-only for the most part, but it ties drawing
   to the 900-line engine file. A small `engine/practice/view.ts` holding the flags and the
   view interface would keep the piano's dependency narrow.
6. **The other hand played by the learner counts as wrong.** Practising the right hand
   while also playing the left-hand notes marks them wrong and lowers "right first time".
   Consider: a key that matches the other hand's current notes is neither right nor wrong.
7. **`MAX_CATCH_UP` is 0.3 s** (`engine.ts:136`). On an output with more latency than that
   (some Bluetooth speakers), Isai will resume a little late after each hold. Fine for now;
   worth a line in ADR 0005.
8. **The readout is `aria-live="off"`** (`Practice.tsx:300`). A screen-reader user never
   hears "Waiting for G4". A polite announcement on hold only (not while playing) would be
   cheap. Already listed in the plan's open items for P7.
9. **Pausing saves the position at the audio clock, not at the last sound scheduled.**
   Resume can replay up to one lookahead (about 100 ms). Same as P1; unlikely to be heard.
10. **Duplicate specs.** `docs/spec/p0-foundation.md` and `p1-playback.md` carry the same
    `phase:` as `p00-foundation.md` and `p01-playback.md`. `/phase-start` matches on
    `phase:`. Delete the older two or change their frontmatter.
11. **Pickup bars** loop one beat off until P3 adds downbeats. Accepted in the spec
    (`p02-training.md:93`); listed so it isn't lost.

## Proposed fixes

- **Blocking:** 1. Release only the engine's own notes; add the tests.
- **Small, same branch:** suggestions 1, 2, 5, 6 and 8 are each a few lines plus a test.
  Suggestion 3 is a slightly larger change in the instrument wrapper.
- **Docs only:** suggestion 7 (a line in ADR 0005).
- **Owner:** everything under Pending, and suggestions 4 and 10 need a decision.
