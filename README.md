# Isai (இசை)

Isai turns a song's audio into something you can learn on piano: key, tempo, chords and a
playable two-hand arrangement, shown on an animated piano that follows your MIDI keyboard.

- **Training mode:** playback waits until you play the right notes.
- **Performance mode:** same engine, no waiting, scored on timing.

The project is in phase P0 (foundation): the Song contract, tooling and skeletons are in
place, and the audio pipeline and piano come in later phases. See `docs/spec/`.

## Layout

| Path | What |
|---|---|
| `schema/song.schema.json` | The Song JSON contract between pipeline and web. Source of truth. |
| `pipeline/` | Python: audio in, Song JSON + MIDI out. |
| `web/` | React + TypeScript app: piano, playback, training and performance modes. |
| `design/` | Design tokens, components and the clickable prototype. |
| `docs/spec/`, `docs/adr/` | Phased spec and architecture decision records. |
| `tests/golden/` | Reference songs and expected results for `/golden-eval`. |

## Prerequisites

- Python 3.11+ and [uv](https://docs.astral.sh/uv/)
- Node 20+ and pnpm

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
