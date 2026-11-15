# Operations at scale

How running Isai changes from "the owner notices and fixes it" (P9) to a service with
objectives, alerts, safe releases and a support loop. Read with
[scaling-roadmap.md](scaling-roadmap.md) for when each step is needed.

## 1. Service level objectives

Define objectives for what users feel. Practice is client-side, so the server-side
objectives are about loading and analysis.

| Objective                                                        | T0–T1             | T2            | T3+           | Measured from                         |
| ---------------------------------------------------------------- | ----------------- | ------------- | ------------- | ------------------------------------- |
| Web app loads (availability)                                     | best effort (CDN) | 99.5% / month | 99.9% / month | uptime checks                         |
| Sign in, library, open song (API availability)                   | best effort       | 99.5%         | 99.9%         | API probes; error rate                |
| Analysis turnaround, p95 (queued → done)                         | same day          | ≤ 15 min      | ≤ 5 min       | `jobs` timestamps                     |
| Analysis success rate (excluding user errors such as `too_long`) | ≥ 90%             | ≥ 95%         | ≥ 98%         | `jobs.status`, `error_code`           |
| Uploaded audio deleted within 24 h                               | 100%              | 100%          | 100%          | rule 8 audit query                    |
| Practice screen frame time, p95 on target devices                | —                 | ≤ 16 ms       | ≤ 16 ms       | client telemetry (sampled, anonymous) |

The audio-deletion objective is a promise to users, not a target. Any miss is an incident.

Error budgets from T2: if an objective is missed for the month, releases pause for
reliability work, except fixes.

## 2. Observability by tier

| Signal             | T0–T1 (P9)                                | T2                                                                                                                | T3+                                          |
| ------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Worker logs        | JSON lines on the host, 14 days           | shipped to a log service, 30 days                                                                                 | same, plus trace ids per job across stages   |
| Job metrics        | SQL views and the admin page              | metrics exported (queue depth, oldest job age, stage durations, failures by code, GPU utilisation) to a dashboard | per-stage service metrics; cost per job      |
| Web errors         | `client_errors` table or a hosted tracker | hosted tracker with release tagging                                                                               | same, with sampling                          |
| Client performance | none                                      | sampled frame-time and audio-start-time telemetry (no PII, opt-out)                                               | same                                         |
| Uptime             | one external check                        | checks per region and per API path                                                                                | synthetic user journey (sign in → open song) |
| Cost               | the monthly invoice                       | daily GPU spend in the dashboard                                                                                  | budget alerts, cost per upload trend         |

Always include `pipelineVersion`, the worker image tag and the web build SHA on every
error and job record. Most debugging starts with "which version did this".

Never log: audio, file names, signed URLs, song titles at info level, MIDI performance
data, or emails outside auth logs.

## 3. Alerts

Page (wake someone) only for what users feel and what breaks promises. Everything else
goes to a daily digest.

| Alert                                                  | Condition                                                           | Severity                      |
| ------------------------------------------------------ | ------------------------------------------------------------------- | ----------------------------- |
| Upload audio not deleted                               | rule 8 audit > 0                                                    | page at every tier            |
| Analysis stalled                                       | oldest queued job > 2 × turnaround objective                        | page from T2 (email at T0–T1) |
| Worker pool empty                                      | no heartbeat for 15 min while jobs are queued                       | page from T2                  |
| Job failure spike                                      | failures (excluding user errors) > 3× the 7-day baseline in an hour | page from T2                  |
| API errors                                             | 5xx rate > 2% for 10 min                                            | page from T2                  |
| Cost spike                                             | GPU spend today > 2× the 7-day average                              | digest; page at T3            |
| Certificates, domain, quota limits near expiry or full | 14 days ahead                                                       | digest                        |

## 4. On-call and incidents

- **T0–T1:** the owner. Runbooks in `docs/runbooks/` (P9) make fixes repeatable.
- **T2+:** a rota once there are two or more maintainers. One person is primary each week.
  Pages go to them.
