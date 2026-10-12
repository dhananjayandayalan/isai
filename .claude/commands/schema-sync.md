---
description: Validate the Song schema and regenerate TypeScript and Python types from it
argument-hint: [short note on what changed in the schema]
---

Sync the Song contract after a schema change. Change note: **$ARGUMENTS**

1. Validate `schema/song.schema.json` as JSON Schema (draft 2020-12). Stop and report if
   it is invalid.
2. Show `git diff schema/song.schema.json` and classify the change as **additive** (new
   optional fields) or **breaking** (removed or renamed fields, new required fields, changed
   types). For a breaking change, bump `schemaVersion` in the schema and say so.
3. Regenerate code:
   - `pnpm --dir web gen:types` -> `web/src/generated/`
   - `uv run --directory pipeline gen-models` -> `pipeline/src/isai/generated/`
4. Validate every fixture in `schema/examples/*.json` against the schema. Fix fixtures that
   fail because of this change; report any other failures.
5. Run type checks in both packages (`pnpm --dir web typecheck`,
   `uv run --directory pipeline pyright`) and fix code that broke because of the change.
6. Summarise: change type, version bump, files regenerated, and code you had to update.
   Commit as `chore(schema): <change note>`.
