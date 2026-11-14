# Isai pipeline

Song audio in, Song JSON and MIDI out. See the root `README.md` for the commands that set
up and check every package.

## Needs

- Python 3.11+ and [uv](https://docs.astral.sh/uv/) (`uv sync` installs the rest).
- **ffmpeg 6 or newer on `PATH`** (it decodes every audio format). On Windows,
  `winget install Gyan.FFmpeg`; on macOS, `brew install ffmpeg`; on Debian or Ubuntu,
  `sudo apt install ffmpeg`. `ISAI_FFMPEG` and `ISAI_FFPROBE` point at the executables
  if they aren't on `PATH`. Tests that need ffmpeg skip, with that reason, when it's missing.

## Analyse a song

```
uv run isai analyse song.mp3 --type full-mix --out out/
```

writes `out/song.song.json` (Song schema 0.2.0) and `out/song.mid` (tempo map, time and
key signature, right and left hand). In P3 the Song has beats, downbeats, tempo, time
signature, key, mode, scale and confidences; notes and chords come in P4 and P5.

| Flag | |
|---|---|
| `--type` | required: `piano-solo`, `full-mix` or `a-cappella` (`carnatic` comes later) |
| `--title` | the Song's title (default: the file name) |
| `--id`, `--created-at` | fix the Song's id and creation time; with both, the same audio gives byte-identical output |
| `--cache-dir` | where stage outputs are cached (default `.cache/`, gitignored) |
| `--no-cache` | run every stage afresh |
| `--from-stage rhythm\|tonality` | re-run that stage and the ones after it |
| `--log-json` | one JSON line per stage on stderr, with its timing and whether it came from the cache |

Exit codes: 0 done, 1 invalid Song, 2 missing input or bad arguments, 3 schema not found,
4 decode failed (or no ffmpeg), 5 longer than 12 minutes or bigger than 100 MB, 6 silent.

## The cache

Each stage's output goes to `.cache/<audio-hash>/<stage>-<version>-<key>/`, where the key
covers the stage's options and the stage before it. Changing a stage re-runs it and the
stages after it only. The hash is of the decoded audio and is never stored in the Song.
The cache holds decoded audio only in memory; delete `.cache/` freely.
