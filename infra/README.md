# Infrastructure

Everything runs on free tiers: GitHub (code, CI) and Cloudflare (Worker, D1, R2). See spec v1.2 ADR-021 and `docs/spec/`.

| Environment | Worker | D1 | R2 bucket | Deployed by |
|---|---|---|---|---|
| dev (local) | `wrangler dev` | Miniflare, local | Miniflare, local | you |
| staging | `isai-edge-staging` | `isai-staging` | `isai-models-staging` | push to `main` |
| production | `isai-edge` | `isai-prod` | `isai-models` | manual dispatch + approval |

## One-time setup

1. **Cloudflare account.** Create a free account, then run `pnpm --filter @isai/edge exec wrangler login`.
2. **Enable R2** in the dashboard (R2 → Purchase/Enable). Cloudflare asks for a payment method; the free tier covers 10 GB and egress is free. Free-plan Workers and D1 stop at their limits rather than billing.
3. **Bootstrap each environment.** The script is idempotent: it creates D1 + R2, writes the D1 id into `wrangler.jsonc`, applies migrations, deploys, and sets a random `IP_SALT`.
   ```
   node infra/bootstrap.mjs --env staging
   node infra/bootstrap.mjs --env production
   ```
   Then commit `apps/edge/wrangler.jsonc`.
4. **CI deploy access.** Create an API token (My Profile → API Tokens → Custom) with *Account · Workers Scripts · Edit*, *Account · D1 · Edit* and *Account · Workers R2 Storage · Edit*. Then:
   ```
   gh secret set CLOUDFLARE_API_TOKEN
   gh secret set CLOUDFLARE_ACCOUNT_ID --body <account id>
   gh variable set WORKERS_SUBDOMAIN --body <your-subdomain>   # <x>.workers.dev
   gh variable set CLOUDFLARE_READY --body true
   ```
   In GitHub → Settings → Environments, create `staging` and `production`. Give `production` a required reviewer.

## Secrets

| Name | Where | Purpose |
|---|---|---|
| `IP_SALT` | Worker secret (per env), `.dev.vars` locally | Salt for hashing client IPs in cache submissions |
| `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `GOOGLE_AI_API_KEY`, `OPENROUTER_API_KEY` | Worker secrets (Phase 2) | Teacher providers, see `apps/edge/providers.json` |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub secrets | CI deploys |

Set or rotate a Worker secret with `pnpm --filter @isai/edge exec wrangler secret put <NAME> --env <env>`. The new value applies immediately. Provider keys never go in client code, `providers.json` or git.

## Models

Model files are immutable and versioned: `models/<name>/<x.y.z>/<file>` in R2, listed in `models/manifest.json` with sha256. Clients verify the hash after download.
```
node infra/publish-model.mjs --env staging --name beat-this --version 0.1.0 --file engine/export/out/beat_this.onnx
```
They're served from `https://<worker>/models/...` with CORS and `Cache-Control: immutable`.

## Shared cache rules

- `PUT /cache/:fingerprint` only records a submission per install (`X-Isai-Install` UUID). It's rate-limited to 10 per minute per install.
- `GET` serves the document submitted identically from the most distinct networks, and only once at least 2 agree. One client can't poison the cache, and an honest majority wins later.
- There is no endpoint that accepts audio (ADR-013).
