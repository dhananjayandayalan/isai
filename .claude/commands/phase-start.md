---
description: Plan and build one spec phase end-to-end, iterating until all checks pass
argument-hint: <phase-id, e.g. P2> [track: pipeline|web|both]
---

Build phase **$ARGUMENTS** of Isai.

1. **Load context.** Read `CLAUDE.md`, the spec chunks for this phase in `docs/spec/`
   (match on the `phase:` frontmatter), and every accepted ADR in `docs/adr/`. Read
   `schema/song.schema.json` if the phase touches the contract.
2. **Plan.** Write a short plan to `docs/spec/plans/<phase-id>.md`: goals, files to create
   or change, tests to add, and the exit criteria copied from the spec. Then present it and
   **wait for my approval** before writing code. If the phase needs a schema change, a new
   ADR, or work from a later phase, say so in the plan.
3. **Build.** After approval, implement in small commits. Write tests alongside the code.
   If a track was given, stay inside it (`pipeline/` or `web/`).
4. **Iterate.** Run lint, type check and tests for every package you touched and keep fixing
   until they pass. If pipeline behaviour changed, follow the `/golden-eval` steps and
   include the report.
5. **Finish.** Tick the exit criteria in the plan file and give me a short summary: what
   was built, test and eval results, and anything that slipped to a later phase.

Do not ask for confirmation between steps 3 and 5 unless you hit a stop condition from
`CLAUDE.md`.
