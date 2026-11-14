# Review — P3 Analysis core (partial: commits 1–9)

- **Branch:** `p3-analysis` vs `p7-notation` (11 commits, 52 files, +4789 / −454).
- **Reviewed:** 2026-11-14
- **Inputs:** `CLAUDE.md`, `docs/spec/p03-analysis-core.md`, `docs/spec/plans/P3.md`, ADRs 0002 and 0008, `docs/spec/00-architecture.md` §3

## Verdict: needs work (one blocking fix; the golden-set work is still to come)

All the checks pass. The phase is in scope and ADR 0008 is followed. One blocking bug: the
stage cache ignores changes to ingest, so stale beats and keys survive an ingest change.

## Blocking

1. **Changing ingest doesn't invalidate the stages after it.**
   - `runner.note("ingest", …)` (`pipeline/src/isai/pipeline.py:61`) doesn't feed the cache-key
     chain: `note` never sets `_previous_key` (`pipeline/src/isai/runner.py:52, 80, 83`). So
     rhythm's key covers only its own options, not ingest's version, trim or normalisation.
   - Probe: analyse a song with the cache, then change the trim padding and bump
     `INGEST_VERSION`, and analyse again. Rhythm and tonality come from the cache, and the
     first beat is written at 0.570 s against 0.988 s fresh. That's a wrong time in the Song.
   - This contradicts the architecture ("changing one stage invalidates everything after it",
     §3) and the pipeline README.
   - **Fix:** give ingest a key in the chain: its version and limits, and the trim offset. Either
     `note` takes options and sets `_previous_key`, or ingest goes through `stage` with an
     uncached marker. Add a test that an ingest change re-runs rhythm and tonality.

## Checks

| Check | Result |
|---|---|
| Phase gate | pass: P3 only. The MIDI writer already handles notes, which the spec allows |
| ADR 0002 / 0008 | pass: schema first; version enum 0.1.0 and 0.2.0; frozen 0.1.0 examples load on both sides; `/schema-sync` gives no diff |
| Hard rules | pass: generated code untouched by hand; no audio in git; `.cache/` gitignored; English names. Rules 4–6 are untouched (the only web change is the bar helper) |
| Tests | pass: ingest, rhythm and tonality on synthesised audio, as the spec lists; `theory/` 100%; tempo ramp, empty chroma, silence, too long and non-audio covered |
| Exit criteria | 6 of 9 met: determinism, cache (but see blocking 1), synthesised tests, web loads both versions, `/schema-sync`, checks. Waiting for the golden audio: the ADR 0009 half of criterion 1, a real-song run (criterion 2) and the golden-eval report |
| Pipeline | ruff, format and pyright clean; 313 tests in 44 s (`-m "not slow"`); coverage 98% |
| Web | typecheck, lint and 715 tests pass; `check-tokens.mjs` passes |

## Suggestions

1. **`--created-at 2026-11-14` passes the CLI's check** (`cli.py:69-73`, `fromisoformat`
   accepts a bare date). It then fails schema validation only after the full analysis, with
   exit 1. Require a time, or normalise the value, before running.
2. **The "unstable tempo" flag goes nowhere.** `Rhythm.stable` (`rhythm/types.py:24`) isn't in
   the Song, the JSON log or anything the golden eval reads. Add it, and the tracker's name, to
   the rhythm log line, so a golden report can show it.
3. **`ingest/decode.py` is at 85%:** a failing ffmpeg run, an unreadable or too-old version, a
   bad ffprobe JSON, a decode failure and an empty stream (lines 57-63, 93-94, 121-125) aren't
   tested. A fake executable in `tmp_path` via `ISAI_FFMPEG` would cover them.
4. **A weak chroma test:** `test_weights_the_chroma_by_beat_or_by_frame` checks only that the
   top three bins are diatonic (`tests/tonality/test_tonality.py:49`). Assert that C, E and G
   lead.
5. **Loose types:** `Tonality.mode: str` (`tonality/__init__.py:29`) should be `KeyMode`;
   `SourceType = str` (`assemble.py:14`) adds nothing; `ExitCode.INPUT_MISSING` also covers
   bad arguments, so `USAGE` would be a clearer name.
