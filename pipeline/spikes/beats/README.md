# Spike: beat tracking (P3 plan, commit 10)

Which beat and downbeat tracker should replace the pipeline's stopgap `LibrosaTracker`?
This folder is its own uv project, so the candidates' dependencies (torch, madmom) stay out
of the pipeline until ADR 0009 picks one. Numbers only; no audio is stored here.

## Run

```sh
cd pipeline/spikes/beats
uv sync                          # librosa baseline + Beat This! (CPU torch, ~900 MB venv)
uv run python run.py --synth     # synthesised pieces with known beats (smoke test)
uv run python run.py --manifest ../../../tests/golden/manifest.yaml
```

Audio goes through the pipeline's own `ingest`, and the baseline is the pipeline's actual
`LibrosaTracker`, so each tracker sees what the pipeline would hand it. Each adapter in
`trackers.py` implements the pipeline's `BeatTracker` protocol, so the winner drops in.
Results go to `results/<name>.json` and a Markdown table on stdout.

## Metrics (`scoring.py`)

- **Beat / downbeat F-measure:** ±70 ms, beats in the first 5 s ignored (the mir_eval
  defaults). Needs a reference: a `beats:` file in the manifest entry (below).
- **Tempo:** median-interval bpm against `expected.bpm`; within 2% is right, half, double
  or a third within 2% is "octave" (accepted but flagged, as in `/golden-eval`).
- **Metre:** beats per bar against `expected.beats_per_bar` when given.
- **Agreement:** each tracker's beat F against each other tracker, which still says
  something about songs that have no beat annotations.
- **Speed:** tracker seconds per minute of audio, model loading excluded (reported apart).

### Optional manifest fields the spike reads

```yaml
    expected:
      beats_per_bar: 4          # 3 or 4
    beats: full-mix-01.beats    # in tests/golden/: one beat per line, "time position-in-bar"
```

A `.beats` file is text (`12.345 1` is a downbeat, `12.845 2` the next beat). Tapping along
in Sonic Visualiser or Audacity and exporting the labels is enough.

## Candidates

| Candidate | Status on this machine | Licence |
|---|---|---|
| `librosa.beat` + accent-phase downbeats | works (the pipeline's current tracker) | ISC |
| **Beat This!** 1.1.0, checkpoint `final0`, no DBN | works, CPU torch 2.15 | code and weights MIT (README; maintainer in issue #21). Some training data has restrictive licences; the maintainers say the weights don't inherit them, but they aren't lawyers |
| Beat This! + DBN post-processing | needs madmom (below) | |
| madmom RNN + DBN | **does not install**: no Python 3.11 wheel, and the source build needs Microsoft Visual C++ 14 Build Tools | its metadata says "Free for non-commercial use" (model files CC BY-NC-SA): **blocks a public launch** even if it builds |

The `final0` checkpoint download from `cloud.cp.jku.at` returned HTTP 500 on 2026-11-14
(a 503 outage was reported in beat_this issue #20). It was fetched from the maintainer's
mirror named in that issue, `https://f0k.de/pubs/2024_ismir/beat_this-final0.ckpt`, and
checked against the maintainer's md5 (`9fdf5e3f69b9996870e7aecd69527b08`). It lives in
`~/.cache/torch/hub/checkpoints/`, outside git. The P8 worker will need the checkpoint
shipped with it, not downloaded at run time.

## Results

### Synthesised smoke test (2026-11-14, `results/synth.json`)

Eight 30 s pieces: click tracks (60–174 BPM, 3/4 and 4/4) and drum patterns (100, 132,
and 96 BPM with ±6% rubato).

| tracker | beat F | downbeat F | tempo right | tempo octave | metre right | s per audio min |
|---|---|---|---|---|---|---|
| librosa | 0.953 | 0.625 | 0.875 | 0.125 | 1.0 | 0.83 |
| beat-this | 0.873 | 0.591 | 1.0 | 0.0 | 0.75 | 1.02 |

What this says, and doesn't:
- Bare clicks are out of distribution for Beat This! (trained on music). It found no beats
  in the 60 BPM clicks and called the 3/4 clicks 4/4, which is where its lower averages
  come from.
- On the drum patterns, Beat This! gets every downbeat (F 1.0 where the librosa heuristic
  scores 0) and holds the rubato piece that librosa doubles (191 BPM).
- Both are fast enough on CPU: about 1 s of tracking per minute of audio.

These pieces decide nothing; the golden songs do.

### Golden set

Waiting for the owner's audio (`tests/golden/manifest.yaml` is still TODO).
