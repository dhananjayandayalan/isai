# Scaling roadmap

How each part of Isai changes as the user count grows, and the signals that say it's time
to move to the next tier.

## Tiers at a glance

| Tier                 | Users (monthly active) | Who                                                   | Analysis                                                            | Backend                                       | Main risk                                        |
| -------------------- | ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| **T0** (P9 baseline) | ≤ 10                   | invited friends                                       | 1 worker on the owner's GPU PC                                      | Supabase, one project                         | the PC is off; the owner is the only operator    |
| **T1**               | ≤ 100                  | friends of friends, music teachers and their students | 1 always-on cloud or home-server GPU worker, plus the PC as a spare | same, paid plan                               | queue waits at peak; support load                |
| **T2**               | ≤ 1,000                | closed beta, waitlist                                 | autoscaled GPU workers (scale to zero)                              | paid plan, connection pooling, tuned indexes  | GPU cost; copyright exposure; abuse              |
| **T3**               | ≤ 10,000               | public launch                                         | queue-driven autoscaling, stages split by hardware                  | larger plan or managed Postgres, read replica | cost per upload; reliability expectations; legal |
| **T4**               | 100,000+               | consumer product                                      | multi-region GPU pools, batch inference, optimised models           | partitioned tables, dedicated services        | everything is an organisation problem            |

## Moving to the next tier

Move up when **any** trigger holds for two weeks in a row. These metrics come from the
`jobs` and `sessions` tables and the P9 alerts.

| From → to | Trigger                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T0 → T1   | More than 10 invite requests waiting; or the queue's oldest job is over 1 h on 3+ days a week; or friends ask for analysis while the owner's PC is off |
| T1 → T2   | Weekly uploads over 300; or p95 analysis turnaround over 15 min; or support questions take the owner more than 2 h a week                              |
| T2 → T3   | A decision to open sign-up publicly; or more than 1,000 waitlisted; or GPU spend is a meaningful monthly cost that needs quotas or billing             |
| T3 → T4   | Sustained growth past 10,000 monthly active users; or contractual reliability (schools, partners)                                                      |

Before any tier above T0, read [public-launch.md](public-launch.md). The legal questions
(copyrighted uploads, model weight licences, minors' data) can block a tier no matter how
ready the infrastructure is.

## Per component

### Analysis workers (the main scaling axis)

| Tier | Shape                                                                                                                   | Notes                                                                                                                                                                                                                                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T0   | One container on the owner's PC; claims one job at a time                                                               | P9. Jobs wait when it's off; the UI says so.                                                                                                                                                                                                                                             |
| T1   | One always-on GPU host (a cloud VM, or a small home server) plus the owner's PC as a second worker                      | Both claim from the same queue (P8's lease design already allows it).                                                                                                                                                                                                                    |
| T2   | A pool that autoscales on queue depth and scales to zero when idle                                                      | Serverless or on-demand GPU platforms. The worker container stays the same. The scaler reads `count(*) where status='queued'` and the oldest job age. Cold starts (loading model weights) become the main latency cost: bake weights into the image, keep one warm worker in peak hours. |
| T3   | Split stages by hardware: GPU pool for separation and transcription, CPU pool for ingest, rhythm, harmony and arranging | Stage artifacts move through object storage (they're audio, so rule 8 applies: short TTL, private, deleted per job). Model optimisation (ONNX/TensorRT, fp16, batched inference) is worth it here.                                                                                       |
| T4   | Regional GPU pools; batch scheduling for non-urgent jobs (cheaper interruptible instances); per-stage autoscaling       | Probably a dedicated team.                                                                                                                                                                                                                                                               |

Other work that cuts compute at every tier:

- **Skip work that isn't needed:** no separation for piano-solo or a-cappella (already
  true); the cheapest model that meets the golden targets; shorter analysis windows for
  long intros.
- **A "quick preview" mode:** key, tempo and chords from CPU-only stages in seconds. The
  full arrangement is queued separately.
- **Duplicate uploads** of the same recording could reuse one analysis (an audio
  fingerprint, e.g. Chromaprint, as the lookup key). This saves the most at T3+, but it
  shares a derived work between users. Decide it with the copyright questions in
  `public-launch.md`, not as a pure optimisation.

### Queue

| Tier  | Shape                                                                                                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T0–T1 | The P8 `jobs` table with leases and `FOR UPDATE SKIP LOCKED`. Fine into the thousands of jobs a day.                                                                                                                                                   |
| T2    | The same table, plus **per-user fairness** (one user's 50 uploads don't block everyone: claim order uses `queued_at` plus a per-user running count) and **quotas** (uploads per user per day or month). Priority lanes (preview before full analysis). |
| T3    | Either Postgres-native queues (pgmq) or an external queue (SQS, Cloud Tasks, Redis streams), if the autoscaler needs native integration or the job rate pressures the main database. The `JobQueue` interface from P8 makes this one adapter.          |
| T4    | A queue per stage (from the T3 split), with dead-letter queues and replay tooling.                                                                                                                                                                     |

### Database

