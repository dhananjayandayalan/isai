# Review — P0 Foundation

- **Branch:** `p0-foundation` vs `main` (10 commits, 64 files, +5853 / −9)
- **Reviewed:** 2026-10-13
- **Inputs:** `CLAUDE.md`, `docs/spec/p0-foundation.md`, `docs/spec/plans/P0.md`, ADRs 0001–0003

## Verdict: ready (after fixes)

The first pass found two blocking issues: `.env.example` was missing, and ADR 0002 promised
timing checks that didn't exist. Both are now fixed, along with suggestions 1 and 10. The
original findings stay below for the record.

### Resolution

| Item | Fix | Commit |
|---|---|---|
| Blocking #1 `.env.example` | Added by the owner (the deny rule beats the allow rule, so Claude can't write it). | `cfdb289` |
| Blocking #2 timing rules | `validate_song` now also runs `time_errors()`: notes, chords and sections must end after they start and within `durationSec`; beats must lie within `durationSec`. 14 new tests. | `1f5f656` |
| Suggestion 1 MIDI lint gap | `no-restricted-syntax` flags any `.requestMIDIAccess` / `['requestMIDIAccess']` access and its destructuring; `webmidi/*` imports are blocked. Probed 7 bypass forms: all flagged; `src/midi/` still allowed. | `097ca19` |
| Suggestion 10 empty song | Pipeline: empty and single-note songs validate. Web: an empty song parses and the page shows 0 notes. | `1f5f656`, `941877d` |

Checks after the fixes: pipeline ruff and pyright clean, 112 tests pass, `schema.py` 99%,
`theory/` 100%. Web lint, typecheck and build pass, 17 tests pass. Token check passes.
Suggestions 2–9 and 11–13 are still open and none block P0.

## Blocking

