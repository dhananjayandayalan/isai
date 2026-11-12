---
id: spec-p00-foundation
phase: P0
title: Foundation — repo, contract, tooling
status: done
track: both
depends_on: []
---

# P0 — Foundation (done)

## Goal

A working skeleton where every command in `CLAUDE.md` and `.claude/commands/` runs, with
no real audio processing or piano yet. After P0, the pipeline and web tracks can be built
in parallel without touching each other.

## Scope (as built)

### Repo
- `.gitignore` covers audio (`*.mp3 *.wav *.flac *.m4a *.aac *.ogg *.opus`), `.env*`
  except `.env.example`, `.cache/`, `node_modules/`, `.venv/`, `dist/`, `__pycache__/`
  and model weights (`*.pt *.ckpt *.onnx *.th`). `.gitattributes` keeps LF.
- `.env.example` with `SUPABASE_URL` and `SUPABASE_ANON_KEY` placeholders.
- Root `README.md`, and the folder layout from `CLAUDE.md` with empty modules.

### Song contract
- `schema/song.schema.json`, draft 2020-12, `schemaVersion: "0.1.0"`, every object
  `additionalProperties: false`. Fields: `id`, `title`, `sourceType`, `durationSec`,
  `tempo {bpm, beats}`, `timeSignature {num, den}`, `tonality {key, mode, tonicHz?, scale,
  raga?}`, `chords[]`, `notes[] {start, end, midi, velocity, hand, source}`, `sections[]?`,
  `meta {pipelineVersion, createdAt, confidence {key, tempo, chords}}`.
- `schema/examples/`: two valid Songs (two-hand major-key piece; a-cappella melody) and
  `invalid-*.json` for tests.

### Pipeline
- uv project, Python 3.11+, package `isai`, scripts `isai` and `gen-models`
  (`datamodel-code-generator` → `src/isai/generated/`).
- `isai analyse <file> --out <dir>` is a stub that writes a valid placeholder Song.
- `theory/`: pitch class ↔ name, MIDI ↔ name, scales from tonic and mode. Fully tested.
- ruff, pyright, pytest, pytest-cov; `slow` marker registered.

### Web
- Vite + React + strict TypeScript, pnpm, Vitest, ESLint flat config.
- `gen:types` (`json-schema-to-typescript` → `src/generated/`).
- `src/midi/MidiInput.ts` interface and `FakeMidiInput`.
- One page showing an example Song's title, key, tempo and note count.

### Golden set and docs
- `tests/golden/manifest.yaml` with three placeholder entries and a README.
- ADRs 0001–0003 accepted.

## Out of scope (was)

Audio processing, model downloads, Web MIDI, sound, piano rendering, Supabase, deployment.

## Exit criteria

- [x] `uv sync`, `uv run pytest`, `uv run ruff check .`, `uv run pyright` pass in `pipeline/`
- [x] `pnpm install`, `pnpm test --run`, `pnpm lint`, `pnpm typecheck`, `pnpm build` pass in `web/`
- [x] `/schema-sync` regenerates both type sets with no diff on a clean tree
- [x] `uv run isai analyse README.md --out .cache/p0` writes a Song JSON that validates
- [x] `pnpm dev` shows the example song's title, key, tempo and note count
- [x] `theory/` coverage ≥ 90%
- [x] ADRs 0001–0003 accepted; golden manifest present
- [x] Small conventional commits

## Left open

From the P0 review, still open: #9 (lint and type-check the config JS files), #11 (the
worker-era error states; now P8) and #13 (untrack `.idea/`; do it in P2's housekeeping).
