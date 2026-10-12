---
description: Review the current branch against the phase plan, ADRs and definition of done
argument-hint: <phase-id> [base branch, default main]
---

Review the work for phase **$ARGUMENTS** as a strict reviewer. Do not fix anything yet.

1. Get the diff: `git diff <base>...HEAD` (base defaults to `main`) and the commit list.
2. Read `CLAUDE.md`, `docs/spec/plans/<phase-id>.md`, and the ADRs the diff touches.
3. Check each of these and record pass / fail with file:line evidence:
   - **Phase gate:** every change belongs to this phase; nothing from a later phase.
   - **ADR compliance:** no change contradicts an accepted ADR.
   - **Hard rules:** schema-first, generated code untouched by hand, MIDI only via
     `MidiInput`, no per-note React re-renders, audio clock as master clock, rule-based
     arranger, no audio committed, naming convention.
   - **Tests:** new logic in `theory/` and `arrange/` is covered; edge cases (empty song,
     single note, tempo change, out-of-range notes for the keyboard) are tested.
   - **Code quality:** dead code, unclear names, missing types, swallowed errors.
   - **Exit criteria:** each criterion in the plan is actually met.
4. Run the full checks (lint, type check, tests) for touched packages and report results.
5. Write the review to `reports/review-<phase-id>.md`: a verdict (ready / needs work),
   blocking issues first, then suggestions. Then ask whether to fix the blocking issues.
