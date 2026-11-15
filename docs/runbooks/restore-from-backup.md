# Back up, and restore from a backup

## The weekly backup (worker PC)

`isai admin backup` writes one archive:
- the database rows (`public.*` and the auth users), dumped with the Supabase Postgres
  image's `pg_dump`
- the `songs` bucket

It is encrypted with gpg. `uploads` is never backed up (rule 8).

```powershell
# pipeline/.env holds ISAI_SUPABASE_URL, ISAI_SUPABASE_SERVICE_KEY and ISAI_DATABASE_URL
# (Project Settings > Database > connection string, session pooler, with the password).
$env:ISAI_BACKUP_PASS = "<from your password manager>"
cd pipeline
uv run isai admin backup --out D:\isai-backups --passphrase-env ISAI_BACKUP_PASS
```

Schedule it weekly in Task Scheduler. Keep the last 8 archives, plus a copy of the newest
in a cloud folder. Needs Docker running, and gpg (Git for Windows includes it).

## Restore

The target must have the migrations applied and no members yet. Restore into a new project
(or staging), then switch the app to it. Restoring over a live project with members would
clash.

1. **Create the project** and apply the migrations:
   `pnpm --dir web exec supabase link --workdir .. --project-ref <ref>`, then
   `supabase db push --workdir ..`.
2. **Load the backup.** Point `pipeline/.env` at the new project, then:
   `uv run isai admin restore <archive>.tar.gz.gpg --passphrase-env ISAI_BACKUP_PASS`.
   It runs in one transaction with triggers off, then uploads the Song files.
3. **Check:** sign in as yourself, open a song, and see its sessions. The Admin page shows
   the members.
4. **Switch:**
   - Update the production variables and secrets to the new project.
   - Redeploy the web.
   - Update the worker's `.env` and restart it.
   - Add the production URL to Auth's redirect URLs.

## Drill log

| Date | Where | Result |
|---|---|---|
| 2026-11-15 | Local stack | Seeded a member, a song, a session and its file; encrypted backup; `db reset`; restore. Profile, auth user, song, session, Song file and invite all came back. |
| _before launch_ | Staging | To do (P9 exit criterion) |
