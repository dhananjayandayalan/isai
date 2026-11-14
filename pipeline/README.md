# Isai pipeline

Song audio in, Song JSON and MIDI out. See the root `README.md` for the commands that set
up and check every package.

## Needs

- Python 3.11+ and [uv](https://docs.astral.sh/uv/) (`uv sync` installs the rest).
- **ffmpeg 6 or newer on `PATH`** (it decodes every audio format). On Windows,
  `winget install Gyan.FFmpeg`; on macOS, `brew install ffmpeg`; on Debian or Ubuntu,
  `sudo apt install ffmpeg`. `ISAI_FFMPEG` and `ISAI_FFPROBE` point at the executables
  if they aren't on `PATH`. Tests that need ffmpeg skip, with that reason, when it's missing.
- **torch, for the models (P4)**, as one of two extras:
  - `uv sync --extra cuda` on a machine with an NVIDIA GPU (torch from the CUDA 13.0
    index, about 3 GB; needs a driver that supports CUDA 13, e.g. 580 or newer);
  - `uv sync --extra cpu` anywhere else (about 900 MB).

  A plain `uv sync` *removes* torch again, so always pass the extra when you sync;
  `uv run` leaves it alone. Without torch everything but the model stages works, and the
  fast tests run on fake models.
- **The model weights**, once: `uv run isai models fetch` (about 510 MB into
  `~/.cache/isai/models/`, or `ISAI_MODEL_DIR`). Each file is checked by SHA-256.
  `uv run isai models list` shows what's there and each model's licence. Analysis never
  downloads; a missing model exits 7 with the command to run.

  | Model | For | Licence |
  |---|---|---|
  | `hdemucs` (torchaudio Hybrid Demucs, MUSDB-HQ + extra) | full-mix separation | MIT |
  | `piano-bytedance` (Kong et al. 2021) | piano notes, velocities, pedal | CC BY 4.0 |
  | torchcrepe "full" (inside the package) | melody and bass pitch | MIT |

## Analyse a song

```
uv run isai analyse song.mp3 --type full-mix --out out/
```

writes `out/song.song.json` (Song schema 0.3.0) and `out/song.mid` (tempo map, time and
key signature, right and left hand). The Song has beats, downbeats, tempo, time
signature, key, mode, scale, confidences and notes (chords come in P5):

| `--type` | Stages | Notes in the Song |
|---|---|---|
| `piano-solo` | rhythm, tonality, piano transcription, key from notes, hands | the piano part in two hands |
| `full-mix` | separation, rhythm, tonality (bass + other), melody (vocal stem), bass line, key from notes | the vocal melody, right hand (the bass line is cached for P5's left hand) |
| `a-cappella` | rhythm, tonality, melody, key from notes, `tonicHz` | the sung melody, right hand |

| Flag | |
|---|---|
| `--type` | required: `piano-solo`, `full-mix` or `a-cappella` (`carnatic` comes later) |
| `--title` | the Song's title (default: the file name) |
| `--id`, `--created-at` | fix the Song's id and creation time (ISO 8601 with a UTC offset, like `2026-11-14T10:00:00+05:30`); with both, the same audio gives byte-identical output |
| `--cache-dir` | where stage outputs are cached (default `.cache/`, gitignored) |
| `--no-cache` | run every stage afresh |
| `--from-stage <stage>` | re-run that stage and the ones after it: `separate`, `rhythm`, `tonality`, `piano`, `melody` or `bass` |
| `--device auto\|cpu\|cuda` | where the models run (default `auto`: the GPU when torch sees one) |
| `--keep-stems` | full-mix: also write the four stems to `<out>/stems/` as WAVs. For local listening only; without it no audio leaves `.cache/` (rule 8), and the worker never passes it |
| `--log-json` | one JSON line per stage on stderr, with its timing, whether it came from the cache, and a `detail` of what it found (rhythm: tracker, bpm, beats per bar, stability, stable; tonality: key, mode, confidence, tuning) |

Exit codes: 0 done, 1 invalid Song, 2 missing input or bad arguments, 3 schema not found,
4 decode failed (or no ffmpeg), 5 longer than 12 minutes or bigger than 100 MB, 6 silent,
7 torch or a model is missing (or fails its checksum).

## The cache

Each stage's output goes to `.cache/<audio-hash>/<stage>-<version>-<key>/`, where the key
covers the stage's options and the stage before it. Changing a stage re-runs it and the
stages after it only. The hash is of the decoded audio and is never stored in the Song.
The `separate` stage caches the four stems (about 85 MB for a 4-minute song), so the cache
holds audio: it stays on your machine, and the P8 worker clears it per job. Delete
`.cache/` freely.

## Determinism

With `--id` and `--created-at` fixed, the same audio gives byte-identical Song and MIDI
files run after run on one device (tested on CPU; checked by hand on CUDA). CPU and GPU
can differ slightly: on a 32 s test song, 2 of 188 piano onsets moved by 1 ms, note ends
by up to 10 ms, and a full mix kept one borderline note on CUDA that the CPU dropped. The
cache key doesn't include the device, so a cached run repeats whichever device filled it.
torchcrepe's own decoders add random dither; the pipeline decodes without it.
