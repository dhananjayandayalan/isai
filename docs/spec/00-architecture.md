---
id: spec-architecture
phase: ARCH
title: Architecture — components, data flow, timing, storage, environments
status: draft
track: all
depends_on: []
---

# Architecture

This is the target architecture for the whole spec (P0–P10). Decided parts cite their ADR.
Proposed parts name the phase that decides them, usually with a new ADR. Every phase reads
this file together with its own spec.

Sizing assumes the current audience: the owner and a small group of musician friends
(≤ 10 people, invite-only). How each part changes as the user count grows is in
[`docs/reference/scaling-roadmap.md`](../reference/scaling-roadmap.md).

## 1. System context

```
                         ┌───────────────────────────── Browser ───────────────────────────────┐
  MIDI keyboard ──USB──▶ │ web/ (React + TS, static SPA)                                        │
                         │  midi/ ─▶ engine/ (player, practice) ─▶ piano/ (canvas, rAF)        │
                         │            │            ▲                                            │
                         │            ▼            │                                            │
                         │          audio/ (Tone.js transport = master clock, sampled piano)    │
                         │  api/ (the only supabase-js user; P8)                                │
                         └───────┬──────────────────────────────────────────────┬──────────────┘
                                 │ HTTPS (auth, rows, signed URLs, realtime)    │ HTTPS (samples)
                                 ▼                                              ▼
       ┌──────────── Supabase (P8) ────────────┐                     Static host / CDN (P9)
       │ Auth  · Postgres (RLS) · Storage      │                     web bundle + piano samples
       │  songs · jobs · sessions · profiles   │
       │  buckets: uploads (transient), songs  │
       └───────────────▲───────────────────────┘
                       │ service role (claim job, download audio, upload results, delete audio)
       ┌───────────────┴───────────────────────┐
       │ Worker (pipeline/, P8)                │
       │ isai.worker ─▶ isai pipeline stages   │   GPU optional; one job at a time per GPU
       └───────────────────────────────────────┘
```

Practice runs entirely in the browser. The server side does analysis, storage and
identity, and nothing else. A learner practising costs almost nothing on the server; an
upload costs GPU time. That split drives every scaling decision later.

## 2. The Song contract (ADR 0002, decided)

- `schema/song.schema.json` (JSON Schema 2020-12) is the only definition of a Song.
  Types are generated for both sides; generated code is never edited (rule 1).
- Times are seconds from the start of the audio, as floats. Pitches are MIDI numbers.
  Pitch classes are 0–11 with C = 0.
- The pipeline validates before writing, and the web validates (precompiled ajv) when
  loading.
- **Schema evolution: open, decided in P3.** `schemaVersion` is a `const` today, so any
  bump makes every stored Song invalid. The first schema change (P3, `tempo.downbeats`)
  needs an ADR that picks a policy. The recommended policy:
  - Additive optional fields bump the minor version. The web accepts a list of supported
    versions and fills defaults.
  - Breaking changes bump the major version and ship a pure-JSON migration in
    `web/src/song/migrate.ts` and `pipeline/src/isai/migrate.py`, both tested against
    frozen fixtures of every past version.
  - Re-analysis is not a migration path. Uploaded audio is deleted (rule 8), so an old
    Song can only be upgraded by transforming its JSON, or by the user uploading the
    audio again.

## 3. Pipeline (`pipeline/`)

### Stage graph

Every stage is a plain function over typed artifacts (dataclasses in
`isai/<stage>/types.py`). Stages don't read files or global config. A small runner wires
them up, caches results and times them.

```
ingest ─▶ [separate] ─▶ rhythm ─▶ tonality ─▶ transcribe ─▶ harmony ─▶ arrange ─▶ assemble ─▶ validate ─▶ write
                                                                                                  (Song JSON + MIDI)
```

| Source type | Path |
|---|---|
| `piano-solo` | ingest → rhythm → piano transcription → tonality (audio + notes) → harmony (from notes) → arrange (hand split, optional simplify) |
| `full-mix` | ingest → separate (vocals, bass, drums, other) → rhythm (mix + drums) → tonality (harmonic stems) → melody (vocals) + bass line → harmony (other + bass) → arrange (melody right, chords and bass left) |
| `a-cappella` | ingest → melody → tuning and tonic → rhythm (onsets; weak) → key from melody → harmony suggested from melody (rules) → arrange |
| `carnatic` (P10) | ingest → [separate] → melody → shruti → raga candidates → tala → arrange (melody right, drone left; no chords) |

| Stage | Module | Phase | Output |
|---|---|---|---|
| ingest | `ingest/` | P3 | mono float PCM at a fixed rate, loudness-normalised; content hash; duration |
| separate | `separate/` | P4 | stems (Demucs) |
| rhythm | `rhythm/` | P3 | beats, downbeats, bpm, time signature, tempo stability |
| tonality | `tonality/` | P3, refined P4, P10 | key, mode, scale, tuning offset, tonic Hz |
| transcribe | `transcribe/` | P4 | piano notes; melody f0 → notes; bass notes |
| harmony | `harmony/` | P5 | chord segments on the beat grid |
| arrange | `arrange/` | P4 (hand split), P5 | two-hand notes (rule-based, rule 7) |
| theory | `theory/` | all | pure music theory, no audio dependencies |

