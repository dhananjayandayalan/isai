# Golden set

A small set of reference songs with known answers. `/golden-eval` runs the pipeline on each
one and scores key/tonic, tempo, chords and (for piano solo) notes, then writes a report to
`reports/golden-<date>.md` and flags regressions against the previous report.

## Audio stays on your machine

Song audio is never committed or uploaded (CLAUDE.md rule 8). Audio file types are
gitignored. Keep the files anywhere outside git, for example `~/isai-golden/`, and point
`audio:` in `manifest.yaml` at them. Songs with missing audio are skipped and listed in the
report, so friends can run the eval with whatever subset they have.

## Adding a song

1. Pick a song that tests something specific (a path type, a tricky key, a tempo change)
   and write that down in `notes:`.
2. Add an entry to `manifest.yaml` with a new kebab-case `id`, the `type`, and the local
   `audio` path.
3. Fill in `expected`: `key` and `mode` from a trusted source (sheet music, a musician
   friend), and `bpm` by tapping along or from the score. For a-cappella and carnatic songs
   add `tonic_hz` if you know the shruti; for carnatic add the `raga`.
4. Optional references, stored in this folder (they are text/MIDI, not audio):
   - `chords_lab`: a `.lab` file with one chord per line, `start end label` in seconds,
     Harte-style labels (`G:maj`, `A:min7`, `N` for no chord).
   - `midi`: a reference MIDI: the piano part for piano-solo (note F1), or the sung
     melody on one track for a-cappella and full-mix (melody F1 and pitch accuracy).
     A melody MIDI can be tapped in on a keyboard against the recording, or exported
     from a transcription you've corrected by ear.
   - `beats`: a `.beats` file, one beat per line, `time position-in-bar` (1 marks a
     downbeat), for beat and downbeat F-measure. Tapping along in Sonic Visualiser or
     Audacity and exporting the labels is enough. Add `expected.beats_per_bar` (3 or 4)
     too if you know it.
5. Run `/golden-eval <id>` to score just that song and check the entry works.

## Current entries

The three entries are placeholders (one each for piano-solo, full-mix and a-cappella)
until the owner adds real audio after P0. Replace every `TODO` before running the eval.
