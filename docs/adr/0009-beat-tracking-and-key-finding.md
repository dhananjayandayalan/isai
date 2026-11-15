---
id: adr-0009
title: Beat tracking with Beat This!, key finding with profiles and notes
status: accepted
date: 2026-11-15
phase: P3
supersedes: null
---

# 0009 — Beat tracking with Beat This!, key finding with profiles and notes

> **The beat-tracker choice is superseded by [0014](0014-beat-tracker-back-to-librosa.md)**
> (accepted): librosa is the default again after the owner's listening test. The key
> finding below still stands.

## Context

Every timed thing Isai writes hangs off the beat grid: bars and the loop picker, the
melody's quantising, where the left-hand patterns fall, and which chord is under which
beat. A grid half a beat off makes a correct melody sound wrong. The key decides chord
spelling and the diatonic prior. P3 shipped librosa's tracker as a stopgap, with bar
starts guessed from accent strength, and left this ADR to the spike. The spike was meant
to run on the golden set. The owner's audio isn't there yet, but a real film song showed
the stopgap failing, and the owner approved the switch on 2026-11-15.

## Options considered

1. **librosa's dynamic-programming tracker** plus accent-phase bar starts. No model and
   fast, but it maximises the mix's onset envelope. On a film song it sat a median 0.16 s
   off the drum hits for much of the song, and on a synthesised drum groove it put every
   bar start one beat early.
2. **Beat This!** (Foscarin, Schlüter, Widmer, ISMIR 2024): one transformer for beats and
   downbeats, no DBN needed. Code and weights MIT. About 1 s of CPU per minute of audio.
3. **madmom RNN + DBN.** The long-time reference, but it doesn't install on Python 3.11 or
   Windows without MSVC, and its models are non-commercial: blocking for a public launch.

## Decision

**Beats: option 2**, behind `BeatTracker`, built lazily like the other models. The weights
are in the registry (checked by SHA-256, with the maintainer's mirror as a fallback,
because the official server returned HTTP 500). librosa's tracker stays as
`--beat-tracker librosa`, for machines without torch.

Chords and patterns use the beats with holes filled and the ends carried on. The Song
keeps only the detected beats.

**Key: unchanged from P3, plus P4's notes.** The Krumhansl–Kessler, Temperley and
Albrecht–Shanahan profiles are summed and correlated over 24 keys, against a
beat-weighted CQT chroma corrected for tuning. P4 blends in a duration-weighted
pitch-class histogram of the transcribed notes (half and half for now). The confidence is
the lead over the runner-up, so relative keys (D minor and F major) score low even when
the notes are right; the scale is the same.

## Consequences

- Evidence so far:
  - **Synthesised drums:** every bar start right, where librosa got none.
  - **A 3:51 film song, against the separated drum stem's onsets:** beats 5.03 against
    4.87 (mean onset strength) and bar starts 5.27 against 4.84.
  - **The film song's tempo:** both read 120 BPM, but agreed on only 38% of beats.
- Free-time intros and fading outros get no beats; the filled grid covers them for the
  arrangement only.
- CPU and GPU give the same beats on the tests so far; times are rounded to the
  millisecond.
- When the golden set exists, `/golden-eval` reports beat and downbeat F-measure against
  tapped `.beats` files. That confirms the choice or reopens it, and it tunes the
  note-versus-chroma weight for the key.