### Pipeline rules

- **Deterministic.** The same audio, flags and `pipelineVersion` give byte-identical Song
  JSON. Seeds are fixed, model weights pinned by checksum, and GPU non-determinism is
  avoided or rounded away (times to 1 ms, velocities to integers).
- **Cached.** Stage outputs go to `.cache/<audio-hash>/<stage>-<stage-version>/`, so
  re-running after an arranger change skips separation. The cache is gitignored. The
  worker clears it per job (rule 8: stems are audio too).
- **Versioned.** `meta.pipelineVersion` is the package version. Each stage has its own
  version string, logged per run, so a golden-eval regression points at one stage.
- **Models behind interfaces.** Each learned model sits behind a small protocol
  (`BeatTracker`, `PianoTranscriber`, `PitchTracker`, `Separator`, `ChordRecogniser`) so
  spikes can swap them and tests can use fakes. Weights are cached outside git
  (`~/.cache/isai/models/`) and verified by checksum.
- **Failure codes.** The CLI exits with distinct codes (2 input missing, 3 schema not
  found, 1 validation; P3 adds decode and too-long errors). The worker maps them to job
  error codes the UI can explain.

## 4. Web (`web/`)

| Module | Owns | Rule |
|---|---|---|
| `midi/` | `MidiInput` interface and adapters (Web MIDI now; native later) | 4: only place that touches Web MIDI (ADR 0003) |
| `audio/` | `Transport`, `Instrument`, `AudioClock` interfaces; `tone.ts` is the only Tone.js importer | 6: master clock (ADR 0004) |
| `engine/` | player, active-note index, practice engine (P2), scoring (P6) | plain TS, no React, no DOM |
| `piano/` | key layout, canvas renderer, rAF controller, falling notes (P7) | 5: no React render per note |
| `theory/` | note naming, notation systems (letters, solfège, swaras, Roman, staff) | 90% coverage |
| `song/` | parse, validate, migrate Song JSON | generated validator only |
| `settings/` | `SettingsStore` (local, P6–P7) | |
| `api/` (P8) | `SongStore`, `SessionStore`, `AuthClient`, job status | proposed: only place that imports `@supabase/supabase-js` |
| `generated/` | types and validator from the schema | never hand-edited |

The practice engine has one core and two policies (P2, P6):

```
Song notes ─▶ steps (notes grouped by onset) ─▶ engine ─┬─ training policy: transport pauses at each step until matched
MIDI events (audio-clock seconds) ─▶ matcher ───────────┘─ performance policy: never pauses; matches feed the scorer
```

UI state (React) holds pages, choices and statuses. Notes, held keys, the playhead and
per-step feedback live in refs and typed arrays read by the rAF loop.

## 5. Timing model (ADR 0004, decided)

- One clock: the Tone.js transport on `AudioContext.currentTime`. No `Date.now`,
  `performance.now`, `setTimeout` or `setInterval` in `web/src/` (ESLint enforces this).
- MIDI timestamps are mapped into audio-clock seconds inside the adapter, using
  `getOutputTimestamp()`.
- Visuals read transport time in rAF.
- **Latency (P6).** What the learner hears is `outputLatency` late; their key presses
  arrive with MIDI input latency. Scoring compares
  `played − (outputLatency + userOffset)` with the scheduled song time. `userOffset`
  comes from calibration and is stored per device.
- **Speed (P2).** Song time and transport time differ by a rate. Scheduling, matching and
  scoring windows are defined in song time × rate, so a slowed song isn't easier or
  harder to time than real time.
- **Network waits use events, not timers.** Job progress (P8) uses Supabase Realtime
  subscriptions, not polling, so rule 6's lint guard stays unbroken.

## 6. Data (P8)

