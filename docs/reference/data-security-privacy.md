# Data, security and privacy at scale

What has to be true about data handling, access control and privacy before Isai serves
people the owner doesn't know personally. Assumes the P8 backend (Supabase: Auth,
Postgres with RLS, Storage) and the P9 deployment.

This is engineering guidance, not legal advice. Before public sign-up, have a lawyer
review the privacy and children's-data points for the countries you serve.

## 1. What Isai stores

| Data                      | Where                                   | Personal?                                                       | Retention                                                    |
| ------------------------- | --------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| Email, display name, role | `auth.users`, `profiles`                | yes                                                             | until account deletion                                       |
| Uploaded audio            | `uploads` bucket                        | possibly (a recording of the user's own voice is personal data) | **minutes**: deleted after the job; swept at 24 h (rule 8)   |
| Stems and stage cache     | worker temp disk                        | same as the audio                                               | deleted per job                                              |
| Song JSON and MIDI        | `songs` bucket and `songs` rows         | linked to a user; a title may reveal tastes                     | until the user deletes the song or the account               |
| Practice sessions         | `sessions`                              | yes (behavioural)                                               | policy needed by T2 (e.g. 1 year in detail, then aggregates) |
| Settings, preferences     | browser storage, `profiles.preferences` | low                                                             | until deletion                                               |
| Logs and client errors    | worker host, `client_errors`            | must contain no PII                                             | 14–30 days                                                   |

Raw MIDI performances (every key press) are **not stored** (P6). Keep it that way unless
there is a feature that needs them and a consent step to go with it.

## 2. Rule 8 at scale

"No song audio in git or public storage; the worker deletes uploaded audio after
processing" has to stay true with many workers, retries and crashes.

- Deletion happens in the worker's `finally` block **and** in the 24 h sweeper. Neither
  alone is enough.
- When stages split across services (T3), each stage's intermediate audio has its own
  short TTL, and each service deletes what it created.
- **Backups never include `uploads`** or any worker scratch space. Check the backup
  configuration when changing the backup method.
- **Logs never include audio, file names or upload URLs.** Signed URLs in logs are
  credentials.
- **Weekly audit query:** objects in `uploads` older than 24 h (must be 0); objects in
  `songs` with an audio MIME type or extension (must be 0). Alert on non-zero.
- Re-analysis is impossible after deletion. Product decisions that look like they need
  stored audio (a better model reprocessing old songs, "fix this song" support) must
  ask the user to upload again. Never quietly keep audio.

## 3. Access control

- **RLS is the security boundary**, not the UI. Every table has RLS on, and every policy
  has pgTAP tests in CI (P8/P9). New tables without policies fail a CI check
  (`select … from pg_tables where rowsecurity = false` in the public schema).
- **Service role only on servers:** the worker and migration CI. Never in the browser,
  never in a client-side env var, never in logs. Rotate it on any suspected leak (runbook,
  P9).
- **Storage paths carry the owner:** `{user_id}/…`. Storage policies check the prefix
  against `auth.uid()`.
- **Signed URLs are short-lived** (≤ 10 min for reads; upload URLs single-use).
- **Sharing (if enabled in P8):** a `shared` flag plus group membership in RLS. Public
  links (anyone with the URL) are a separate decision with copyright implications
  (see public-launch.md).
- **Admin access:** the owner role reads aggregate views, not other users' practice
  history, unless a support case needs it and the user agrees. From T2, admin actions go
  in an audit log table.
- **Teachers and students (if built):** an explicit `class_members` relation with
  consent from the student (or parent). Never "teacher can read everything".

## 4. The worker handles untrusted files

Decoding arbitrary uploaded media is the biggest attack surface in the system. ffmpeg and
audio libraries have had memory-safety bugs.

- Run ffmpeg and decoding in the worker container as a non-root user, with CPU, memory,
  time and file-size limits. Use `-nostdin`, an explicit input format allowlist, and no
  network protocols (`-protocol_whitelist file,pipe`).
- Give the decode step **no secrets**. The service-role key lives in the parent process
  that talks to Supabase, not in the environment of the decode subprocess.
- Check type by content (`ffprobe`), not only by extension or MIME type.
- Keep ffmpeg and the base image patched (weekly image rebuild in CI from T1).
- From T3, decode in a separate sandbox (gVisor, Firecracker or a separate minimal
  container) before any model sees the PCM.

## 5. Abuse and limits

| Risk                                          | Control                                                                                                                       | From tier |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| A user floods the queue                       | per-user daily or monthly upload quota; fair claiming                                                                         | T1        |
| Non-music uploads (storage misuse)            | size and duration limits; files are deleted after processing anyway; silent or non-music files fail fast (exit codes from P3) | T0        |
| Bot sign-ups                                  | invite-only until T3; then CAPTCHA, email verification, rate limits per IP                                                    | T3        |
| Credential stuffing                           | magic links or OAuth (no passwords); auth rate limits                                                                         | T0        |
| Scraping other users' songs                   | RLS; non-guessable ids (UUID v4 or v7); no listing endpoints without RLS                                                      | T0        |
| Expensive client-side denial (huge Song JSON) | schema-validated limits: max notes, max duration, enforced in the pipeline and checked in the web                             | T2        |

## 6. Privacy law (check with a lawyer before T3)

- **India: Digital Personal Data Protection Act, 2023**, likely relevant given the
  audience:
  - notice and consent for processing
  - purpose limitation and data minimisation (rule 8 already helps)
  - the rights to access, correct and erase
  - a grievance contact
  - **verifiable parental consent for anyone under 18**
- **EU/UK GDPR**, if EU or UK users are served: a lawful basis, a privacy notice,
  data-processing agreements with processors (Supabase, the hosting provider, the GPU
  provider, the email provider), records of where data is stored, and breach
  notification duties.
- **US COPPA**, if children under 13 in the US are targeted or known to use it.

Piano learners are often children. Before opening to the public, decide one of:

- adults only, with an age confirmation at sign-up
- a parent or teacher account that manages child profiles with parental consent

Don't leave it to chance.

**Practical steps:**

- A privacy page in plain language: what's stored, the audio deletion promise, retention,
  processors, contact.
- Self-service export (Song JSON, MIDI, sessions as JSON) and deletion (P9 has deletion).
- Data region: choose the Supabase and GPU regions consciously and document them.
  Processing audio on a GPU provider in another country is a data transfer.
- Analytics: privacy-friendly and aggregate-only, or none. No third-party ad trackers.

## 7. Schema and data evolution with many stored Songs

- Stored Songs span many `schemaVersion`s. The web keeps loading every supported version
  (the P3 schema-evolution ADR). Each migration is a pure JSON transform, tested on frozen
  fixtures of each version.
- At T2+, consider a background job that upgrades stored Song JSON to the latest schema
  (it's a JSON transform, no audio needed). Keep the original until the new one validates.
- `pipelineVersion` differences can't be "upgraded". The analysis is as good as the
  pipeline that ran it. The UI can say "analysed with an older version; upload again for
  improvements".

## 8. Security checklist by tier

| Item                                                  | T0–T1         | T2  | T3+             |
| ----------------------------------------------------- | ------------- | --- | --------------- |
| RLS on every table, pgTAP-tested in CI                | ✓             | ✓   | ✓               |
| CSP without `unsafe-eval`; security headers           | ✓             | ✓   | ✓               |
| Secrets only on servers; rotation runbook             | ✓             | ✓   | ✓               |
| Dependency and image scanning weekly                  | ✓             | ✓   | ✓               |
| Upload quotas, per-user fairness                      |               | ✓   | ✓               |
| Admin audit log; MFA for admin accounts               |               | ✓   | ✓               |
| Sandboxed decode                                      |               |     | ✓               |
| External penetration test                             |               |     | ✓ before launch |
| Incident response plan with breach notification steps | basic runbook | ✓   | ✓               |
