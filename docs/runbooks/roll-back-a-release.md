# Roll back a release

Releases go out when `main` changes: the migrations (after your approval), then the web and
the worker image. Each piece can go back one version on its own, because migrations are
expand-then-contract: a column is added and used before an old one is removed.

**Web:** in the Cloudflare Pages project, open Deployments, pick the previous production
deployment, and choose "Rollback to this deployment". It takes effect at once. The About
page shows the version (git SHA).

**Worker:** images are tagged with the git SHA and the pipeline version.

```sh
# in ops/worker/.env or the shell
ISAI_WORKER_IMAGE=ghcr.io/<owner>/isai-worker:<previous-sha>
docker compose -f ops/worker/compose.yaml up -d
```

The first stop signal lets the current job finish. The queue carries on with the old image.

**Database:** migrations are forward-only. To undo one:
1. Write a new migration that reverses it, test it locally (`pnpm db:reset`, `pnpm db:test`),
   and release it like any other.
2. In an emergency, apply a hand-written down-migration in the SQL editor, then commit the
   same SQL as a migration so the history matches.
3. If data was damaged, see [restore-from-backup.md](restore-from-backup.md).

**Then:** revert the commit on `main` (`git revert`), so the next release doesn't bring it
back.
