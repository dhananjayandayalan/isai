---
id: adr-0016
title: Hosting for the friends group — web, worker, registry, errors and alerts
status: proposed
date: 2026-11-15
phase: P9
supersedes: null
---

# 0016 — Hosting for the friends group

## Context

P9 puts Isai in production for the owner and ≤ 10 invited friends (tier T0 in
`docs/reference/scaling-roadmap.md`).
- **Practice is a static SPA:** the browser does everything.
- **Analysis needs a GPU** for minutes per upload, a handful of times a day.
- **The backend is Supabase** (ADR 0015).

The constraints:
- cost close to zero
- nothing for the owner to babysit
- no audio kept anywhere (rule 8)
- a strict CSP (`script-src 'self'`, no `unsafe-eval`)
- production keys handled only by the owner

## Options considered

**Web host** (static files, `_headers`, SPA fallback, custom domain, HTTPS, preview per PR):

| Host | Pros | Cons |
|---|---|---|
| **Cloudflare Pages** | Free with unlimited bandwidth; reads `_headers` and `_redirects`; preview deploys; the domain can live on Cloudflare too | Another account for the owner |
| Netlify | Same file conventions; free tier | Its bandwidth cap (100 GB) is irrelevant at this size, but it is a cap |
| Vercel | Good previews | Headers go in `vercel.json` (a second format); the hobby tier is for non-commercial use only |

**Worker host:**

| Host | Pros | Cons |
|---|---|---|
| **The owner's GPU PC** (Docker Desktop, WSL2 GPU, auto-start) | Free; the GPU already runs the golden set | Off when the PC is off: jobs wait, and the UI says so (heartbeat) |
| A cloud GPU on demand (RunPod, Modal and similar) | Always there | Roughly $0.2–0.5 per GPU hour plus set-up; a fallback, not the default |
| An always-on cloud GPU | Simplest to reason about | Hundreds of dollars a month for minutes of use a day |

**Image registry:** GitHub Container Registry (private, free with the repo), or Docker Hub
(one private repo free).

**Web errors:**
- (a) **A `client_errors` table in Supabase:** rate-limited, no PII, read on the Admin page.
- (b) A hosted tracker (Sentry).
  - Pros: better grouping and stack traces.
  - Cons: a third party receiving browser data, and a CSP `connect-src` entry.

**Alerts:**
- (a) **A scheduled GitHub Actions check every 15 minutes:** runs `isai admin check` and
  `curl`s the site, and fails when something is wrong. GitHub emails the owner about failed
  runs. No new service.
- (b) An uptime service (Better Stack and similar) plus Supabase webhooks to email.

**Backups:** Supabase's own (the free plan has none you can restore yourself; Pro has
daily). Plus a weekly `isai admin backup` on the worker PC: `pg_dump` and the `songs`
bucket, encrypted with `gpg --symmetric`, kept on the owner's disk and one cloud folder.

## Decision (proposed)

- **Cloudflare Pages** for the web.
- **The owner's GPU PC** for the worker, with a cloud GPU on demand only if friends are
  often waiting.
- **GHCR** for the image.
- **The `client_errors` table** for errors.
- **The scheduled GitHub Actions check** for alerts.
- **Supabase Free** while the data is small, plus the weekly encrypted backup. Move to Pro
  ($25/month) when losing a week of sessions would matter.

The expected monthly cost:
- **$0**, plus the domain (about $10–15 a year).
- **$25** with Supabase Pro.

## Consequences

- When the PC is off, analysis stops. The heartbeat makes that visible, and the queue
  drains when it's back.
- Production keys live in two places only: the worker PC's `.env` and the GitHub
  `production` environment (for `supabase db push`). The owner creates both.
- Free Supabase projects pause after a week without activity. The scheduled check counts
  as activity.
- Moving the web to another host means translating `_headers` and `_redirects`; moving the
  worker means running the same image elsewhere.
- **The owner decides before deploying:** this ADR, the budget, the domain, the GitHub
  repo and its environments.
