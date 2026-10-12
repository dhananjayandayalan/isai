---
id: spec-p0-foundation
phase: P0
title: Foundation — repo, contract, tooling
status: ready
depends_on: []
---

# P0 — Foundation

## Goal

A working skeleton where every command in `CLAUDE.md` and `.claude/commands/` runs
successfully, even though there is no real audio processing or piano yet. After P0, the
pipeline and web tracks can be built in parallel without touching each other.

## Scope

### Repo
- `git init` with a `.gitignore` covering: audio files (`*.mp3 *.wav *.flac *.m4a *.aac
  *.ogg *.opus`), `.env` and `.env.*` (except `.env.example`), `.cache/`, `node_modules/`,
  `.venv/`, `dist/`, `__pycache__/`, model weights (`*.pt *.ckpt *.onnx *.th`).
- `.env.example` with placeholders for `SUPABASE_URL` and `SUPABASE_ANON_KEY` (unused in P0).
- Root `README.md`: what Isai is, prerequisites, and how to run both packages.
- Folder layout exactly as in `CLAUDE.md`, with empty modules holding an `__init__.py` or
  `index.ts` so imports resolve.

### Song contract — `schema/song.schema.json`
JSON Schema draft 2020-12, `schemaVersion: "0.1.0"`. Fields:
- `schemaVersion`, `id`, `title`, `sourceType` (`piano-solo | full-mix | a-cappella | carnatic`)
- `durationSec`, `tempo` { `bpm`, `beats`: number[] seconds }, `timeSignature` { `num`, `den` }
- `tonality` { `key` (e.g. `"G"`), `mode` (`major | minor | modal`), `tonicHz` (optional),
  `scale`: pitch classes 0–11, `raga` (optional string) }
- `chords`: [{ `start`, `end`, `root` (pitch class), `quality`, `bass` (optional), `label` }]
- `notes`: [{ `start`, `end`, `midi` (0–127), `velocity` (0–127), `hand` (`left | right`),
  `source` (`transcribed | arranged`) }]
- `sections` (optional): [{ `start`, `end`, `label` }]
- `meta`: { `pipelineVersion`, `createdAt`, `confidence` { `key`, `tempo`, `chords` } }

Plus `schema/examples/`: two hand-written valid songs (a short major-key piece with both
hands, and a minimal a-cappella piece with melody only) and one deliberately invalid file
named `invalid-*.json` used by tests.

### Pipeline — `pipeline/`
- `uv` project, Python 3.11+, package `isai`, console script `isai`.
- Dev tools: ruff, pyright, pytest, pytest-cov. Pytest marker `slow` registered.
- `gen-models` script: generates Pydantic v2 models from the schema into
  `src/isai/generated/` (use `datamodel-code-generator`).
- `isai analyse <file> --out <dir>`: in P0 a **stub** that validates the input file exists
  and writes a placeholder Song JSON (copied from a schema example, with the given title)
  that passes validation. No audio libraries yet.
- `theory/` first real code: pitch class ↔ note name (sharps and flats), MIDI ↔ note name
  with octave, scale from tonic + mode. Fully unit-tested.
- Tests: schema examples validate (and the invalid one fails), CLI stub produces a valid file,
  theory tests.

### Web — `web/`
- Vite + React + TypeScript (strict), pnpm, Vitest, ESLint (flat config).
- Scripts: `dev`, `build`, `test`, `lint`, `typecheck`, `gen:types`
  (`json-schema-to-typescript` into `src/generated/`).
- `src/midi/MidiInput.ts`: the interface only — `listDevices()`, `connect(deviceId)`,
  `onNoteOn(cb)`, `onNoteOff(cb)`, `disconnect()` — plus a `FakeMidiInput` for tests.
  No WebMidi.js yet.
- A single page that loads a schema example and lists its title, key, tempo and note count.
- Tests: the example loads and type-checks against generated types; `FakeMidiInput` emits
  events.

### Golden set — `tests/golden/`
- `manifest.yaml` with the structure `/golden-eval` expects and 3 placeholder entries
  (`audio:` paths left as `TODO`), plus a `README.md` explaining how to add a song.
- The owner adds the real audio files locally after P0.

### Docs
- `docs/adr/0001-record-architecture-decisions.md` (accepted).
- `docs/adr/0002-song-json-contract.md` (accepted): schema-first contract, generated types.
- `docs/adr/0003-midi-behind-interface.md` (accepted): Web MIDI now, native adapters later.

## Out of scope

Audio processing, model downloads, WebMidi.js, sound, piano rendering, Supabase, deployment.

## Exit criteria

- [ ] `uv sync`, `uv run pytest`, `uv run ruff check .`, `uv run pyright` all pass in `pipeline/`
- [ ] `pnpm install`, `pnpm test --run`, `pnpm lint`, `pnpm typecheck`, `pnpm build` all pass in `web/`
- [ ] `/schema-sync` regenerates both type sets with no diff on a clean tree
- [ ] `uv run isai analyse README.md --out .cache/p0` writes a Song JSON that validates
- [ ] `pnpm dev` page shows the example song's title, key, tempo and note count
- [ ] `theory/` coverage ≥ 90%
- [ ] Three ADRs present and accepted; golden manifest present
- [ ] Everything committed in small conventional commits
