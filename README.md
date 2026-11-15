# Isai (இசை)

Isai turns a song's audio into something you can learn on piano: key, tempo, chords and a
playable two-hand arrangement, shown on an animated piano that follows your MIDI keyboard.

- **Training mode:** playback waits until you play the right notes.
- **Performance mode:** same engine, no waiting, scored on timing.

The project is in phase P1 (playback): the web app plays a Song on a sampled piano with an
animated keyboard and shows your MIDI keyboard's notes. The audio pipeline, training and
performance modes come in later phases. See `docs/spec/`.

## Layout

| Path | What |
|---|---|
| `schema/song.schema.json` | The Song JSON contract between pipeline and web. Source of truth. |
| `pipeline/` | Python: audio in, Song JSON + MIDI out. |
| `web/` | React + TypeScript app: piano, playback, training and performance modes. |
| `supabase/` | Backend (P8): migrations, seed and pgTAP tests for the local Supabase stack. |
| `design/` | Design tokens, components and the clickable prototype. |
| `docs/spec/`, `docs/adr/` | Phased spec (architecture, P0–P10) and architecture decision records. |
| `docs/reference/` | Reference for scaling beyond the friends group: tiers, capacity, security, operations, launch. |
| `tests/golden/` | Reference songs and expected results for `/golden-eval`. |

## Prerequisites

- Python 3.11+ and [uv](https://docs.astral.sh/uv/)
- Node 20+ and pnpm
- For accounts, uploads and the library (P8): Docker Desktop, running

## Pipeline

```sh
cd pipeline
uv sync
uv run pytest                      # all tests; -m "not slow" skips model tests
uv run ruff check . && uv run ruff format --check .
uv run pyright
uv run isai analyse <file> --out <dir>
```

## Web

```sh
cd web
pnpm install
pnpm dev                           # http://localhost:5173
pnpm test --run
pnpm lint && pnpm typecheck && pnpm build
```

MIDI keyboards work in Chrome, Edge and Firefox (Web MIDI). Safari has no Web MIDI; the
page still plays songs there.

### Piano sound

The piano uses the [Salamander Grand Piano](https://archive.org/details/SalamanderGrandPianoV3)
samples by Alexander Holm (CC-BY 3.0), loaded at runtime from the copy Tone.js hosts at
`https://tonejs.github.io/audio/salamander/`. To use another copy, set
`VITE_PIANO_SAMPLES_URL` (a folder URL ending in `/`, with the same file names) in
`web/.env.local`. If the samples can't be loaded, Isai plays a simple synth instead.

## Accounts, uploads and the library (local full stack)

Without a backend the web app runs in local mode (example songs, opening `.song.json`
files, sessions in this browser). With the local Supabase stack it adds invite-only
sign-in, uploads, the analysis queue and the library (ADR 0015).

1. **Start the stack** (Docker Desktop must be running; the first start pulls images):

   ```sh
   cd web
   pnpm db:start                   # Supabase CLI, a dev dependency; Studio at http://127.0.0.1:54323
   pnpm db:status                  # shows API_URL, ANON_KEY, SERVICE_ROLE_KEY
   ```

   `pnpm db:reset` re-applies `supabase/migrations/` and `supabase/seed.sql`;
   `pnpm db:test` runs the pgTAP tests; `pnpm db:stop` stops it.

2. **Invite yourself.** `supabase/seed.sql` invites `owner@example.com` (owner) and
   `friend@example.com`. Add your own address in Studio (table `invites`, role `owner`) or
   with SQL. Sign-in emails go to Mailpit at http://127.0.0.1:54324, not a real inbox.

3. **Web:** put the stack's URL and anon key in `web/.env.local` (never committed):

   ```sh
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_ANON_KEY=<ANON_KEY from pnpm db:status>
   ```

   then `pnpm dev`. Never put the service-role key in a `VITE_` variable.

4. **Worker:** copy `pipeline/.env.example` to `pipeline/.env` and set
   `ISAI_SUPABASE_SERVICE_KEY` to the stack's `SERVICE_ROLE_KEY`, then:

   ```sh
   cd pipeline
   uv run isai worker              # processes the queue; Ctrl+C finishes the current job
   uv run isai worker --once       # one job, then exit
   uv run isai worker sweep        # delete uploads older than 24 h, then exit
   ```

   The worker deletes each upload when its job ends (rule 8) and sweeps anything older
   than 24 hours at start-up and every 10 minutes.

5. **End to end:** with the stack running, `pnpm test:e2e` (in `web/`) signs in test users,
   uploads a synthesised recording, runs `isai worker --once` and checks the result.

## Production (P9)

Hosting is proposed in ADR 0016: Cloudflare Pages for the web, the owner's GPU PC for the
worker (Docker), Supabase for the backend. The one-time setup, the secrets and every runbook
are in [`docs/runbooks/`](docs/runbooks/README.md). What the repo provides:

- `pnpm build:site` (in `web/`): the production build with a strict CSP, the SPA fallback,
  and the piano samples served by the site itself, checked against `samples.lock.json`.
- `pipeline/Dockerfile` and `ops/worker/compose.yaml`: the worker image and how it runs on
  the PC (GPU, restarts, memory caps, about 14 days of logs).
- `.github/workflows/`: CI on every pull request, plus deploy, a 15-minute production watch
  and a weekly dependency audit, all off until the owner enables them.
- `uv run isai admin check | delete-user | backup | restore` (in `pipeline/`): alerts and
  the rule 8 audit, deleting a member, and encrypted backups. Backup and restore also need
  `ISAI_DATABASE_URL` (the project's Postgres connection string) and Docker.

## Changing the Song contract

Edit `schema/song.schema.json`, then regenerate both type sets:

```sh
pnpm --dir web gen:types
uv run --directory pipeline gen-models
```

Never edit `web/src/generated/` or `pipeline/src/isai/generated/` by hand.

## Audio

Song audio never goes into git or public storage. Keep reference audio for the golden set
on your own machine; see `tests/golden/README.md`.
