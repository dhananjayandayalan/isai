---
id: adr-0015
title: Backend on Supabase, a jobs-table queue, invite-only magic links, the api/ boundary
status: accepted
date: 2026-11-15
phase: P8
supersedes: null
---

# 0015 — Backend on Supabase, a jobs-table queue, invite-only magic links, the api/ boundary

## Context

P8 adds accounts, uploads, a queue the owner's GPU machine drains, and a library with
practice history. The audience is ≤ 10 invited friends, so the backend must:
- cost nothing at this size
- have no server of ours to run beside the worker
- work locally in Docker before P9 hosts it
- keep uploaded audio only until its job ends (rule 8)

Practice stays entirely in the browser.

## Options considered

1. **Supabase** (Postgres, Auth, Storage, Realtime; free tier; a CLI with a local Docker
   stack).
   - **Pros:** row-level security keeps access rules in SQL, where pgTAP can test them.
     Signed URLs come built in. Realtime pushes job progress without polling (rule 6).
   - **Cons:** a large client library, and vendor-specific auth and storage APIs.
2. **Firebase.**
   - **Pros:** a similar feature set.
   - **Cons:** a document store and security rules don't fit the relational
     songs/jobs/sessions model well, and its local emulators are weaker for tests.
3. **Our own API** (for example FastAPI and Postgres on a VPS).
   - **Pros:** full control.
   - **Cons:** we'd write auth, uploads, signed URLs and push updates ourselves, and run
     a server. Too much for this audience.

**Queue:**
- **(a) A `jobs` table with leases** (`FOR UPDATE SKIP LOCKED`). One table holds the
  queue and the progress the UI shows, and it can be tested in SQL.
- **(b) Supabase Queues (pgmq).** Progress would still need a table.
- **(c) An external queue** (Redis or SQS). One more service, for a handful of jobs a day.

**Auth:** email magic links, with sign-up limited to an `invites` table. There are no
passwords to manage. The only cost is that a friend needs their email to sign in.

## Decision

- **Supabase for the backend, and queue (a).**
- **Sign-up is checked by a trigger on `auth.users`:** only invited emails get in.
- **Roles are `owner` and `member`.**
- **RLS is on for every table.** Only the worker uses the service role.
- **Songs are private by default,** with a per-song "Share with the group" toggle.
- **Job progress reaches the web through Realtime** subscriptions to the job row.
- **Only `web/src/api/` imports `@supabase/supabase-js`** (CLAUDE.md rule 10, enforced by
  ESLint), behind `AuthClient`, `SongStore`, `SessionStore`, `JobWatcher`,
  `UploadClient` and `PreferencesStore`.
- **The worker reaches Supabase only through `JobQueue`, `ObjectStore` and
  `SongRepository`.**
- **Without `VITE_SUPABASE_URL` the web runs in local mode,** as in P0–P7.

## Consequences

- Access rules live in migrations and are proven by pgTAP tests. Pages and the worker
  are tested with fakes.
- Current Supabase blocks deleting `storage.objects` rows straight from SQL. So the
  upload sweeper is split:
  - `pg_cron` requeues expired leases and fails queued jobs whose upload is over 24 h old.
  - The worker deletes upload objects over 24 h old through the Storage API, at start-up
    and every 10 minutes.
- Local development needs Docker Desktop and the Supabase CLI (a dev dependency in
  `web/`).
- Moving off Supabase later means swapping the `api/` and worker implementations, plus
  translating the RLS rules.
- P9 picks the hosted plan, keys and backups.
