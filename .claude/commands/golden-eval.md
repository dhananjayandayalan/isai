---
description: Run the pipeline on the golden song set and compare with expected results
argument-hint: [song id to run just one, or blank for all]
---

Run the golden evaluation for Isai. Scope: **$ARGUMENTS** (blank means all songs).

1. Read `tests/golden/manifest.yaml`. Each entry has an `id`, a local audio path (audio is
   gitignored and lives on this machine only), the path type (`piano-solo`, `full-mix`,
   `a-cappella`, `carnatic`) and expected values: key/tonic, tempo, and optionally a
   reference chord `.lab` file or MIDI.
2. Skip any song whose audio file is missing and list it in the report.
3. For each song run `uv run --directory pipeline isai analyse <audio> --out .cache/golden/<id>`.
4. Score each song:
   - **Key/tonic:** exact match, or relative/parallel key (partial credit).
   - **Tempo:** within 2% (also accept half or double tempo, flagged).
   - **Chords:** weighted chord overlap against the `.lab` reference (root + quality).
   - **Notes (piano-solo only):** onset F1 against the reference MIDI, 50 ms tolerance.
   - **Runtime:** seconds per song, and whether the GPU was used.
5. Compare with the latest previous report in `reports/golden-*.md` and flag any metric that
   got worse by more than 2 points.
6. Write `reports/golden-<YYYY-MM-DD-HHmm>.md` with a summary table, regressions first,
   then per-song details. Print the summary table and regressions here.

Do not change pipeline code in this command. If something regressed, say which commit or
module is the likely cause and stop.