| Tier  | Change                                                                                                                                                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T0–T1 | Defaults. Check the indexes from P8 (`songs.owner_id`, `jobs.status, queued_at`, `sessions.user_id, started_at`).                                                                                                                              |
| T2    | Connection pooling (Supavisor/PgBouncer) for the worker pool. Watch the slowest queries. `sessions` grows fastest (one row per practice run); add a retention or roll-up policy (keep full results for 1 year, monthly aggregates after that). |
| T3    | A larger compute plan. A read replica for analytics and admin queries. Partition `sessions` by month. Move `client_errors` and logs out of the main database.                                                                                  |
| T4    | Possibly split services (identity, songs, practice history) with their own stores; event streams for analytics instead of querying OLTP tables.                                                                                                |

### Storage and delivery

- **Song JSON and MIDI are small**, so storage is rarely the bottleneck (see
  [capacity-planning.md](capacity-planning.md)). From T2: gzip or brotli on the JSON
  (it compresses very well); a CDN in front of signed URLs; a cached signed URL per
  session instead of one per request.
- **Uploads:** the bucket lifecycle stays "deleted after the job, swept at 24 h" at every
  tier (rule 8). At T3, direct-to-storage resumable uploads (TUS) for slow mobile
  connections.
- **Samples:** a one-time download per device (the browser caches them), served from a
  CDN. From T2, consider a service worker so samples and the app work offline after the
  first visit (also a good PWA story for practising without a network).

### Web app

- It's static, so it scales with the CDN. Watch the **bundle size** (P1 baseline: 85 kB
  gzip main + 79 kB gzip Tone.js, lazy-loaded) and keep heavy features (staff, falling
  notes, Carnatic data) in lazy chunks.
- At T2+, **device coverage** matters more than server capacity:
  - **Safari and iOS have no Web MIDI.** iPads are very common for piano learners. A
    native shell (Tauri on macOS, a native iOS wrapper) with a native `MidiInput`
    adapter is the obvious T2/T3 phase. ADR 0003 already plans for it.
  - Low-end Android tablets: check the canvas frame time; reduce falling-notes
    effects on slow devices.
- **Accessibility and localisation** (Tamil and English UI) become requirements, not
  extras, at public launch. See `public-launch.md`.

### Auth and accounts

| Tier  | Change                                                                                                                                                                                                          |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T0–T1 | Invite-only magic links (P8). The owner manages invites by hand.                                                                                                                                                |
| T2    | A waitlist and self-service invites (each member gets N invites). OAuth (Google) to reduce email-deliverability problems. A custom SMTP provider, because the default auth email limits are low.                |
| T3    | Open sign-up with email verification, bot protection (CAPTCHA/Turnstile) on sign-up and upload, age confirmation (see data-security-privacy.md), and roles for teachers and students if that market is pursued. |
| T4    | Organisations (schools, teachers with classes), SSO for institutions.                                                                                                                                           |

### Support and product operations

- T0: the owner and a group chat.
- T1: a feedback button that sends the song id, pipeline version and a free-text
  description (no audio). A "this chord is wrong" correction flow stores the correction
  as a Song diff. That feeds the golden set without keeping audio.
- T2+: a help centre, a status page, response-time targets, and a triage rota once there
  is more than one maintainer.

## Engineering process as the team grows

- **More than one developer:** `CODEOWNERS` for `schema/`, `docs/adr/`, `arrange/` and
  `supabase/migrations/`. Required reviews. ADRs stay the decision record.
- **The golden set becomes CI:** a self-hosted GPU runner with the owner-held audio runs
  `/golden-eval` nightly and on pipeline PRs. The audio still never leaves that machine.
- **Feature flags** for risky UI and pipeline changes (a column in `profiles`, then a
  proper flag service at T3).
- **Canary pipeline versions:** route a percentage of jobs to the new worker image and
  compare user corrections and failure rates before switching everyone (details in
  [operations.md](operations.md)).

## Future phase candidates

These come from the tiers above. Each would become a numbered spec when the trigger
holds:

| Candidate                                            | Tier      | Why                                                            |
| ---------------------------------------------------- | --------- | -------------------------------------------------------------- |
| Always-on worker plus fair queue and quotas          | T1        | Turnaround without the owner's PC; protection from heavy users |
| Native macOS/iOS shells with native MIDI adapters    | T2        | Safari has no Web MIDI; iPads are common for learners          |
| Autoscaled GPU pool and quick-preview analysis       | T2        | Cost and turnaround under bursty load                          |
| Waitlist, OAuth, custom SMTP, bot protection         | T2        | Growth beyond personal invites                                 |
| Teacher and student roles, assignments               | T2–T3     | A natural channel for piano learners                           |
| Legal pages, takedown process, age checks            | before T3 | Required for public sign-up                                    |
| Billing and plans tied to analysis minutes           | T3        | GPU cost needs a revenue line or hard quotas                   |
| Tamil UI and full accessibility audit                | T3        | Audience and obligations                                       |
| Stage split, model optimisation, partitioned history | T3–T4     | Cost per upload and database growth                            |
