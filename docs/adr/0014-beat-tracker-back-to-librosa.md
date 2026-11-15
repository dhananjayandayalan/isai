---
id: adr-0014
title: Beat tracker back to librosa, Beat This! as an option
status: accepted
date: 2026-11-15
phase: P5
supersedes: adr-0009 (the beat-tracker choice only; its key finding stands)
---

# 0014 — Beat tracker back to librosa, Beat This! as an option

## Context

ADR 0009 made Beat This! the default beat tracker because it lined up better with the
separated drum stem's onsets on one film song. Nobody had listened to the result yet.
Soon after, the owner heard `Maayangal Saathiyam` (a full-mix film song) get worse: the
chords that had sounded right before the switch no longer did.

The A/B used the same stems and melody stage for every run, so only the tracker and
arranger differed:
- Both trackers read about 120 BPM. But at 60–100 s and 140–215 s their beats sit about
  0.22 s apart, roughly half a beat. Elsewhere they agree within 70 ms.
- Chords are recognised per beat, so the chords move in those stretches. With Beat This!
  they match the output the owner liked 67% of the time; with librosa on the same
  current code, 91%.
- **The owner's listening test** (song plus beat clicks, one file per tracker): librosa
  clicks on the beat at 60–100 s and 140–200 s, and Beat This! sits off it.
- A second song in the local cache shows another failure: Beat This! switched to half
  tempo for 109 of its 240 beat gaps, where librosa held a steady grid.

Drum-onset alignment, ADR 0009's evidence, is the kind of proxy number that improved
here while the music sounded worse. Isai is judged by ear (CLAUDE.md, where we left off).

## Options considered

1. **Keep Beat This! and correct it afterwards** (snap half-beat-shifted stretches to the
   onset phase, merge half-time runs). This keeps its better bar starts on synthesised
   drums. But it's a heuristic layered on a model, and nothing confirms it until the
   golden set has tapped beats.
2. **librosa back as the default, Beat This! behind `--beat-tracker beat-this`.** This is
   the grid the owner hears as right, and it needs no model, no torch and no checkpoint
   download (quicker on the laptop and in CI). Its weakness is still there: bar starts
   are guessed from accent strength, and on a synthesised drum groove it put every bar
   start one beat early.
3. **Run both and choose per song** (for example, by agreement with the onset envelope).
   This doubles the rhythm work and needs a selection rule, which needs the golden set
   to tune.

## Decision

**Option 2.** librosa's tracker is the default again. Beat This! stays in the model
registry and behind `--beat-tracker beat-this`, for comparison and for the golden-set
spike. The filled beat grid from `d97a6cc` stays: on librosa's grid it only carries the
ends on and changes nothing in between. Key finding is unchanged from ADR 0009.

## Consequences

- The chords go back to the output the owner liked. The rhythm stage gets cheaper and no
  longer needs the 81 MB checkpoint by default.
- Bar starts can still be a beat early on some songs (librosa's known weakness). Ask the
  owner which bars sound wrong, not for the metre.
- Follow-up: when the golden set has tapped `.beats` files, `/golden-eval` scores both
  trackers by beat and downbeat F-measure. Option 3, or a downbeat-only use of Beat This!
  on librosa's beats, can reopen this then.
- ADR 0009 and the architecture table point here now. `pipeline/README.md` and the P3
  plan get updated with the code change.
