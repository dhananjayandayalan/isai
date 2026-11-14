---
id: adr-0008
title: Song schema evolution policy
status: proposed
date: 2026-11-14
phase: P3
supersedes: null
---

# 0008 — Song schema evolution policy

Builds on [ADR 0002](0002-song-json-contract.md) (the schema is the contract).

## Context

`schemaVersion` is a `const` (`"0.1.0"`), so any change to the schema makes every stored
Song invalid. P3 makes the first change: an optional `tempo.downbeats`. Songs are kept
(locally now, in Supabase from P8), and the audio they came from is deleted after
analysis (rule 8). An old Song can't be re-analysed; it can only be read as it is or have
its JSON transformed.

## Options considered

1. **One version, always latest.** Re-validate everything against the newest schema.
   Simple, but the first required field or rename breaks every stored Song, and nothing
   records which shape a file has.
2. **Semantic versions with a supported list and JSON migrations.** Optional, additive
   fields bump the minor version; breaking changes bump the major and ship a pure JSON
   migration on both sides. Readers accept a list of versions.
3. **Re-analyse on change.** Not possible: the audio is gone (rule 8).

## Decision

Option 2.

- **`schemaVersion`** becomes an `enum` of every supported version, newest last. The
  pipeline always writes the newest. The web and the pipeline both read every version in
  the list.
- **Minor bump** (`0.1.0` → `0.2.0`) for additive, optional fields. An older Song is
  valid as it is, and readers treat a missing field as absent (no defaults are written
  into the file).
- **Major bump** for anything that changes or removes a field, or adds a required one.
  It ships `web/src/song/migrate.ts` and `pipeline/src/isai/migrate.py`: pure functions
  that lift a document one version at a time. Both are tested against frozen fixtures of
  every past version in `schema/examples/versions/`.
- **Dropping a version** from the supported list is its own change, after the stored
  Songs have been migrated (P8 adds a server-side migration job for that).
- **Examples:** `schema/examples/` holds Songs at the newest version. Each released
  version keeps one frozen example under `schema/examples/versions/<version>/`, and both
  sides' tests load every one.
- **`/schema-sync`** regenerates the types and fails if the examples don't validate.

For P3: `tempo.downbeats` (optional, seconds) is a minor bump to `0.2.0`, with `0.1.0`
still in the list. No migration is needed.

## Consequences

- Stored Songs keep loading across additive changes, and the version in a file says
  exactly what shape it has.
- Every breaking change costs a migration on both sides plus fixtures. That cost is
  meant to push towards additive changes.
- The generated types describe the newest version; code that reads an older Song must
  allow for missing optional fields (it already must, since they are optional).
