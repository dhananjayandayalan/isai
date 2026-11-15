# Runbooks

What to do when something breaks in production, and how production is set up. Sized for the
friends group (ADR 0016): one Supabase project, the web on Cloudflare Pages, and one worker
on the owner's GPU PC. Every command runs from the repo root unless it says otherwise.

| Runbook | When |
|---|---|
| [worker-offline.md](worker-offline.md) | "The analysis machine is offline" shows, or the alert says `worker_silent` |
| [job-stuck-or-failing.md](job-stuck-or-failing.md) | A song stays "Analysing", or `job_failed_twice` / `queue_old` alerts |
| [supabase-outage.md](supabase-outage.md) | Sign-in, the library or uploads fail for everyone |
| [sample-host-down.md](sample-host-down.md) | The piano sounds like a simple synth |
| [rotate-keys.md](rotate-keys.md) | A key may have leaked, or on a schedule |
| [restore-from-backup.md](restore-from-backup.md) | Data was lost or damaged; also the restore drill |
| [delete-user-data.md](delete-user-data.md) | A member asks to be deleted, or leaves |
| [roll-back-a-release.md](roll-back-a-release.md) | A release broke something |
| [disk-full.md](disk-full.md) | The worker PC runs out of space |

## Production setup (once, by the owner)

None of this is in the repo. Claude doesn't handle production keys.

1. **Supabase:** create the production project (and a staging one for previews and the
   drill). Under Authentication, set the site URL to the production domain and add it to
   the redirect URLs. Take the URL and anon key (public), the service-role key (secret), the
   database password and the project ref.
2. **Cloudflare:** create a Pages project (direct upload) and an API token with
   "Cloudflare Pages: Edit". Add the custom domain to the project; HTTPS is automatic.
3. **GitHub:** push the repo, then add:
   - Branch protection on `main`: require the CI checks.
   - Repository variables: `DEPLOY_ENABLED=true`, `WATCH_ENABLED=true`,
     `CF_PAGES_PROJECT`, `CLOUDFLARE_ACCOUNT_ID`.
   - Environment `production` (with you as required reviewer): variables `SUPABASE_URL`,
     `SUPABASE_ANON_KEY`, `SUPABASE_PROJECT_REF`; secrets `CLOUDFLARE_API_TOKEN`,
     `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`.
   - Environment `staging`: `SUPABASE_URL` and `SUPABASE_ANON_KEY` of the staging project,
     and the secret `CLOUDFLARE_API_TOKEN`.
   - Environment `production-watch` (no reviewers, so the schedule isn't blocked):
     variables `SITE_URL` and `SUPABASE_URL`; the secret `SUPABASE_SERVICE_KEY`.
   - Settings > Notifications: email on failed Actions runs (this is the alert channel).
4. **Worker PC:** install Docker Desktop (WSL2 backend), enable "Start when you sign in"
   and GPU support, then log in to GHCR (`docker login ghcr.io` with a token that can read
   packages). Create `ops/worker/.env` with `ISAI_SUPABASE_URL`,
   `ISAI_SUPABASE_SERVICE_KEY` and `ISAI_WORKER_ID`, then run
   `docker compose -f ops/worker/compose.yaml up -d`.
5. **Invites:** add yourself with the `owner` role in the `invites` table, then your friends.
6. **Backups:** schedule `isai admin backup` weekly on the worker PC (Task Scheduler), as in
   [restore-from-backup.md](restore-from-backup.md).

## Where things are

- Worker logs: `docker compose -f ops/worker/compose.yaml logs --tail 200 worker` (JSON
  lines, kept about 14 days).
- The Admin page in the web app (owner only): queue, failures, stage times, workers, web
  errors.
- `uv run isai admin check` (from `pipeline/`, with the production keys in the
  environment): the same checks the alert runs.
