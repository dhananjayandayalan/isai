---
id: adr-0012
title: Melody pitch tracking with torchcrepe, decoded without dither
status: proposed
date: 2026-11-14
phase: P4
supersedes: null
---

# 0012 — Melody pitch tracking with torchcrepe, decoded without dither

## Context

Full-mix and a-cappella songs get their right hand from a pitch track: f0 and voicing every
10 ms, cut into notes by Isai's segmentation. The same tracker reads the bass stem for P5.
Film-song vocals carry vibrato and gamaka-like slides, and separated stems carry bleed, so
voicing confidence matters as much as pitch. The output must be repeatable. No golden
a-cappella songs with reference MIDI exist yet.

## Options considered

1. **torchcrepe "full"** (MIT, weights inside the package). Robust on noisy, separated
   vocals; gives periodicity as a voicing confidence; GPU or CPU.
2. **RMVPE.** Built for vocals in polyphonic music and often more accurate than CREPE on
   stems, but there's no package: its model code would be vendored, and its weights come
   from the RVC project.
3. **pYIN** (librosa). No model and no new dependency, but weaker on stems with bleed, and
   slow on long songs.

## Decision

Option 1 behind the `PitchTracker` protocol, with pYIN kept as a baseline that needs no
torch.

torchcrepe's decoders add random triangular dither of ±20 cents, drawn from numpy's
global random state, to hide the 20-cent bin grid. That made two CPU runs differ on 240
of 300 frames, and it blurs the tuning measurement that segmentation and `tonicHz`
depend on. Isai decodes with the Viterbi path refined by a local weighted average of the
bins around it (CREPE's original method) and no dither. The tracker version is `full-2`.

When golden songs exist, a spike compares torchcrepe, RMVPE and pYIN on melody onset F1
and raw pitch accuracy. RMVPE is adopted only with a clear win, of at least 0.05 onset F1.

## Consequences

- A synthesised line 25 cents flat is transcribed note for note, with the tuning measured
  within 8 cents.
- A real 2:39 vocal stem gives 421 notes at 0.86 confidence in 8.6 s on the GPU, and the
  bass stem gives 188 notes in 7.9 s.
- Output is byte-identical run to run on CPU and on GPU, and matched between the two on
  the test songs.
- Gamakas are quantised to the nearest held semitone (a stability window); Carnatic
  handling is P10's job.
