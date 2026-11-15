---
id: spec-p08-backend-library
phase: P8
title: Backend and library — accounts, upload, queue worker, songs
status: in-review
track: both
depends_on: [spec-p05-harmony-arranger, spec-p06-performance]
---

# P8 — Backend and library

## Goal

An invited friend signs in, uploads a recording, watches its analysis progress, and finds
the finished song in their library with their practice history. A worker on the owner's
machine processes the queue. The uploaded audio is deleted as soon as the job ends,
whether it succeeded or failed (rule 8). Everything runs against a local Supabase stack;
hosting it is P9.

## Scope

### Supabase — `supabase/` (new top-level folder)
- Supabase CLI project: `config.toml`, `migrations/` (SQL, forward-only), `seed.sql`
  (an owner profile and an invite), and `tests/` (pgTAP).
- **Auth:**
  - Email magic link. Sign-up allowed only for emails in `invites` (checked by a
    before-user-created hook or trigger).
  - Roles: `owner` and `member`.
  - Sessions persist in the browser via supabase-js.
- **Tables** (architecture spec, §6): `profiles`, `invites`, `songs`, `jobs`,
  `sessions`, with indexes on `owner_id`, `song_id`, `status` and `created_at`.
- **RLS on every table:**
  - Members read and write only their own songs, jobs and sessions.
  - If group sharing is on (decision below), members read songs with `shared = true`.
  - Nobody but the service role updates `jobs.status` past `queued`.
- **RPCs:**
  - `claim_job(worker_id)`: the oldest queued job, `FOR UPDATE SKIP LOCKED`, sets a
    lease.
  - `renew_lease(job_id)`
  - `finish_job(job_id, result)` and `fail_job(job_id, code, message)`
  - `requeue_expired()`: expired leases go back to `queued`, up to 2 attempts, then
    `failed`.
- **Storage:**
  - `uploads` (private; 100 MB limit; audio MIME allowlist; a user writes only under
    their own `{user_id}/` prefix through a signed upload URL).
  - `songs` (private; read through signed URLs valid for 10 minutes).
- **Sweeper:** `pg_cron` runs `requeue_expired()` every minute. A scheduled job deletes
  `uploads` objects older than 24 h. A test proves an old object disappears.

### Worker — `pipeline/src/isai/worker/`
- `isai worker` (long-running) and `isai worker --once` (one job, for tests and manual
  runs).
- The loop: claim → download the upload into a temp dir → run the pipeline with the job's
  type, title and level → upload Song JSON and MIDI to `songs/{user}/{song}` → update the
  summary columns in `songs` → `finish_job`. On any exception, `fail_job` with a mapped
  error code.
- **`finally`, always:** delete the upload object, the temp dir and the stage cache for
  that audio hash. Rule 8 is tested for success, failure and a simulated crash (the
  sweeper path).
- Lease renewal in a background thread every 30 s. `jobs.stage` is updated at each stage
  boundary. Graceful shutdown on SIGINT/SIGTERM (finish or release the current job).
- Concurrency: 1 job per worker process; a second process on a second GPU is allowed.
- **Interfaces:** `JobQueue`, `ObjectStore` and `SongRepository`, with Supabase
  implementations and in-memory fakes. Worker tests use only the fakes, plus one `slow`
  end-to-end test against the local stack.
- Config from `ISAI_SUPABASE_URL` and `ISAI_SUPABASE_SERVICE_KEY` (the worker's `.env`,
  never committed), plus `ISAI_WORKER_ID`.
- **Error codes for the UI:** `decode_failed`, `too_long`, `silent`, `unsupported_type`,
  `model_failed`, `timeout`, `internal`. Each has a learner-facing message and a next step
  (STYLE_GUIDE §7). This closes P0 review #11.

