# Review — P1 Playback

- **Branch:** `p1-playback` vs `main` (15 commits, 57 files, +6448 / −84; 1710 of the added
  lines are the generated validator)
- **Reviewed:** 2026-10-13
- **Inputs:** `CLAUDE.md`, `docs/spec/p1-playback.md`, `docs/spec/plans/P1.md`, ADRs 0001–0004,
  `design/system/STYLE_GUIDE.md`

## Verdict: needs work (one small blocking fix)

The phase is in scope and every automated check passes. Hard rules 4–6 hold in code and
are enforced by lint and tests.

One blocking issue: audio is not started from the click itself, as the spec requires. In a
browser that only honours a direct click (Safari, iOS), sound would likely never start and
the page would show "Tuning the piano…" forever with no way out. It's a small fix.

The by-hand MIDI check is the owner's and is **pending**, not failed (see the end).

## Blocking

1. **The AudioContext is created after two network loads, not in the click.**
   - The spec says "`Tone.start()` runs only from a user gesture"
     (`docs/spec/p1-playback.md:47`), and ADR 0004 says tone loads "on the first user
     gesture (which browsers also need to start audio)" (`0004…md:46-47`).
   - In the code, the click calls `AudioEngine.load()` (`web/src/audio/engine.ts:35`). That
     first awaits the `./audio/tone` chunk (`web/src/main.tsx:15`), then awaits `import('tone')`
     (`web/src/audio/tone.ts:30`). Only then does it run `new AudioContext()` and
     `await Tone.start()` (`tone.ts:33-35`).
   - Chrome and Firefox allow audio for the rest of the session once the page has been
     clicked, so they are probably fine. WebKit (Safari, iOS, a future Tauri shell on macOS)
     only allows audio started directly inside the click. There the context stays suspended,
     `Tone.start()` never resolves, and the status stays `loading`. Play is disabled while
     loading (`web/src/App.tsx:288`), so the learner can't retry. That also breaks
     STYLE_GUIDE rule 7 (every async state needs a way out).
   - The headless run that "verified" playback used `--autoplay-policy=no-user-gesture-required`,
     so it never tested this.
   - **Fix:**
     - Create the `AudioContext` and call `resume()` synchronously at the start of
       `AudioEngine.load()`, before any `await`. Pass that context into `createToneAudio`
       through an injected factory, so it can be tested.
     - Keep Play clickable while loading: a second click resumes the context again.
     - Add a unit test that the context factory runs synchronously inside `load()`.

## Pending (owner)

- **By-hand MIDI check** in Chrome with a real keyboard (`P1.md` exit criterion, still unticked).
- **The unknown headless "problems" entry.** The first headless run after the pill fix
  reported at least one console or network problem that was never read, because the browser
  was stopped. The run before the fix reported none. Watch DevTools during the hand check.
- **`.env.example`** still needs the `VITE_PIANO_SAMPLES_URL=` line. Claude can't edit
  `.env.*` files.

## Checks

