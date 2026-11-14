# Isai (இசை)

Isai turns a song's audio into something you can learn on piano: key, tempo, chords, and a
playable two-hand arrangement, shown on an animated piano that matches the connected MIDI
keyboard. Learners use **training mode** (playback waits for the correct notes) or
**performance mode** (same engine, no waiting, scored by timing).

Users: the owner and a small group of musician friends. Not a public product yet.

## Repo layout

```
schema/song.schema.json   # THE contract between pipeline and web. Source of truth.
pipeline/                 # Python 3.11+, uv. Audio in -> Song JSON + MIDI out.
  src/isai/
    ingest/               # ffmpeg normalize
    separate/             # stem separation (Demucs)
    rhythm/               # tempo + beat grid
    tonality/             # key, tonic, scale
    transcribe/           # piano transcription, melody pitch tracking
    harmony/              # chord recognition
    arrange/              # rule-based two-hand arranger (no LLM)
    theory/               # pure music theory, no audio deps
    worker/               # Supabase queue worker
    cli.py                # `isai analyse <file>`
  tests/
web/                      # React + TypeScript + Vite, pnpm
  src/
    midi/                 # MidiInput interface + adapters
    audio/                # Tone.js transport, sampled instruments
    piano/                # keyboard rendering (canvas/SVG)
    engine/               # playback engine, training/performance modes
    theory/               # notation rendering (letter, staff, solfege, swaras, Roman)
    generated/            # types generated from the schema. Never hand-edit.
docs/spec/                # phased spec P0–P10 + 00-architecture.md, markdown with frontmatter
docs/reference/           # scaling reference (tiers, capacity, security, ops, launch). Not a spec.
docs/adr/                 # architecture decision records, NNNN-title.md
tests/golden/             # manifest of reference songs + expected results
reports/                  # golden-eval reports (committed)
```

## Hard rules

1. **The schema is the contract.** Change `schema/song.schema.json` first, then run
   `/schema-sync`. Never edit `web/src/generated/` or `pipeline/src/isai/generated/` by hand.
2. **Phase gates.** Only build what the current phase in `docs/spec/` asks for. If something
   from a later phase seems needed, stop and say so instead of building it.
3. **ADRs are binding.** Read `docs/adr/` before architectural changes. Going against an
   accepted ADR needs a new ADR (`/adr-new`), not a quiet workaround.
4. **MIDI goes through `MidiInput`.** Nothing outside `web/src/midi/` touches
   `navigator.requestMIDIAccess` or WebMidi.js. Safari, Tauri on macOS and iOS have no Web
   MIDI; native adapters will plug in here later.
5. **No React re-render per note.** Piano animation runs on `requestAnimationFrame` with refs
   or canvas. React state is for UI, not for note-on/note-off.
6. **The audio clock is the master clock.** All timing derives from the Tone.js transport /
   `AudioContext.currentTime`, never `Date.now()` or `setTimeout`.
7. **The arranger is rules, not an LLM.** It must be deterministic and unit-tested.
8. **No song audio in git or in public storage.** Audio is gitignored. The worker deletes
   uploaded audio after processing and only keeps Song JSON and MIDI.
9. **Naming:** product, packages, modules, CLI commands and feature labels are English or
   Tamil, never Sanskrit. Musical terms stay in their native form (raga, swara, shruti, etc.).

## Commands

Pipeline (run from `pipeline/`):

- `uv sync` install
- `uv run pytest` tests; `uv run pytest -m "not slow"` skips GPU/model tests
- `uv run ruff check . && uv run ruff format --check .` lint
- `uv run pyright` type check
- `uv run isai analyse <file> --out <dir>` run the full pipeline on one song

Web (run from `web/`):

- `pnpm install`, `pnpm dev`
- `pnpm test` (Vitest), `pnpm lint`, `pnpm typecheck`

Schema:

- `pnpm --dir web gen:types` and `uv run --directory pipeline gen-models`, or just `/schema-sync`

## Definition of done (every change)

- Lint, type check and tests pass in every package you touched.
- New logic in `theory/` or `arrange/` has unit tests (target 90%+ line coverage there).
- If pipeline behaviour changed, `/golden-eval` was run and the report is in `reports/`.
- No regressions on the golden set without an explanation in the commit message.

## Working style

- When the task is clear, plan briefly, then implement and iterate until checks pass.
  Do not stop to ask for approval of routine steps.
- Stop and ask only for: schema changes, new dependencies over ~5 MB, anything that
  contradicts an ADR, or anything outside the current phase.
- Prefer small, reviewable commits with conventional messages (`feat(engine): ...`).
- When a model or library choice is uncertain, write a small spike in `pipeline/spikes/`
  and measure on the golden set before adopting it.
- End each task with: what changed, test/eval results, and anything left open.

## Where we left off (2026-11-15)

Branches are stacked and unmerged: `p3-analysis` → `p4-transcription` → `p5-arranger`
(current). P4 and P5 are built and pass their checks; their remaining exit criteria need
the owner's ears and the golden audio. Plans: `docs/spec/plans/P3.md`, `P4.md`, `P5.md`.

**Open regression, start here.** The owner's verdict on `Maayangal Saathiyam`
(full-mix, a film song with vocals): the output is "definitely not good".
- **Before** the last three code commits: the timing was off, but the keys (notes) and
  chord mapping sounded good.
- **After** them: the key and chord mapping got worse. The commits:
  - `994470c`: sung ornaments fold into the main note (8th minimum at easy and medium).
  - `9b1dcef`: Beat This! replaces librosa as the beat tracker (ADR 0009).
  - `d97a6cc`: chords and patterns sit on a gap-filled beat grid (harmony version 2),
    and the left hand re-anchors at each bar start.
- Next steps:
  - A/B the same song before and after. `--beat-tracker librosa` isolates the tracker;
    `git stash` or a worktree at `fe867f9` gives the full "before" state.
  - Find which commit hurt the notes and chords, and fix or revert it, keeping whatever
    did fix the timing.
  - "Keys" may mean the piano keys (notes), not the musical key, which stayed D minor.
- Don't judge by proxy numbers alone (drum-onset alignment, notes per second): they
  improved while the result sounded worse. Ask the owner which bars or times sound wrong,
  never for the song's tempo or key; finding those is the app's job.
- Re-run with a fresh cache; the owner clears `pipeline/.cache` and `pipeline/out`:
  `uv run isai analyse "<song.mp3>" --type full-mix --out out --level all --log-json`.
