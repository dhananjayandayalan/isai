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

MIDI keyboards work in Chrome, Edge and Firefox (Web MIDI). Safari has no Web MIDI; the
page still plays songs there.

### Piano sound

The piano uses the [Salamander Grand Piano](https://archive.org/details/SalamanderGrandPianoV3)
samples by Alexander Holm (CC-BY 3.0), loaded at runtime from the copy Tone.js hosts at
`https://tonejs.github.io/audio/salamander/`. To use another copy, set
`VITE_PIANO_SAMPLES_URL` (a folder URL ending in `/`, with the same file names) in
`web/.env.local`. If the samples can't be loaded, Isai plays a simple synth instead.

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