### Web — `web/src/api/` and pages
- `api/` is the only module that imports `@supabase/supabase-js`. It's enforced by an
  ESLint guard like rule 4, with probe tests. It exports `AuthClient`, `SongStore`,
  `SessionStore` (Supabase implementation), `JobWatcher` (Realtime subscription to the
  job row, so no polling and rule 6 holds) and `UploadClient`.
- **Pages** (follow the prototype):
  - **Sign in:** magic link, plus "check your email" and expired-link states.
  - **Library** (`Main.dc.html`): search, filter by source type, status chips,
    "Continue practising", sessions and accuracy per song, empty states.
  - **Analyse a song** (`Upload.dc.html`):
    - drop or pick a file; title; "What kind of recording is it?"; level
    - client checks: size, type, duration through `<audio>` metadata
    - the privacy line: "The audio is deleted as soon as analysis finishes"
    - the Carnatic fields (Sa, raga) stay hidden until P10
  - **Progress:** queued (position in queue), analysing (stage x of y), failed (message,
    retry, which needs a new upload because the audio is gone), done (open the song).
  - **Song overview** (`Song.dc.html`): the server version of the P6 page, adding
    download MIDI and Song JSON, delete song, and the share toggle if sharing is on.
- **Routing:** URL routes for library, song, practice, results, upload and devices.
- Sessions: the Supabase `SessionStore` replaces local storage when signed in. On first
  sign-in, local P6 sessions are offered for import.
- Settings stay local per device (latency differs per device). Only notation preferences
  sync, through a `profiles.preferences` jsonb column.

### Local full stack
- `supabase start` (Docker), `pnpm dev` and `uv run isai worker` together, documented in
  the README, with a `make`-style script or a `justfile` if approved.

## Needs owner approval before building

- **New ADR — backend:**
  - Supabase as the backend
  - a jobs-table queue with leases (compared with Supabase Queues/pgmq and an external
    queue)
  - invite-only magic-link auth
  - the `api/` boundary rule
  - Realtime for job progress
- **CLAUDE.md change:** a hard rule (or an extension of rule 4) that only
  `web/src/api/` imports supabase-js, and `supabase/` added to the repo layout.
- **Group sharing:** private songs only, or a per-song "share with the group" toggle
  (recommended: private by default, toggle allowed).
- **Dependencies:**
  - `@supabase/supabase-js` (runtime, over 5 MB unpacked across its packages)
  - a router (e.g. `react-router`, small)
  - `supabase` (Python client) for the worker
  - Supabase CLI and Docker Desktop for local development
- **No Song schema change.** Database tables are defined by SQL migrations. The Song JSON
  stays the contract between worker and web.

## Out of scope

Hosting, CI/CD, backups and monitoring (P9). Public sign-up, billing and quotas beyond a
simple per-user daily upload cap (see `docs/reference/`). Re-analysing stored songs
(impossible after deletion; see the architecture spec, §2). Social features, comments and
public sharing links. Carnatic upload fields (P10). Native apps.

## Exit criteria

- [ ] Backend ADR accepted; CLAUDE.md updated; dependencies and sharing decision approved
- [ ] Migrations apply cleanly to an empty local stack; pgTAP RLS tests prove a member can't read or write another member's songs, jobs, sessions or uploads
- [ ] Worker tests with fakes cover success, each error code, lease expiry and requeue, graceful shutdown, and deletion of audio and cache on success, failure and crash
- [ ] Sweeper test: an upload object older than 24 h is deleted
- [ ] End-to-end on the local stack: sign in → upload a synthesised test file → progress updates live → song in the library → train and perform → session listed
- [ ] ESLint fails on a probe importing supabase-js outside `web/src/api/`; rule 4, 5 and 6 tests still pass
- [ ] Library, upload, progress and song pages have every empty, loading and error state from STYLE_GUIDE §6–7
- [ ] After a real run, the owner checks the Storage dashboard: no audio left behind
- [ ] Lint, type check and tests pass in `web/` and `pipeline/`; pgTAP tests pass
