---
id: adr-0002
title: Song JSON is a schema-first contract with generated types
status: accepted
date: 2026-10-13
phase: P0
supersedes: null
---

# 0002 — Song JSON is a schema-first contract with generated types

## Context

The Python pipeline produces a song analysis (tempo, key, chords, notes, sections) and the
TypeScript web app consumes it. The two are built in parallel, often in separate sessions,
and later by a queue worker whose output is stored and loaded long after it was written.
If either side defines the shape on its own, they drift and break silently.

## Options considered

1. **Pydantic models as the source, export JSON Schema for the web.** Natural for Python,
   but the web becomes a second-class consumer and contract changes hide inside pipeline
   code reviews.
2. **TypeScript types as the source.** Same problem in the other direction, and Python has
   no good TS-to-Pydantic path.
3. **A hand-written JSON Schema (draft 2020-12) as the source; generate both sides.**
   Language-neutral, reviewable on its own, validates stored files at load time.
4. **Protobuf / another IDL.** Strong tooling, but binary-first, heavier toolchain, and
   awkward for a JSON file the web loads directly.

## Decision

Use option 3. `schema/song.schema.json` is the single source of truth.

- TypeScript types are generated into `web/src/generated/` with `json-schema-to-typescript`
  (`pnpm --dir web gen:types`).
- Pydantic v2 models are generated into `pipeline/src/isai/generated/` with
  `datamodel-code-generator` (`uv run --directory pipeline gen-models`).
- Generated code is never edited by hand. `/schema-sync` regenerates both.
- Every object is strict (`additionalProperties: false`). `schemaVersion` is a `const`;
  breaking changes bump it.
- Both sides validate at their boundary: the pipeline before writing, the web when loading.
- Constraints JSON Schema cannot express (such as `end > start`) are enforced in pipeline
  code.

## Consequences

- A schema change is always a separate, visible step that touches both packages.
- Strictness means adding a field requires a schema change first, even for experiments.
- Two code generators to keep in step; `$defs` carry a `title` so both name types the same.
- Old stored Song files can be detected by `schemaVersion` and rejected or migrated.
