---
id: spec-p09-deployment
phase: P9
title: Deployment and operations — production for the friends group
status: ready
track: ops
depends_on: [spec-p07-notation-settings, spec-p08-backend-library]
---

# P9 — Deployment and operations

## Goal

Isai runs in production for the owner and invited friends. They open a URL, sign in,
upload, and practise with no local setup. Every change reaches production through CI,
with checks that enforce the hard rules. The owner can see when something breaks, restore
data, and follow a runbook for every common failure. This is sized for ≤ 10 people;
growing beyond that is covered in `docs/reference/`.

## Scope

### Environments
- **staging:** a Supabase dev project, plus a web preview deploy per pull request. The
  worker runs on demand on the owner's machine against staging.
- **production:** a Supabase prod project, the web on a static host, an always-on worker.
- Each environment has its own keys. The anon key and URL are build-time `VITE_*`
  variables. The service-role key exists only on the worker host and in CI's migration
  job.

### Web hosting
- A static SPA on a CDN-backed host, chosen in the hosting ADR (Cloudflare Pages,
  Netlify, Vercel or Supabase-adjacent hosting are the candidates; all fit the free or
  low tiers at this size).
- SPA fallback routing, immutable caching for hashed assets and no cache for
  `index.html`.
- **Security headers:**
  - CSP: `default-src 'self'`; `script-src 'self'` (no `unsafe-eval`; the Song validator
    is precompiled); `connect-src` limited to the Supabase project and the sample host;
    `media-src`/`img-src` as needed.
  - HSTS, `Referrer-Policy: strict-origin-when-cross-origin`,
    `Permissions-Policy: midi=(self)`, `X-Content-Type-Options: nosniff`.
- A custom domain with HTTPS.
- About page: Salamander CC-BY credit, and the privacy note (what's stored, the audio
  deletion promise, how to delete your account).

### Self-hosted samples (ADR 0004 follow-up)
- Piano (and P7 electric piano) samples are served from our own CDN path, versioned
  (`/samples/piano/v1/`), with long-lived cache headers. `VITE_PIANO_SAMPLES_URL` points
  there.
- Samples stay out of git (audio is gitignored). A deploy script fetches the pinned
  sample set by checksum and uploads it. The licence file goes with it.

### Worker hosting
- **A container image** (`pipeline/Dockerfile`): CUDA runtime base, ffmpeg, uv-installed
  pipeline, models downloaded at build or first start and verified by checksum, and a
  non-root user. Tagged with `pipelineVersion` and the git SHA.
- **Host:** decided in the hosting ADR. Recommended for this size: the owner's GPU PC
  through Docker Desktop with WSL2 GPU, auto-start on boot, with a cloud GPU on demand as
  the fallback. If the PC is off, jobs wait in the queue and the UI says "Analysis
  machine is offline; your song will be analysed when it's back". That needs a
  `worker_heartbeats` table (or a `profiles`-like row) that the web reads.
- **Resource limits:** memory and CPU caps; a wall-clock timeout per job (default 20 min)
  and per stage; ffmpeg run with `-nostdin` and limits on untrusted input.

### CI/CD (GitHub Actions)
- **On every PR:**
  - `pipeline/`: uv sync, ruff, ruff format check, pyright, `pytest -m "not slow"`
  - `web/`: install, lint, typecheck, test, build
  - schema: regenerate both type sets and fail on any diff
  - guards: rule 4/5/6/`api/` probe tests run as part of the test suites
  - pgTAP RLS tests on an ephemeral local stack
  - a grep that no audio file types or `.env` files are tracked (rule 8)
  - a web preview deploy against staging
- **On merge to `main`:** deploy web to production; apply migrations to production
  through `supabase db push` (an environment with manual approval); build and push the
  worker image to a private registry; the owner pulls it on the worker host (or
  Watchtower-style auto-update if the ADR picks it).
- **Golden eval:** stays local (it needs the owner's audio), and is required before a
  release that changes the pipeline (CLAUDE.md definition of done). The release notes
  link its report.
- Dependency audit: `pnpm audit` and `pip-audit` weekly, plus Dependabot or Renovate.

### Releases and rollback
- Pipeline versions follow semver and bump on any analysis change. The web version is
  the git SHA, shown in About.
- **Migrations are expand-then-contract:** a column is added and used before the old
  one is removed, so the web and worker can each be rolled back by one version.
- **Rollback:** redeploy the previous web build; re-run the previous worker image tag.
  Migrations go forward-only, with a written down-migration for emergencies.

### Observability (small and cheap)
- **Worker:** JSON logs with job id, stage, durations and error code; no audio, file
  names or titles at info level. Kept 14 days on the host.
- **Jobs:** an owner-only "Admin" view in the web (or saved SQL queries) showing queue
  depth, oldest queued job, failures by code over the last 7 days, and p50/p95 time per
  stage.
- **Web errors:** captured by a small handler into a `client_errors` table (rate-limited,
  no PII) or a hosted error tracker. Decided in the ADR with privacy in mind.
- **Alerts:**
  - an email to the owner when a job fails twice, the queue is older than 1 hour, or the
    worker heartbeat stops for 15 minutes
  - an uptime check on the web URL

### Backups and data rights
- Supabase's own backups (for the plan in use), plus a weekly `pg_dump` and a copy of the
  `songs` bucket to the owner's storage, encrypted. `uploads` is never backed up (rule 8).
- A restore drill into staging before launch, recorded in `docs/runbooks/`.
- Account deletion: an owner action (or self-service) that deletes the user's songs,
  sessions, storage objects and auth user. Tested.

### Runbooks — `docs/runbooks/`
Worker offline; job stuck or failing repeatedly; Supabase outage; sample host down;
rotate keys; restore from backup; delete a user's data; roll back a release; disk full on
the worker host.

## Needs owner approval before building

- **New ADR — hosting:** web host, worker host (owner's PC or cloud), image registry,
  error reporting, alert channel.
- **Costs:** a monthly budget and the plan tiers chosen (Supabase plan, host plan, domain,
  any cloud GPU). Cost formulas are in `docs/reference/capacity-planning.md`.
- **CI secrets and GitHub environments**, set up by the owner (Claude doesn't handle
  production keys).
- **A domain name.**
- **A CLAUDE.md update** for the new commands (deploy, worker image, runbooks).

## Out of scope

Autoscaling GPU workers, multiple regions, public sign-up, billing, native apps and
everything else in `docs/reference/scaling-roadmap.md` tiers T1 and above. The Carnatic
path (P10).

## Exit criteria

- [ ] Hosting ADR accepted; budget approved; secrets in place
- [ ] CI runs every check above on PRs and blocks merges on failure; a deliberate rule-4 probe in a PR fails CI
- [ ] Production web on the custom domain; security headers verified (no CSP violations while practising, uploading and calibrating)
- [ ] Samples served from our own path; the third-party sample host is no longer contacted
- [ ] A friend (not the owner) signs in, uploads, practises and sees results on production
- [ ] Worker offline → the UI says so; worker back → the queue drains
- [ ] Alerts fire in a test (a forced job failure; the worker stopped)
- [ ] Restore drill done and recorded; account deletion tested
- [ ] Rule 8 audit query on production: zero `uploads` objects older than 24 h, and no audio types in the `songs` bucket
- [ ] Runbooks written for every item listed