| Area | Result | Evidence |
|---|---|---|
| Phase gate | **pass** | Everything is in the P1 spec: Web MIDI adapter, Tone transport and piano, player, canvas keyboard, page, rule 5/6 guards, ajv standalone (#2) and pipeline tidy-ups #3–#8. No training or performance mode, no notation, no saved settings, no Supabase. The `design/system/components.css` additions are design-system recipes the page needs; see suggestion 9. |
| ADR 0001 | pass | `docs/adr/0004-audio-engine-and-master-clock.md` has the required frontmatter and sections. |
| ADR 0002 | pass | No schema change (`git diff main...HEAD -- schema/` is empty). The new `src/generated/song.validate.js` is generator output (`web/scripts/gen-types.mjs`), only touched by `1fe8eac`, and regenerates byte-identically. The web still validates at load (`web/src/song.ts:24-27`). |
| ADR 0003 | pass | `MidiInput.ts` and `FakeMidiInput.ts` are unchanged. `WebMidiInput` maps timestamps inside the adapter through an injected `AudioClock` (`web/src/midi/WebMidiInput.ts:136-138`). |
| ADR 0004 | **partial** | Only `audio/tone.ts` imports `tone` (`:9`, `:30`). Engine, piano and UI use `Transport`/`Instrument` from `audio/types.ts`. The song position comes from `getSecondsAtTime(context.currentTime)` (`tone.ts:63-66`). MIDI uses one `getOutputTimestamp()` pair (`tone.ts:44-55`). Synth fallback is at `tone.ts:102-108`. **Gap:** loading "on the first user gesture" isn't really inside the gesture (blocking 1). The native-`AudioContext` detail isn't in the ADR (suggestion 10). |
| Rule 1 schema-first, generated untouched | pass | Schema unchanged. `/schema-sync` gives a 0-file diff. Generated files only change in the generator commit. |
| Rule 4 MIDI via `MidiInput` | pass | No `requestMIDIAccess` or `webmidi` outside `web/src/midi/`. ESLint CLI probes: 6/6 flagged in `src/App.tsx`, all clean in `src/midi/`. `src/lint-guards.test.ts` runs them on every test run. |
| Rule 5 no per-note re-render | pass | Notes go into a `Uint8Array` in `PianoController` (`:60`). The canvas is drawn from rAF. React state only changes on play/pause/stop (`player.ts:40-44`). The readout and seek bar are written through refs (`App.tsx:263-277`). `App.dom.test.tsx` checks that 200 notes plus 100 frames give 0 extra commits while the canvas, sound and readout keep up. |
| Rule 6 audio clock | pass, guard has gaps | No `Date.now`, `performance.now`, `setTimeout`, `setInterval` or `new Date()` in app code. Probes: 8/8 flagged in `src/` and `src/midi/`, clean in tests, rAF allowed. **Not caught:** `new Date().getTime()`, `Date['now']()`, `const { now } = performance` (suggestion 1). |
| Rule 7 rule-based arranger | n/a | `arrange/` untouched. |
| Rule 8 no audio in git | pass | No audio files in the diff. Instrument samples load at runtime from the Tone.js host, as approved in the plan; they aren't song audio. |
| Rule 9 naming | pass | English names only (`monitorMidi`, `PianoController`, `ScaleMode`, …). |
| Theory tests | pass | Web `src/theory/` 100% lines. Pipeline `theory/` 100% (58 statements). |
| Edge-case tests | pass (tempo change n/a) | Empty song, single note, overlapping notes on the same key, seek mid-note, velocity 0, end of song (`engine.test.ts`); notes outside the keyboard (`piano.test.ts`, `App.dom.test.tsx`). Tempo change: playback runs on seconds, not beats, so nothing in P1 depends on tempo. Test it when tempo control arrives. |
| Code quality | pass with suggestions | Swallowed errors (2, 3), unguarded `disconnect` (4), seek-drag flag (5), end-of-song timing (6), a latent effect-order issue (7). |
| Differences from plan (`P1.md`) | justified, two loose ends | **Native AudioContext:** `standardized-audio-context` really has no `getOutputTimestamp`, and playback works in Chrome (CDP run); add it to ADR 0004 (suggestion 10). **No `@testing-library/react`:** fewer deps, and `act()` covers it. **`monitorMidi` split out:** sound isn't drawing; 100% tested. **Per-key note counts, velocity-0 skip:** needed because Tone releases every voice of a pitch. **`.piano-canvas`/`.range`:** needed, but `preview.html` wasn't updated as the style guide asks (suggestion 9). **Pill colours:** real bug (dark theme), right fix (matches the prototype), but `p1-playback.md:73` still says `--hand-*` (suggestion 8). |
| Line endings | pass | `.gitattributes` keeps LF; regeneration is byte-identical. |

## Full checks (run during this review)

| Package | Command | Result |
|---|---|---|
| pipeline | `uv sync` | pass |
| pipeline | `uv run ruff check .` | pass |
| pipeline | `uv run ruff format --check .` | pass (24 files) |
| pipeline | `uv run pyright` | 0 errors, 0 warnings |
| pipeline | `uv run pytest --cov=isai` | 119 passed. Total 94%, `theory/` 100%, `cli.py` 98%, `schema.py` 99%, `gen_models.py` 52% |
| pipeline | `uv run isai analyse README.md --out .cache/p1-review` | writes a Song that validates |
| web | `pnpm install` | up to date |
| web | `pnpm lint` | pass |
| web | `pnpm typecheck` | pass |
| web | `pnpm test --run --coverage` | 173 passed in 11 files. Lines 93.4%, `theory/` 100%, `engine/` 100%, `midi/` 100%, `piano/` 98.4%, `audio/tone.ts` 18.8% (needs a real AudioContext) |
| web | `pnpm build` | pass. Main 294.4 kB (84.8 kB gzip); Tone chunk 340.8 kB (79.4 kB gzip) + 1.7 kB wrapper |
| web | `grep 'new Function\|eval('` on `dist/assets/*.js` | 0 in all three chunks |
| schema | `/schema-sync` steps | schema valid; examples as expected; both type sets + validator regenerate with 0-file diff; both type checks pass |
| design | `node design/system/check-tokens.mjs` | pass |
| lint | rule 4 and rule 6 probes (CLI + `lint-guards.test.ts`, 43 tests) | all as expected; 3 rule 6 bypasses noted |

## Exit criteria

| Criterion | Met? |
|---|---|
| ADR 0004 written and accepted; dependencies approved | yes (`tone`, `jsdom` approved; `@testing-library/react` not needed) |
| Web install / test / lint / typecheck / build pass | yes |
| Pipeline sync / pytest / ruff / pyright pass | yes |
| `/schema-sync` no diff (types, models, validator) | yes |
| Web MIDI only in `src/midi/`; ESLint fails on a probe | yes |
| ESLint fails on `Date.now` / `performance.now` / `setTimeout` / `setInterval` probes | yes (with the gaps in suggestion 1) |
| Rule 5 test: no extra commits for 200 notes + 100 frames | yes |
| Unit tests for `WebMidiInput`, `player`, `activeNotes`, `layout`, `midiToName` incl. edge cases | yes |
| Web `theory/` ≥ 90%, pipeline `theory/` ≥ 90%, `gen_models.py` > 0% | yes (100%, 100%, 52%) |
| `song.ts` imports no ajv compiler; no `new Function`/`eval(` in built JS | yes |
| By hand in Chrome with a real MIDI keyboard | **pending (owner)** |
| `check-tokens.mjs` passes | yes |
| `isai analyse` still writes a valid Song; `/golden-eval` not required | yes (no analysis change; golden audio still `TODO`) |
| Small conventional commits on `p1-playback` | yes (14 planned + 1 fix) |

## Suggestions (not blocking)

1. **The rule 6 guard misses three forms.** `new Date().getTime()`, `Date['now']()` and
   `const { now } = performance; now()` all pass lint (`web/eslint.config.js:22-29`). Add
   `NewExpression[callee.name='Date']`, a computed `Date['now']` selector, and
   destructuring from `performance`. Then add them to `lint-guards.test.ts`.
2. **Audio errors are thrown away.** `ensureAudio` catches without keeping the error
   (`App.tsx:85-87`), and the Sampler's `onerror` drops it (`tone.ts:102`). STYLE_GUIDE §7
   suggests the technical detail in `.t-faint`. Keep the message, show it there, and
   `console.error` it so the owner's DevTools check can see it.
3. **A non-JSON file pretends to be a document.** `openFile` replaces a parse failure with
   `{ notJson: file.name }` (`App.tsx:95-100`). The error state then lists schema errors
   ("must have required property 'schemaVersion'") instead of saying the file isn't JSON.
   Give it its own message.
4. **`disconnect()` in the MIDI panel isn't guarded.** `MidiPanel.tsx:92-95` awaits
   `midi.disconnect()` without a `catch`. If `port.close()` rejects, it's an unhandled
   rejection and the UI still shows "Connected".
5. **The seek-drag flag only clears on `pointerup`.** (`App.tsx:313-318`.) A cancelled
   pointer (touch scroll, alt-tab mid-drag) leaves `seeking` true, and the slider stops
   following playback. Also clear it on `onPointerCancel` and `onLostPointerCapture`, or on
   `onBlur`.
6. **End-of-song timing.**
   - The end event calls `player.stop()` as soon as Tone's lookahead fires it, about 0.1 s
     early, and ignores its scheduled `time` (`player.ts:62-66`). That cuts the last note's
     release slightly.
   - Seeking to exactly `durationSec` may not fire the end event, leaving the state
     `playing` past the end. This is unverified with real Tone.
   - Stop at the scheduled time, and clamp seeks to just before the end.
7. **Latent effect-order issue in `Keyboard.tsx`.** The controller is re-created when
   `frames` changes (`:38-64`), but the `setSong`/`setRange`/`attachMidi` effects (`:66-77`)
   don't re-run, so a new controller would start empty. `frames` is constant today. Build
   the controller from refs of all current props.
8. **The spec text is out of date.** `docs/spec/p1-playback.md:73` says song notes use
   `--hand-right`/`--hand-left`; the code uses `--piano-pill-*` (justified in `P1.md`).
   Update that line so the spec and code agree. The owner hasn't explicitly signed off on
   this change yet.
9. **The design-system change skipped a step.** STYLE_GUIDE "Changing the system" (`:217-219`)
   says to open `preview.html` in both themes. `.piano-canvas` and `.range` aren't in
   `preview.html`. Add them.
10. **ADR 0004 doesn't say Tone runs on a native `AudioContext`.** This isn't a
    contradiction. But it's why `getOutputTimestamp` works, and the next person to touch
    `tone.ts` will look in the ADR. Add a short note.
11. **Keyboard visibility handling is untested** (`Keyboard.tsx:53-55`, branches 37.5%). Add
    a DOM test that `visibilitychange` stops and restarts the frame loop.
12. **Still open from earlier:** seeking mid-note doesn't re-sound the note (`P1.md` open
    items); P0 review #9, #11 (beyond P1's states) and #13.

## Proposed fixes (waiting for your go-ahead)

- **Blocking:** 1. Create and resume the AudioContext synchronously in the click, keep Play
  usable while loading, and add a test.
- **Small, same branch (optional):** suggestions 1–8 and 11 are each a few lines plus a
  test.
- **Docs only:** suggestions 9 and 10.