### Postgres (proposed; final shape decided by the P8 ADR)

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id` (= auth user), `display_name`, `role` (`owner`, `member`) | created by trigger on sign-up |
| `invites` | `email`, `invited_by`, `accepted_at` | sign-up allowed only for invited emails |
| `songs` | `id`, `owner_id`, `title`, `source_type`, `status`, `schema_version`, `pipeline_version`, `key`, `bpm`, `duration_sec`, `song_path`, `midi_path`, `shared` | summary columns copied from the Song for the library list |
| `jobs` | `id`, `song_id`, `status` (`queued`, `running`, `succeeded`, `failed`), `stage`, `attempts`, `leased_until`, `worker_id`, `error_code`, `timings` (jsonb), `upload_path` | queue + progress |
| `sessions` | `id`, `song_id`, `user_id`, `mode`, `started_at`, `duration_sec`, `speed`, `hands`, `loop`, `result` (jsonb) | practice history (P6 shape) |

Row-level security is on for every table. Users see their own rows, plus shared songs if
the owner turns on group sharing (decided in P8). Only the worker uses the service role.

### Storage

| Bucket | Contents | Lifetime |
|---|---|---|
| `uploads` (private) | `uploads/{user_id}/{job_id}.{ext}` | Deleted by the worker after the job, success or failure. A sweeper deletes anything older than 24 h (rule 8). Never backed up. |
| `songs` (private) | `songs/{user_id}/{song_id}.song.json`, `.mid` | Kept until the user deletes the song. Read through short-lived signed URLs. |
| samples (public CDN, P9) | piano sample set (CC-BY, credited) | Versioned path; cached forever. |

## 7. Upload to practice, end to end (P8)

1. The learner picks a file, type and title on "Analyse a song". The web checks size,
   type and duration.
2. `api/` inserts a `songs` row (`status = analysing`) and a `jobs` row (`queued`), and
   gets a signed upload URL for `uploads/{user}/{job}`.
3. The browser uploads directly to Storage. The job becomes claimable.
4. The worker claims the job with a lease (`claim_job()` RPC, `FOR UPDATE SKIP LOCKED`),
   downloads the audio and runs the pipeline, updating `jobs.stage` as it goes.
5. The worker uploads the Song JSON and MIDI, updates the `songs` summary columns and
   marks the job `succeeded`.
6. In a `finally` block, the worker deletes the upload and the local cache. The sweeper
   catches anything a crash leaves behind.
7. The web, subscribed to the job row, shows progress, then opens the Song overview.

## 8. Environments

| | Web | Backend | Worker | Songs from |
|---|---|---|---|---|
| local (P0–P7) | `pnpm dev` | none | `isai analyse` CLI | `schema/examples/`, local `.song.json` |
| local full stack (P8+) | `pnpm dev` | Supabase CLI local stack (Docker) | `isai worker --once` | local stack |
| staging (P9) | preview deploy per PR | Supabase dev project | owner's machine, manual | staging project |
| production (P9) | static host | Supabase prod project | always-on worker host | prod |

Config is environment variables only (`VITE_*` for the web, `ISAI_*` for the pipeline).
The service-role key never reaches the browser, the repo or CI logs.

## 9. Cross-cutting

- **Testing.** Unit tests next to the code; fakes for every interface (MIDI, transport,
  instrument, stores, models). Rule tests for 4, 5 and 6 (lint probes, render counts).
  The golden eval for pipeline quality. RLS tests for data access (P8). One end-to-end
  smoke test per environment (P9).
- **Test audio.** Test fixtures are synthesised at test time with numpy (clicks, sines,
  simple chords). Real songs exist only in the owner's local golden set (rule 8).
- **Security baseline.** Invite-only auth; RLS everywhere; signed URLs with short expiry;
  CSP without `unsafe-eval` (the Song validator is precompiled for this reason); upload
  limits; ffmpeg runs on untrusted files inside the worker container with resource
  limits.
- **Observability baseline.** Job rows keep per-stage timings and error codes. The worker
  logs JSON lines. The web reports audio, MIDI and load errors (P9 picks where). No song
  audio, file names or MIDI performance data in logs.
- **Naming.** English or Tamil for product, package and module names; musical terms in
  their own form (rule 9).

## 10. Decisions

| ADR | Decision | Status |
|---|---|---|
| 0001 | Record decisions as ADRs | accepted |
| 0002 | Song JSON is a schema-first contract with generated types | accepted |
| 0003 | MIDI input goes through `MidiInput` | accepted |
| 0004 | Tone.js transport is the audio engine and master clock | accepted |
| 0005 | One practice engine with training and performance policies (P2) | proposed |
| 0006 | Performance scoring, latency model and local practice records (P6) | proposed |
| next | Schema evolution policy (P3, before the first schema change) | expected |
| 0009 | Beat tracking (Beat This!) and key finding (P3); tracker superseded by 0014 | accepted |
| 0010 | Source separation: torchaudio Hybrid Demucs (P4) | proposed |
| 0011 | Piano transcription: ByteDance high-resolution model (P4) | proposed |
| 0012 | Pitch tracking: torchcrepe without dither (P4) | proposed |
| 0014 | Beat tracker back to librosa, Beat This! as an option (P5, supersedes 0009 in part) | accepted |
| next | Analysis models: chords (P5), if a learned recogniser is adopted | expected, after the spike |
| next | `MidiInput` gains pedal and device-change events (P7, amends 0003) | expected |
| 0015 | Backend: Supabase, jobs-table queue, invite-only magic links, `api/` boundary (P8) | accepted |
| 0016 | Hosting: Cloudflare Pages, the owner's GPU PC, GHCR, errors table, scheduled checks (P9) | proposed |
| next | Carnatic data model: tala, raga data, swara spelling (P10) | expected |

ADR numbers are given by `/adr-new` in the order they're written.
