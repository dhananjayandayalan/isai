# Review — P6 Performance mode

- **Branch:** `p6-performance` vs `p2-training` (8 commits, 43 files, +4493 / −99). The
  branch is cut from `p2-training`; nothing from P1, P2 or P6 is on `main` yet.
- **Reviewed:** 2026-11-14
- **Inputs:** `CLAUDE.md`, `docs/spec/p06-performance.md`, `docs/spec/plans/P6.md`, ADRs
  0001–0006, `design/system/STYLE_GUIDE.md`, `reports/review-P2.md`

## Verdict: needs work (one small blocking fix, two owner gates)

The phase is in scope, every automated check passes, and the hard rules hold. The scorer
has every test case the spec lists plus golden files. The DOM tests play both example songs
through to a Results page whose numbers match a fixture worked out by hand.

One blocking issue: the timing histogram has no bin centred on zero, so on-time notes are
drawn as late and the chart's screen-reader text says a perfect run was "most after the
beat".

ADR 0006 is `proposed` and the by-hand check with a real keyboard hasn't been done. Both
are the owner's. The by-hand check is **pending**, not failed.

## Blocking

1. **The timing histogram shows on-time notes as late.**
   - The scorer makes `2 × ok ÷ bin` = 16 bins from −160 to +160 ms
     (`web/src/engine/practice/scorer.ts:259`) and files a note with
     `floor((offset + ok) ÷ bin)` (`:263`). With an even count there is no centre bin: an
     offset of exactly 0 goes into bin 8, which is 0 to +20 ms, the first "late" bin.
   - `Results.tsx` then counts the first half of the bins as early (`web/src/Results.tsx:222`)
     and labels the chart from that (`:223`, `:254`).
   - A probe run of Frère Jacques with every note dead on time gave the bins
     `0 0 0 0 0 0 0 0 8 0 0 0 0 0 0 0`, all right of centre, and the label "Timing
     histogram: 8 of 8 notes within 50 milliseconds, most after the beat."
   - The highlighted "perfect" bins (`Results.tsx:217-220`) are 5–10, which is −60 to +60 ms,
     not the ±50 ms the caption gives.
   - This is the chart the by-hand exit criterion relies on ("play deliberately late, and see
     late on the results"). Right now an on-time player sees late too.
   - **Fix:**
     - Use an odd number of bins centred on 0: `2 × round(ok ÷ bin) + 1` = 17, filed with
       `round(offset ÷ bin)` plus the centre index, clamped. Bin *i* is centred on
       `(i − 8) × 20 ms`.
     - In `Results.tsx`, count early as the bins below the centre and late as the bins above
       it. Notes in the centre bin are "on the beat", so a perfect run reads "all on the
       beat". Mark a bin as in the perfect window when `|centre| ≤ 50 ms` (bins 6–10, edges
       at ±50 ms).
     - Regenerate the two golden result files (`engine/practice/fixtures/*.result.json`)
       and add tests: an offset of 0 lands in the centre bin, ±10 ms land either side of the
       centre, and a perfect run's label says "on the beat".

## Pending (owner)

- **Accept ADR 0006** (scoring, windows, score formula, latency model, local records,
  the `wallClock.ts` exception to rule 6). It is `proposed`
  (`docs/adr/0006-performance-scoring-and-latency.md:4`) and it is the first exit criterion.
  ADR 0005, which P6 builds on, is also still `proposed`.
- **By-hand check** with a real keyboard: calibrate, play an example song deliberately
  late, and see "late". P6 hasn't been driven in a real browser yet (P2 was, in headless
  Chrome with a virtual MIDI port). The fakes can't show how real speakers and a real
  keyboard's latency feel, or whether the calibrated offset is close.
