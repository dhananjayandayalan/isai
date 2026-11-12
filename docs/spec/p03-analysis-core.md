---
id: spec-p03-analysis-core
phase: P3
title: Analysis core — ingest, tempo and beats, key and scale
status: draft
track: pipeline
depends_on: [spec-p00-foundation]
---

# P3 — Analysis core

## Goal

`isai analyse song.mp3 --type full-mix --out out/` decodes real audio and writes a Song
with real tempo, beats, downbeats, time signature, key, mode and scale, with confidence
values, plus a MIDI file carrying the tempo map. `notes` and `chords` are still empty. The
golden set gets real audio and the first real `/golden-eval` report is committed.

## Scope

### Pipeline framework
- **Stage runner** (`isai/runner.py`): runs stages in order for the chosen source type,
  caches each stage's output under `.cache/<audio-hash>/<stage>-<version>/`, records
  per-stage timings, and logs JSON lines with `--log-json`. `--no-cache` and
  `--from-stage` for development.
- **CLI.** `--type piano-solo|full-mix|a-cappella` is required (`carnatic` is rejected
  with "coming in a later version"; automatic detection is out of scope). New exit codes:
  4 decode failed, 5 too long, 6 no audio content (silence).
- **Artifacts.** Typed dataclasses per stage. `assemble` builds the Song from them, and
  the existing validator checks it.
- **MIDI writer** (`isai/midi_out.py`): a type-0/1 file with tempo map, time signature,
  key signature and whatever notes exist (two tracks: right and left hand).

### Ingest — `isai/ingest/`
- `ffprobe` and `ffmpeg` (system binaries, version checked at start) decode any common
  format to mono float32 PCM at 44.1 kHz (plus a 22.05 kHz copy for stages that want it).
- Loudness-normalise to −23 LUFS integrated (EBU R128), and trim leading and trailing
  silence (offset recorded, so Song times still match the original audio).
- Limits: 12 minutes maximum (exit 5), 100 MB input maximum.
- Content hash: SHA-256 of the decoded PCM, used as the cache key, never stored in the Song.
- Tests on files synthesised in `tmp_path` (WAV and, where ffmpeg can encode them, MP3,
  FLAC and M4A): sample rate, mono downmix, loudness within ±1 LU, silence trim offset,
  the too-long and silent errors, and a non-audio file.

### Rhythm — `isai/rhythm/`
- A `BeatTracker` protocol returns beats and downbeats in seconds.
- Spike in `pipeline/spikes/beats/`: compare at least a modern neural tracker (e.g. Beat
  This!), a madmom-style RNN/DBN tracker and `librosa.beat` on the golden set. Measure
  tempo accuracy, beat F-measure where a reference exists, runtime on CPU and GPU, and
  install size. Adopt the winner through an ADR.
- Derived values are pure code with unit tests:
  - `bpm`: median inter-beat interval.
  - `timeSignature`: beats per bar from downbeat spacing (3 or 4; others fall back to 4
    with low confidence).
  - Tempo stability: the coefficient of variation of the intervals.
  - `confidence.tempo`.
- Tests: click tracks synthesised at 60, 90, 120 and 174 BPM in 3/4 and 4/4, and a tempo
  ramp (flagged unstable).

### Tonality — `isai/tonality/` and `isai/theory/`
- Chroma (CQT-based) over the harmonic part of the signal (HPSS), weighted by beat-synced
  energy.
- **Key profiles live in `theory/keyfinding.py`** (pure, no audio). Krumhansl–Kessler,
  Temperley and Albrecht–Shanahan profiles; correlation over 24 keys; a confidence from
  the gap between the best and second-best keys. `mode = modal` when the best major and
  minor candidates are close and the scale fits neither well.
- **Tuning offset** in cents (from the chroma peak or a pitch histogram) shifts the chroma
  bins before key finding. It's needed for film songs not tuned to A440.
- `scale` from tonic and mode through the existing `theory.scales`. `tonicHz` is left
  empty unless the source is a-cappella (P4 fills it properly).
- Tests: synthesised I–IV–V–I progressions in all 24 keys, detuned by ±30 cents; the
  relative-key confusion case; an empty chroma.

### Schema change (first one)
- Add optional `tempo.downbeats: number[]` (seconds), and apply the schema-evolution ADR
  (supported-versions list, minor bump to `0.2.0`, examples updated, old examples still
  load). `/schema-sync` regenerates both sides.
- Web: the P2 bar helper uses `tempo.downbeats` when present. That's the only web change.

### Golden set
- The owner adds real audio for at least 6 songs (2 piano-solo, 2 full-mix,
  2 a-cappella) to the local manifest, with expected key, mode and bpm.
- `/golden-eval` runs and its report is committed in `reports/`.
- **Initial targets** (revisited with data): key exact or relative/parallel on ≥ 75% of
  songs; tempo within 2% (or exact half or double, flagged) on ≥ 80%; a 4-minute song
  analysed in ≤ 60 s on CPU for P3's stages.

## Needs owner approval before building

- **New ADR — schema evolution policy** (see the architecture spec, §2). Accepted before
  the schema change.
- **Schema change** `tempo.downbeats`.
- **Dependencies over ~5 MB:** `numpy`, `scipy`, `librosa` (plus `numba`/`llvmlite`),
  `soundfile`, `mido`. The beat model the spike picks may bring `torch` (≈ 200 MB CPU,
  ≈ 2 GB with CUDA). Approve it with the beats ADR. **System dependency:** ffmpeg ≥ 6 on
  `PATH`, documented in the README.
- **New ADR — beat tracking and key finding**, after the spike.
- **Model weight licences.** Record each in the ADR; non-commercial weights are flagged
  because they block a public launch (see `docs/reference/public-launch.md`).

## Out of scope

Separation, transcription, melody and tonic Hz (P4); chords, arrangement and sections
(P5); Carnatic (P10); automatic source-type detection; the worker and Supabase (P8);
tempo maps with multiple tempi in the schema (a single `bpm` plus the beat list covers
rubato for now).

## Exit criteria

- [ ] Schema-evolution ADR and beats/key ADR accepted; dependencies approved
- [ ] `isai analyse <real song> --type full-mix` writes a valid Song (schema 0.2.0) with beats, downbeats, bpm, time signature, key, mode, scale and confidences, and a `.mid` with the tempo map
- [ ] The same input gives byte-identical output twice (determinism test, marked `slow` if it uses a model)
- [ ] The cache skips finished stages (test); `--no-cache` re-runs everything
- [ ] Synthesised-audio tests for ingest, rhythm and tonality pass; `theory/` ≥ 90% lines
- [ ] Web loads 0.1.0 and 0.2.0 Songs; the bar helper uses downbeats when present
- [ ] `/schema-sync` shows no diff after regeneration
- [ ] Golden set has ≥ 6 real songs; `/golden-eval` report committed; targets met or the misses explained
- [ ] Pipeline ruff, pyright and pytest pass (`-m "not slow"` in under 60 s)
