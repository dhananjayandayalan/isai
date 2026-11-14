# Isai spec

The phased build plan for Isai, from architecture to deployment. Each phase is one
markdown file with frontmatter. `/phase-start <id>` reads the files whose `phase:` matches,
plus [`00-architecture.md`](00-architecture.md), and writes a plan to `plans/<id>.md`.

Scaling beyond the current group of friends is covered separately in
[`docs/reference/`](../reference/README.md). Those docs are reference material, not phases.
Nothing in them is built until a phase spec asks for it (CLAUDE.md rule 2).

## Phases

| Phase | File | Track | Goal | Depends on | Status |
|---|---|---|---|---|---|
| ARCH | [00-architecture.md](00-architecture.md) | all | System architecture: components, data flow, timing, storage, environments | — | draft |
| P0 | [p00-foundation.md](p00-foundation.md) | both | Repo, Song contract, tooling, skeletons | — | done |
| P1 | [p01-playback.md](p01-playback.md) | web | Hear and see a Song on a sampled piano; MIDI input | P0 | in-review |
| P2 | [p02-training.md](p02-training.md) | web | Training mode: playback waits for the right notes | P1 | in-review |
| P3 | [p03-analysis-core.md](p03-analysis-core.md) | pipeline | Ingest, tempo and beats, key and scale from real audio | P0 | draft |
| P4 | [p04-transcription.md](p04-transcription.md) | pipeline | Stem separation, piano transcription, melody tracking | P3 | draft |
| P5 | [p05-harmony-arranger.md](p05-harmony-arranger.md) | pipeline | Chords and the rule-based two-hand arranger | P4 | draft |
| P6 | [p06-performance.md](p06-performance.md) | web | Performance mode, scoring, results, latency calibration | P2 | in-review |
| P7 | [p07-notation-settings.md](p07-notation-settings.md) | web | Notation systems, falling notes, staff, settings, pedal | P2 | ready |
| P8 | [p08-backend-library.md](p08-backend-library.md) | both | Accounts, upload, queue worker, library | P5, P6 | draft |
| P9 | [p09-deployment.md](p09-deployment.md) | ops | Production for the friends group: hosting, CI/CD, backups, runbooks | P7, P8 | draft |
| P10 | [p10-carnatic.md](p10-carnatic.md) | both | Carnatic path: shruti, raga, tala, raga-aware swaras | P5, P7, P9 | draft |

```
          ┌── P2 training ──┬── P6 performance ──┐
P0 ── P1 ─┘                 └── P7 notation ─────┤
  │                                              ├── P8 backend ── P9 deploy ── P10 carnatic
  └── P3 analysis core ── P4 transcription ── P5 harmony/arranger
```

The web track (P2, P6, P7) and the pipeline track (P3–P5) don't depend on each other and
can run in parallel. P8 joins them. Deployment comes before the Carnatic path so friends
can use the Western paths sooner; swap P9 and P10 if Carnatic songs matter more.

## Frontmatter

```yaml
---
id: spec-p02-training        # unique, referenced by depends_on
phase: P2                    # what /phase-start matches on
title: Training mode — playback waits for the right notes
status: draft                # see below
track: web                   # web | pipeline | both | ops | all
depends_on: [spec-p01-playback]
---
```

**Status:** `draft` (written, not approved) → `ready` (owner approved; buildable) →
`in-progress` → `in-review` (built; `/phase-review` running or blocking fixes open) →
`done`. Only a `ready` or later phase may be built.

## Every phase spec has

1. **Goal:** what a learner or the owner can do afterwards that they couldn't before.
2. **Scope:** per package, concrete enough to plan from.
3. **Needs owner approval before building:** schema changes, new ADRs, dependencies over
   ~5 MB, anything that bends a hard rule. CLAUDE.md says these are stop-and-ask items.
4. **Out of scope:** what's deliberately left for a later phase, so the phase gate is clear.
5. **Exit criteria:** checkboxes that `/phase-start` copies into the plan and
   `/phase-review` checks one by one.

The definition of done in CLAUDE.md (lint, type check, tests, 90% coverage in `theory/`
and `arrange/`, `/golden-eval` when pipeline behaviour changes) applies to every phase
and isn't repeated in each file.

## Changing a spec

- Edit the spec before the code. When a spec is `ready` or later, record the change and
  the reason in the phase's plan under "Differences from the plan".
- A spec never overrides an accepted ADR. If a spec needs something an ADR forbids, the
  spec lists a new ADR under "Needs owner approval".
- Numbers in drafts (accuracy targets, time budgets, window sizes) are starting points.
  The phase that measures them may change them, with the measurement in its plan.