- **Sign off the differences from the plan** (`docs/spec/plans/P6.md`, "Differences from
  the plan"). The one that changes the spec's wording: a performance can't be paused. While
  it plays, the Play button becomes **Finish** and the run's settings are locked.

## Checks

| Check | Result |
|---|---|
| Phase gate | pass: everything is in the P6 spec. The song overview is the local version the spec asks for; nothing from P7 (notation) or P8 (library, server sessions) |
| ADR compliance | pass against accepted ADRs 0001–0004. MIDI only through `MidiInput` (ADR 0003); key times on the audio clock (ADR 0004). Built on ADRs 0005 and 0006, both `proposed` |
| Rule 1, schema | pass: no schema change; the session record is a web type (`web/src/sessions/types.ts`) |
| Rule 4, MIDI | pass: `LatencyCard`, `calibration.ts` and the engine take `MidiInput`; lint guard unchanged |
| Rule 5, renders | pass: DOM tests cover a whole performance run (`App.dom.test.tsx`, "rule 5 in performance mode", plus every `perform()`) and "Play any key to test" taps. The fix in `7472cd9` also removed a second commit at every play and stop |
| Rule 6, clock | pass: key times, scoring and calibration use the audio clock and the transport. `Date` only in `sessions/wallClock.ts`, the exception named in ADR 0006, held by the lint config and `lint-guards.test.ts` |
| Rule 8, audio | pass: no audio files; sessions store no raw MIDI |
| Rule 9, naming | pass |
| Tests | pass: every scorer case in the spec (`scorer.test.ts`), golden files, engine performance tests including a clean run of each example song, calibration within ±5 ms (`settings.test.ts:169`), stores, and 16 DOM tests. Edge cases: empty song, single note, notes off the keyboard, speed 50%, loop boundary, a run finished early or in the count-in |
| Exit criteria | 6 of 8 met and checked; ADR 0006 and the by-hand check are the owner's |
| Lint, typecheck | pass |
| Tests | 495 in 19 files pass; coverage 97.2% lines; `engine/practice/` 99.6% |
| Build | pass; main bundle 344.2 kB (100.6 kB gzip), up 26.8 kB from P2 |
| `check-tokens.mjs` | pass |

Checked by probe and found sound: the press-time conversion in the engine
(`engine.ts:941`). `Transport.seconds` is the position at `context.currentTime`
(`audio/tone.ts:67-70`), the same clock as `AudioClock.now()`, so there is no lookahead
skew. Pausing a song, calibrating and pressing Play again resumes at the paused position
with the notes sounding.

## Suggestions

1. **The app trusts the session store never to reject.** `App.tsx` calls
   `sessionStore.add(...).then(...)` and `sessionStore.list(...).then(...)` with no `catch`
   (`web/src/App.tsx:106`, `:202`). `main.tsx` wraps the store in `ResilientSessionStore`,
   which never rejects, so nothing breaks today. But `SessionStore` doesn't promise that, and
   P8 adds a Supabase store. With a store that rejects, the overview would show the loading
   skeleton for ever, the rejection would go unhandled, and Results would say nothing about
   saving. Catch both calls and treat a failure as "not saved".
2. **Flat minor keys are spelled with sharps.** `SongOverview.scaleNames` picks flats only
   for a key containing `b` or the key of F (`web/src/SongOverview.tsx:22`). D, G, C and F
   minor have flats, so D minor's scale shows `A#` instead of `Bb`. The rule also lives in a
   page. Spelling belongs in `web/src/theory/` with a test; a key-signature rule covers both
   modes. P7 owns notation, so a small helper now is enough.
3. **IndexedDB `add` resolves before the transaction commits** (`sessions/store.ts:65-68`).
   `request.onsuccess` fires before `transaction.oncomplete`, and a transaction can still
   abort (quota, for instance), so a session can be reported saved and then be lost. Resolve
   on `oncomplete` instead.
4. **After a mid-visit storage failure the older sessions vanish from the list.**
   `ResilientSessionStore` switches every call to memory (`sessions/store.ts:125-134`), so
   sessions saved earlier in IndexedDB stop being listed. The page says sessions aren't
   being saved, but it reads as if history was lost. A note in the code is enough until P8.
5. **The spec table still says P6 is `in-progress`** (`docs/spec/README.md:22`); the spec
   and plan are `in-review`.
6. **Commit `3734cf4` breaks the commit convention.** Its subject is `feat: add LatencyCard…`
   but it holds eight changes (Results, SongOverview, Practice, App, MidiPanel, sessions
   types, design system, `resultText.ts`). It has no scope, no tests and no attribution
   line. Consider splitting or rewording it before the merge.
7. **Auto-reconnecting the last keyboard starts audio after an `await`**
   (`MidiPanel.tsx:88` → `onConnect` → `ensureAudio`), not straight inside the click as
   ADR 0004 asks. Chrome allows it because the page has had a click (sticky activation).
   Worth a line in the code, or an `ensureAudio()` call at the start of the scan click.

## Follow-up (2026-11-14)

| Item | Status |
|---|---|
| Blocking 1, histogram centre | fixed in `d71e874`: 17 bins centred on 0; the label gives early, on the beat and late counts; golden histograms re-checked by hand |
| Suggestion 1, store rejections | fixed in `0740eec` |
| Suggestion 2, scale spelling | fixed in `0740eec` (`web/src/theory/keys.ts`, 100% lines) |
| Suggestion 3, IndexedDB commit | fixed in `0740eec` |
| Suggestion 4, history after a failure | documented in `0740eec`; P8 replaces the store |
| Suggestion 5, spec table | fixed (P6 `in-review`) |
| Suggestion 6, commit `3734cf4` | open: rewording history is the owner's call |
| Suggestion 7, audio inside the click | fixed in `0740eec` |

After the fixes: 528 web tests pass, lint, typecheck, build and `check-tokens.mjs` pass.
What's left is the owner's: accept ADR 0006, do the by-hand check, decide on `3734cf4`.
