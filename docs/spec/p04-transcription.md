---
id: spec-p04-transcription
phase: P4
title: Transcription — stems, piano notes, melody
status: draft
track: pipeline
depends_on: [spec-p03-analysis-core]
---

# P4 — Transcription

## Goal

The pipeline produces notes:
- **piano-solo:** the transcribed piano part, split into hands, ready to practise.
- **full-mix:** separated stems, the vocal melody as notes, and the bass line.
- **a-cappella:** the sung melody as notes, with the singer's tonic in Hz.

Piano-solo Songs are practisable end to end after this phase. Full-mix and a-cappella
Songs have a right-hand melody; their left hand comes in P5.

## Scope

### Separation — `isai/separate/`
- A `Separator` protocol. Implementation: Demucs (`htdemucs`; the spike may compare
  `htdemucs_ft` for quality against runtime). Four stems: vocals, drums, bass, other.
- Runs only for `full-mix`. Deterministic settings (`shifts=0`, fixed overlap, fixed
  seed). GPU when available; CPU fallback with a progress log.
- Stems stay in the stage cache and never reach the Song or the output folder unless
  `--keep-stems` is given locally (the worker never passes it; rule 8).

### Piano transcription — `isai/transcribe/piano.py`
- A `PianoTranscriber` protocol returning notes (onset, offset, pitch, velocity) and
  sustain-pedal spans.
- Spike in `pipeline/spikes/piano/`: compare a high-resolution piano model (e.g. the
  ByteDance/Kong piano transcription model), Onsets and Frames and Basic Pitch on the
  piano-solo golden songs. Measure onset F1 (50 ms), onset+offset F1, velocity
  correlation and runtime. Adopt the winner through an ADR.
- Post-processing (pure, tested): extend offsets under the sustain pedal and cap them at
  the next onset of the same key; drop notes shorter than 30 ms; clamp velocity to 1–127;
  remove duplicates.

### Melody — `isai/transcribe/melody.py`
- A `PitchTracker` protocol returning f0 (Hz) and voicing confidence per 10 ms frame.
  Spike: compare CREPE-family (torchcrepe), RMVPE and pYIN on the a-cappella golden
  songs and the vocal stems of the full-mix songs. Adopt through an ADR.
- **Note segmentation** (pure, `transcribe/segment.py`, ≥ 90% coverage):
  - Voicing threshold with hysteresis; median filter.
  - Convert to cents relative to the song's tuning (from P3, refined here from the f0
    histogram).
  - Quantise to semitones with a stability window, so vibrato and slides don't split
    notes.
  - Minimum note length 80 ms; merge same-pitch notes across gaps under 60 ms.
  - Velocity from frame RMS.
- **Bass line** (full-mix): the same tracker and segmentation on the bass stem, stored as
  a pipeline artifact for P5's left hand. Not written to the Song in P4.

### Tonality refinement
- Key finding combines chroma (P3) with a duration-weighted pitch-class histogram of the
  transcribed notes. The weighting is decided by golden-eval results.
- `tonicHz` for a-cappella: the tonic pitch class's mean frequency in the singer's octave,
  from the f0 histogram.

### Hand assignment — `isai/arrange/hands.py`
P4 needs it so piano-solo Songs are valid and practisable. It's rule-based, deterministic
and in `arrange/` (rule 7, ≥ 90% coverage).
- Start with a split point at middle C, then move it per beat to follow the music: keep
  each hand's notes within a 10th, never cross the hands within one onset group, and
  smooth the split over time (a cost-minimising pass over beats).
- Melody-only Songs: every note goes to the right hand.
- Tests: scales crossing middle C, wide left-hand arpeggios, chords spanning the split,
  hand crossings, an empty input.

### Output
- `notes[]` filled with `source: "transcribed"`. The MIDI file gets a track per hand.
- Optional `meta.confidence.notes` (schema change below).

### Golden eval
- `/golden-eval` gains a melody score for a-cappella and full-mix songs that have a
  reference MIDI: onset F1 at 50 ms, plus raw pitch accuracy (within 50 cents). This
  updates `.claude/commands/golden-eval.md` and the manifest README.
- **Initial targets:** piano onset F1 ≥ 0.85; melody onset F1 ≥ 0.60 for a-cappella and
  ≥ 0.50 for vocal stems. A 4-minute full mix analysed in ≤ 3 minutes on the owner's GPU
  and ≤ 20 minutes on CPU. Measured and reported, not just asserted.

## Needs owner approval before building

- **Dependencies:** `torch`/`torchaudio` (if not already approved in P3), `demucs`, the
  chosen piano transcription and pitch-tracking packages, and their model weights
  (hundreds of MB, cached outside git).
- **New ADRs** (one, or one per model): separation, piano transcription and pitch
  tracking, each with measurements, licences for code and weights, and GPU/CPU runtime.
- **Schema change:** optional `meta.confidence.notes` (a minor version bump under the
  P3 policy).
- **A GPU environment** for the owner's machine (CUDA version, driver), documented in
  `pipeline/README.md`.

## Out of scope

Chords and the full arranger, including the left hand for melody-only songs (P5).
Simplifying piano transcriptions for learners (P5). Drum transcription. Lyrics. Carnatic
gamaka handling (P10). The worker (P8).

## Exit criteria

- [ ] Model ADRs accepted; dependencies and schema change approved
- [ ] piano-solo: a real recording becomes a two-hand Song that plays and trains correctly in the web app (owner, by ear and by hand)
- [ ] full-mix and a-cappella: a right-hand melody Song plays in the web app; a-cappella has `tonicHz`
- [ ] Segmentation, hand assignment and post-processing are unit-tested on synthetic inputs; `arrange/` and `theory/` ≥ 90%
- [ ] Determinism test passes on CPU (and on GPU, or the GPU difference is documented and rounded away)
- [ ] No stems or audio written outside `.cache/` unless `--keep-stems` is passed (test)
- [ ] `/golden-eval` report committed with the new note and melody metrics; no regressions in key or tempo, or explained
- [ ] Runtime per stage reported for CPU and GPU in the plan
- [ ] Pipeline ruff, pyright and pytest pass
