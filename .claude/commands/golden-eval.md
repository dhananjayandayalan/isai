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
3. For each song run `uv run --directory pipeline isai analyse <audio> --type <type> --out .cache/golden/<id> --log-json`
   (`<type>` from the manifest entry; `carnatic` songs are skipped until P10). Keep the
   JSON-line stage timings for the runtime column.
4. Score each song:
   - **Key/tonic:** exact match, or relative/parallel key (partial credit).
   - **Tempo:** within 2% (also accept half or double tempo, flagged).
   - **Chords:** WCSR (weighted chord symbol recall) against the `.lab` reference, twice:
     root plus major/minor (target ≥ 0.65 on full-mix songs) and full quality.
   - **Arrangement (every song with notes from the arranger):** the constraint-violation
     count from `isai.arrange.constraints.check` (must be 0), and a row per song for the
     owner's playability checklist (melody recognisable, left hand fits the chords, no
     awkward jumps), left blank for the owner to fill in.
   - **Notes (piano-solo):** onset F1 against the reference MIDI, 50 ms tolerance, plus
     onset+offset F1 (offset within 20% of the note or 50 ms) and velocity correlation.
     Target onset F1 ≥ 0.85.
   - **Melody (a-cappella and full-mix, when the entry has a `midi` reference of the
     melody):** onset F1 at 50 ms, and raw pitch accuracy (share of voiced reference
     frames whose transcribed pitch is within 50 cents). Targets: onset F1 ≥ 0.60 for
     a-cappella, ≥ 0.50 for full-mix vocal stems.
   - **tonicHz (a-cappella with `expected.tonic_hz`):** the error in cents.
   - **Runtime:** seconds per song and per stage (from the `--log-json` lines), and the
     device. Run with `--device cuda` on the owner's machine; the spec's targets for a
     4-minute full mix are ≤ 3 minutes on GPU and ≤ 20 minutes on CPU.
5. Compare with the latest previous report in `reports/golden-*.md` and flag any metric that
   got worse by more than 2 points.
6. Write `reports/golden-<YYYY-MM-DD-HHmm>.md` with a summary table, regressions first,
   then per-song details. Print the summary table and regressions here.

Do not change pipeline code in this command. If something regressed, say which commit or
module is the likely cause and stop.
