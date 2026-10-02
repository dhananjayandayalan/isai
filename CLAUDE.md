# Isai (இசை) — build constraints

Chord & key learning platform. The source of truth is `docs/spec/Isai-Architecture-Spec-v1.2.docx`: §5 holds ADR-001–015 and §10 holds ADR-016–021. Don't change any constraint below without a new ADR.

## Architecture in one paragraph
Audio stays on the device. `packages/engine` (TypeScript + ONNX Runtime, in a worker) produces one versioned **AnalysisDocument**. `packages/theory` projects it into five notations on the client. One explain-only LLM role (the Teacher) is reached through the edge proxy in `apps/edge`; it adds commentary. `engine/` (Python 3.11) is the research reference and benchmark harness and is never shipped.

## Hard rules
- **No audio leaves the device or is stored. Ever** (ADR-013). Network payloads are JSON only.
- **LLMs never originate musical facts** (ADR-018/019). Chords, key, beats, sections, numerals and voicings are computed. Reject any Teacher output that names a chord absent from its input or candidate set.
- **LLM output is schema-validated JSON and is never load-bearing** (ADR-012). Every LLM-derived field is nullable, and the UI must work with it null.
- **Provider keys never ship in a client** (ADR-021). Model and provider names live only in `providers.json`.
- **One AnalysisDocument and no client-side musical recomputation** (ADR-008). Notations are pure functions of pitch class + key in `packages/theory`.
- **Share logic and tokens, not components**, between web/desktop and mobile (ADR-011).
- **Radix primitives + the owned token layer. No styled component libraries** (ADR-014).
- **Naming is English or Tamil, never Sanskrit-derived.** Tradition terminology (Sa, Ri, Ga…) stays native (ADR-015).
- **Proposed chords must look different from detected ones** (§7.3: confident / uncertain / proposed, not by colour alone).

## Engines
- `engine/`: Python **3.11 exactly** (ADR-002). Don't adopt Essentia, madmom or autochord (ADR-003/004/005).
- `packages/engine`: ONNX via onnxruntime-web (WebGPU → WASM) and onnxruntime-react-native. Download models lazily; never commit them.
- **Parity:** the TS engine stays within 2 points of the Python engine on the benchmark. Beat times stay within ±20 ms on the fixtures.
- Separation: HPSS is the default. Demucs-ONNX is desktop-only and opt-in (ADR-020). The separation mode is part of the cache key.

## Phase gates
No phase starts before the previous one meets its exit gate (spec §6 + §10.8). Current phase: **0 — Foundation**. Spikes S1–S4 (`docs/spikes/`) gate ADR-016/017.

## Layout
`engine/` research · `packages/{engine,theory,schema,tokens,api-client}` shared · `apps/edge` Cloudflare Worker · `apps/{web,desktop,mobile}` clients (scaffolded in their phases) · `infra/` bootstrap + publishing scripts.

## Infrastructure (details: `infra/README.md`)
- Environments: dev (local Miniflare) → staging (auto on push to `main`) → production (manual dispatch + approval).
- Cloudflare free tier only: Worker `apps/edge`, D1 (`documents`, `submissions`, `teaching`, `usage_daily`), R2 for models. No KV.
- Schema changes go through new files in `apps/edge/migrations/`; never edit an applied migration.
- After changing `wrangler.jsonc`, run `pnpm --filter @isai/edge exec wrangler types` and commit `worker-configuration.d.ts`.
- **Shared cache:** never serve a single client's submission. A document is served only when ≥ 2 distinct networks agree (anti-poisoning).
- Model files are immutable and versioned (`models/<name>/<x.y.z>/`), published with `infra/publish-model.mjs`, and verified by sha256 from `models/manifest.json`.
- Secrets: `wrangler secret put` per env and `.dev.vars` locally (gitignored). Never put them in code, config or commits.

## Commands
- `pnpm install`, then `pnpm check` (typecheck + tests for every package via Turborepo)
- Edge: `pnpm --filter @isai/edge dev` (local), `pnpm --filter @isai/edge test`
- Engine: `cd engine && py -3.11 -m uv sync`, then `py -3.11 -m uv run pytest` and `py -3.11 -m uv run ruff check .`