- **Incident steps:** acknowledge → assess impact → mitigate (roll back first, debug
  second) → communicate (status page from T2) → resolve → write a blameless postmortem
  within a week for every page-level incident, with follow-ups as issues.
- **Audio-retention incident** (rule 8 broken): delete the objects, find the cause, add a
  test that would have caught it, and record it. Assess whether users must be told
  (data-security-privacy.md, §6).

Runbooks to add after P9's set:

- the queue backlog during a viral spike (scale the pool, turn on quotas, enable quick
  preview only)
- the GPU provider is out of capacity (fall back to another region or provider, or
  CPU-only quick preview)
- an abusive user
- a mass email-deliverability failure (magic links not arriving)
- a schema migration that went wrong in production

## 5. Releases at scale

### Web

- Preview deploy per PR (P9). From T2, staged rollout by percentage when the host supports
  it, or a feature flag per risky change.
- Keep the previous build deployable with one action.

### Database

- Expand-then-contract migrations only (P9).
- From T2, test migrations on a copy of production data shape (restored backup with
  personal data scrubbed) before applying.
- Long migrations on big tables (e.g. `sessions`) need batched backfills, not one
  statement.

### Pipeline (canary releases)

A new pipeline version changes every future analysis, and users can't re-analyse old
uploads. So be careful:

1. The golden eval passes, with no unexplained regressions (definition of done).
2. **Shadow run** (T2+): workers on the new image process a sample of jobs _a second
   time_ while the audio is still present. Both results are compared automatically (key,
   tempo, chord agreement, constraint violations, runtime). Only the old result is shown
   to the user, and the shadow result is deleted after comparison. The audio is still
   deleted when both runs finish, inside the same job, so rule 8 holds.
3. **Canary:** route 5–10% of jobs to the new image. Watch the failure rate, turnaround
   and user correction rate for a few days.
4. Promote to 100%. Keep the old image for rollback.

The shadow run must finish within the same job's lifetime. Audio may not be kept "for
later comparison".

## 6. Backups and disaster recovery

|                         | T0–T1                                                               | T2                     | T3+                                         |
| ----------------------- | ------------------------------------------------------------------- | ---------------------- | ------------------------------------------- |
| Database                | provider daily backups + weekly logical dump to the owner's storage | point-in-time recovery | PITR + a cross-region copy                  |
| `songs` bucket          | weekly copy                                                         | daily incremental      | versioned bucket + cross-region replication |
| `uploads` bucket        | **never backed up**                                                 | never                  | never                                       |
| RPO (data you can lose) | 1 week                                                              | 1 day                  | 15 min                                      |
| RTO (time to restore)   | 1 day                                                               | 4 h                    | 1 h                                         |
| Restore drill           | before launch (P9)                                                  | quarterly              | quarterly, automated                        |

## 7. Support loop

- **In-app feedback** with the context attached automatically: song id, pipeline version,
  web build, browser, MIDI device name (with consent). Never the audio (it's gone anyway).
- **Corrections:** "this chord is wrong", "wrong key", "the tempo doubled". The user
  edits the field, and the correction is stored as a structured diff on the Song. This
  improves the song for them and, aggregated, shows which pipeline stage fails most.
- **Golden set growth:** when corrections cluster on a kind of recording, the owner adds
  a similar song they own to the local golden set. The golden set stays owner-held audio
  only (rule 8).
- From T2: a help centre covering MIDI setup per browser and OS, why Safari can't use
  Web MIDI, latency calibration, and the upload limits.

## 8. Cost operations

- Track cost per upload (capacity-planning.md) per pipeline version, next to quality
  metrics. A quality gain that doubles the cost is a product decision, not just an
  engineering one.
- Budgets and alerts on every paid service from T1.
- Scale-to-zero for GPU pools from T2. Review idle resources monthly.
- Quotas are the safety valve: during a cost spike, lower per-user upload quotas first,
  rather than degrading everyone's turnaround.
