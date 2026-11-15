---
id: adr-0011
title: Piano transcription with ByteDance's high-resolution model
status: proposed
date: 2026-11-14
phase: P4
supersedes: null
---

# 0011 — Piano transcription with ByteDance's high-resolution model

## Context

Piano-solo songs become two-hand Songs directly from a transcription, so accuracy matters
most here: the spec's target is onset F1 ≥ 0.85. The output needs onsets, offsets,
velocities and the sustain pedal (offsets are extended under it). The model must run on
the laptop GPU and on CPU, fit the pipeline's numpy 2 and torch environment, and have
weights we may use publicly. No golden piano recordings with reference MIDI exist yet.

## Options considered

1. **ByteDance high-resolution piano transcription** (Kong et al. 2021) through
   `piano-transcription-inference`. Onset F1 about 0.97 on MAESTRO; regresses exact
   onset and offset times; gives velocity and pedal. Code MIT; weights CC BY 4.0
   (Zenodo 4034264), so attribution is needed. The package is old and shells out to
   `wget` for its weights.
2. **Transkun** (MIT). Comparable or better accuracy on MAESTRO (semi-CRF), but it pulls
   in tensorboard, seaborn and torch-optimizer, and has no pedal output in the same form.
3. **Basic Pitch** (Spotify, Apache 2.0). Small and instrument-agnostic, but clearly
   weaker on piano. Its package needs TensorFlow < 2.15 (and so numpy < 2); only its
   ONNX model would fit.
4. **Onsets and Frames** (Magenta). TensorFlow 1–era code; not practical here.

## Decision

Option 1 behind the `PianoTranscriber` protocol. Isai's adapter:
- builds the model from the checkpoint verified by `isai models fetch` (the md5 matches
  Zenodo's), so the package never runs `wget`;
- silences the package's printing;
- runs Isai's post-processing: blips under 30 ms dropped, double strikes merged, pedal
  extension, ends capped at the same key's next onset.

`meta.confidence.notes` is the mean onset strength at the detected notes. A spike against
Transkun runs on the golden piano songs once they exist; Transkun is adopted only with a
clear onset F1 win, of at least 0.03.

## Consequences

- Every note played in a synthesised phrase was found within 30 ms, the same on CPU and
  GPU. A real 2:39 recording took 25 s on the GPU (893 notes), and its notes moved the key
  from an unsure "C major" (0.06) to A minor (0.33).
- CPU and GPU differ by up to 10 ms on a few note ends; each device is repeatable on its
  own.
- The CC BY 4.0 weights need an attribution line in the app's credits before launch (P9).
- The package is unmaintained; Isai depends on only its model class and post-processor.
  If it breaks, vendoring those two files (MIT) is a small job.
