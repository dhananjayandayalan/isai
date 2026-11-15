# Rotate keys

Do this at once if a key may have leaked (pasted somewhere, a lost laptop), and otherwise
yearly.

| Key | Where it lives | Leaked means |
|---|---|---|
| Supabase service-role key | `ops/worker/.env` on the worker PC; the `production-watch` secret | Full access to the database and storage: rotate now |
| Supabase anon key | The web build (public by design) | Nothing; RLS protects the data. Rotate only together with the JWT secret |
| Database password | The `production` environment secret | Direct database access: rotate now |
| Supabase access token | The `production` environment secret | Your Supabase account: revoke it in the account settings |
| Cloudflare API token | `production` and `staging` secrets | Deploys to your Pages project: roll it in the Cloudflare dashboard |
| Backup passphrase | Your password manager | Old backups are readable: start a new passphrase, and delete old archives once a new backup exists |

**Service-role key (and the anon key):**
1. In the dashboard: Project Settings > API (JWT keys), and roll the keys. Old keys stop
   working.
2. Update `ops/worker/.env`, then `docker compose -f ops/worker/compose.yaml up -d`
   (it restarts with the new key).
3. Update the `production-watch` secret `SUPABASE_SERVICE_KEY`.
4. If the anon key changed, update `SUPABASE_ANON_KEY` in `production` and `staging`, and
   redeploy the web (signed-in users sign in again).
5. Run `isai admin check` with the new key to confirm.

**Database password:** Project Settings > Database > reset the password, then update
`SUPABASE_DB_PASSWORD` (and `ISAI_DATABASE_URL` wherever backups run).