1. ~~**`.env.example` is missing (spec scope not met).**~~ **Resolved:** the owner added it
   (committed separately).
   The spec asks for it (`docs/spec/p0-foundation.md:23`) and so does the plan
   (`docs/spec/plans/P0.md:52`, commit 1 at `:103`). It was not created because the
   `Read(./.env.*)` deny rule in `.claude/settings.json` also matches `.env.example`. The
   exit criteria were ticked with a caveat (`P0.md:125`); strictly, P0 is not complete.
   *Fix:* the owner either allows `Read(./.env.example)` in `.claude/settings.json` or
   creates the file by hand. It holds two empty keys, `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

2. **ADR 0002 claims a guarantee the pipeline doesn't enforce.**
   `docs/adr/0002-song-json-contract.md:43` says constraints JSON Schema can't express
   (`end > start`) "are enforced in pipeline code", and `:42` says the pipeline validates
   before writing. `validate_song` (`pipeline/src/isai/schema.py:74`) only checks the
   schema. A probe showed it accepts a note with `start: 5, end: 0` in a song with
   `durationSec: 1`. The plan deferred this ("enforces it in code later", `P0.md:35`), but
   the accepted ADR states it in the present tense, and ADRs are binding (hard rule 3).
   *Fix (either):* (a) add a small invariant check to `validate_song`: `end >= start` for
   notes, chords and sections, and times within `durationSec`; plus tests. Or (b) reword
   ADR 0002 to say the check arrives when the pipeline first generates notes. (a) is about
   20 lines and keeps the ADR honest.

## Checks

| Area | Result | Evidence |
|---|---|---|
| Phase gate | **pass** | Only P0 scope. `web/src/{audio,piano,engine,theory}` are empty `export {}` stubs. No WebMidi.js, Tone.js, Supabase or audio libraries. The design-system wiring (`web/src/main.tsx:1-2`, `web/vite.config.ts:8`) follows `design/system/STYLE_GUIDE.md` §2, which was already on `main`. |
| ADR 0001 | pass | ADRs in `docs/adr/NNNN-*.md` with the required frontmatter and sections. |
| ADR 0002 | **partial** | Schema-first and generated types: pass. Both sides validate (`schema.py:74`, `web/src/song.ts:35`). Enforcing `end > start`: was not done (blocking #2); **fixed** in `1f5f656`. |
| ADR 0003 | pass | `web/src/midi/MidiInput.ts` matches the ADR's interface. `FakeMidiInput` implements it. |
| Rule 1 schema-first, generated untouched | pass | Regenerating both type sets gives 0 changed files. The guard hook blocks edits to `generated/`. |
| Rule 4 MIDI via `MidiInput` | pass (gap fixed in `097ca19`) | No `requestMIDIAccess`/`webmidi` outside `src/midi/`. ESLint enforces it (`web/eslint.config.js:26,33`), but see suggestion 1. |
| Rule 5 no per-note re-render | n/a | No note rendering yet. |
| Rule 6 audio clock | pass | No `Date.now`/`setTimeout`/`setInterval`/`performance.now` in `web/src`. `MidiNoteEvent.time` is documented as audio-clock seconds (`MidiInput.ts:17-21`). |
| Rule 7 rule-based arranger | n/a | `arrange/` is empty. |
| Rule 8 no audio in git | pass | No audio or weight files tracked. `.gitignore` covers them. The guard hook blocks audio writes. |
| Rule 9 naming | pass | `isai`, `gen-models`, `analyse`, module names: English or Tamil only. |
| Theory tests | pass | `theory/` 100% line coverage (58 statements). Covers enharmonics (B#, Cb, Fb, E#), double accidentals, unicode ♯/♭, MIDI 0/127 bounds and round trips over every MIDI note. |
| Edge-case tests | **partial** | MIDI out of range (130): tested on both sides. Empty song (`notes: []`, `chords: []`): was not tested; **now tested** on both sides. Single note, tempo change and notes outside the keyboard range: no code to test yet (arrange/engine phases). |
| Code quality | pass with suggestions | See suggestions 2–9. |
| Line endings | pass | No CRLF in changed files. `.gitattributes` forces LF. |

## Full checks (run during this review)

| Package | Command | Result |
|---|---|---|
| pipeline | `uv run ruff check .` | pass |
| pipeline | `uv run ruff format --check .` | pass (23 files) |
| pipeline | `uv run pyright` | 0 errors, 0 warnings |
| pipeline | `uv run pytest --cov=isai` | 98 passed. Total 86%, `theory/` 100%, `cli.py` 93%, `schema.py` 98%, `gen_models.py` 0% |
| web | `pnpm lint` | pass |
| web | `pnpm typecheck` | pass |
| web | `pnpm test --run` | 15 passed |
| web | `pnpm build` | pass. JS 372.6 kB (112.4 kB gzip) |
| schema | regenerate both type sets | 0-file diff |
| design | `node design/system/check-tokens.mjs` | pass (checked during build) |

## Exit criteria

| Criterion | Met? |
|---|---|
| Pipeline `uv sync` / pytest / ruff / pyright pass | yes |
| Web install / test / lint / typecheck / build pass | yes |
| `/schema-sync` regenerates with no diff | yes |
| `isai analyse README.md --out .cache/p0` writes a valid Song | yes (and a missing input exits 2 with a clear message) |
| `pnpm dev` page shows title, key, tempo, note count | yes (headless screenshot + `App.test.tsx`) |
| `theory/` coverage ≥ 90% | yes (100%) |
| Three accepted ADRs, golden manifest present | yes |
| Everything committed in small conventional commits | yes (`.env.example` added after review) |

## Suggestions (not blocking)

1. **The MIDI lint guard can be bypassed.** `window.navigator.requestMIDIAccess()` passes
   ESLint (probe: only the `navigator.*` and destructuring forms were flagged).
   `no-restricted-properties` at `web/eslint.config.js:26` only matches the object
   `navigator`. Add a `no-restricted-syntax` rule on any member access whose property is
   `requestMIDIAccess`. Also restrict `webmidi/*` subpaths (`:33` matches the bare name only).
2. **ajv compiles validators at runtime with generated code.** `web/src/song.ts:24` needs
   `unsafe-eval` under a strict CSP, which a Tauri build will have, and it accounts for most
   of the 372 kB bundle. Before the native shell arrives, consider ajv's standalone mode
   (precompile the validator during `gen:types`).
3. **The version is defined twice:** `pipeline/pyproject.toml:3` and
   `pipeline/src/isai/__init__.py:3`. Read it with `importlib.metadata.version("isai")`.
4. **`cli.py:64` treats "schema not found" like "input not found".** Both raise
   `FileNotFoundError` and exit 2, so a broken install looks like a user mistake. The
   `SongValidationError` path (`cli.py:67-69`) is also untested.
5. **`test_console_script_runs` (`pipeline/tests/test_cli.py:52`) doesn't test the console
   script.** It runs `python -m isai.cli`, not the `isai` entry point. Rename it, or call
   `uv run isai` / the venv script.
6. **`gen_models.py` has 0% coverage.** It is exercised by `/schema-sync`, but a unit test
   of `build_command` (flags present, output path) would catch accidental flag changes.
7. **The theory and schema use different meanings of "mode".** `theory.scales.Mode` (11
   values, `scales.py:9`) and the schema's `tonality.mode` (`major|minor|modal`,
   `schema/song.schema.json:101`) share a name. Rename the theory one (e.g. `ScaleMode`)
   before the tonality phase connects them.
8. **Small inefficiency and caching quirk in `schema.py`.** `_validator()` (`:63`) builds a
   new validator on every call. `load_schema` is `@cache`d (`:57`), so a later change to
   `ISAI_SCHEMA_DIR` is ignored. Cache the validator, and clear both caches in the env
   override test.
9. **Not all config is type-checked or linted.** `web/tsconfig.node.json:19` doesn't
   type-check `scripts/gen-types.mjs` or `eslint.config.js`. JS files get globals but no
   rules (`eslint.config.js:10,42`).
10. **No empty-song test.** Add one for a song with `notes: []` and `chords: []` to
    `song.test.ts` and `test_schema.py`. The schema allows it, and the UI will need an
    empty state for melody-free or failed analyses.
11. **The error state has no next step.** `web/src/App.tsx:60-66` says what went wrong but
    gives no action (STYLE_GUIDE §1.7, §7). That's acceptable while the page loads a
    bundled example; it needs one once songs come from the worker.
12. **Generated `RootModel` wrappers** (`Beat`, `ScaleItem`) are already recorded in
    `P0.md`. Revisit when pipeline code first builds Songs.
13. **Outside the diff:** `.idea/workspace.xml` is tracked on `main`. It's personal IDE
    state; consider untracking it.
