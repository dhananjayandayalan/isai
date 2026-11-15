---
id: adr-0010
title: Source separation with torchaudio's Hybrid Demucs
status: proposed
date: 2026-11-14
phase: P4
supersedes: null
---

# 0010 — Source separation with torchaudio's Hybrid Demucs

## Context

Full mixes need stems: the vocal melody for the right hand, bass and "other" for the key
and P5's chords, and the bass line for the left hand. The spec names Demucs (`htdemucs`).
The constraints:
- it runs on the owner's laptop (RTX 4050, 6 GB) and on CPU for friends;
- the pipeline is on numpy 2 and torch 2.14;
- the weights' licence must allow a public launch;
- output must be repeatable (`shifts=0`, fixed segments).

The golden audio doesn't exist yet, so this is decided on licence, dependencies and
published accuracy, and finalised with golden numbers later.

## Options considered

1. **`demucs` 4.1.0 (`htdemucs`, `htdemucs_ft`).** The reference implementation, and
   `htdemucs_ft` is the best of the family (about 9.2 dB SDR on MUSDB-HQ). But it pins
   `numpy<2` and `torch<2.3`, which would split the pipeline's environment.
2. **torchaudio's `HDEMUCS_HIGH_MUSDB_PLUS`** (Hybrid Demucs v3, trained on MUSDB-HQ
   plus 150 extra songs). Already in torchaudio, so no new package; MIT. About one
   generation behind `htdemucs` (around 8.5–9 dB SDR reported).
3. **`demucs-infer`** (an inference-only fork of Demucs 4 by openmirlab). Clean
   dependencies, but a small third-party fork to trust and maintain against.
4. **Band-split RoFormer models** (through `audio-separator`). State of the art for
   vocals, but brings onnx and many other dependencies, and weight licences vary per model.

## Decision

Option 2 now, behind the `Separator` protocol: 10 s segments with 1 s linear crossfades,
no random shifts, and stems rounded to 16-bit steps. The weights are fetched by
`isai models fetch hdemucs` and checked by SHA-256. download.pytorch.org publishes no
checksum, so the recorded hash is that of the copy fetched over HTTPS on 2026-11-14.

When the golden audio exists, a spike compares it with option 3 (`htdemucs`,
`htdemucs_ft`) on vocal-melody F1 and runtime. A switch needs a clear win, of at least
0.05 melody onset F1.

## Consequences

- No new package and no numpy pin. A 2:39 song separates in 6.8 s on the GPU; on CPU,
  25 s of audio takes 7.5 s, so about 70 s for a 4-minute song.
- CPU and GPU stems differ in the last bits, enough to flip a borderline melody note.
  Each device is repeatable on its own (README, "Determinism").
- The `separate` stage caches about 85 MB of stems per song, which is audio: the P8
  worker must clear the cache per job (rule 8).
- Vocal quality is a generation behind the best; the golden spike decides whether that
  matters for melody accuracy.
