# Spike: electric piano samples (P7)

Date: 2026-11-14. Not shipped code; the result feeds `web/src/audio/tone.ts`.

## Question

Is there a usable, licence-clean copy of Greg Sullivan's Wurlitzer EP200 (CC BY 3.0) that
the browser can stream from a runtime URL, the way the Salamander piano is streamed, and
how big is it?

## Findings

- **Source:** `smpldsnds/sfzinstruments-greg-sullivan-e-pianos`, a copy of
  `sfzinstruments/GregSullivan.E-Pianos` with the FLAC samples converted to Opus (`.ogg`)
  and AAC (`.m4a`). Pinned at commit `3d24e105f8a925cc084729856932d06e3545ed26`.
- **Licence:** the copy's `LICENSE` is the full CC BY 3.0 Unported legal code, and its
  README credits Greg Sullivan ("with the author permission with the request for
  attribution"). Commercial use is allowed; attribution is required.
- **Served by jsDelivr** with `access-control-allow-origin: *` and
  `content-type: audio/mp4`:
  `https://cdn.jsdelivr.net/gh/smpldsnds/sfzinstruments-greg-sullivan-e-pianos@3d24e105f8a925cc084729856932d06e3545ed26/wurlitzer-ep200/samples/`
- **What's there:** 20 sampled notes from A1 to Ab6, each with one to four velocity layers
  (`pp`, `mp`, `f`, `ff`). Not every note has every layer.
- **AAC (`.m4a`)** plays in Chrome, Edge, Firefox and Safari; Opus doesn't in older
  Safari. Use `.m4a`.

## Choice

One layer per note, preferring `f`, then `mp`, `ff`, `pp` (the sampler scales loudness by
velocity, as it does for the piano). 20 files, **462 KB** in all (target was under 4 MB):

| MIDI | Note | Layer | Bytes |
|---|---|---|---|
| 33 | A1 | f | 40 786 |
| 36 | C2 | f | 45 044 |
| 40 | E2 | mp | 20 729 |
| 41 | F2 | f | 42 655 |
| 44 | Ab2 | pp | 34 688 |
| 45 | A2 | mp | 22 056 |
| 47 | B2 | f | 35 185 |
| 51 | Eb3 | mp | 20 328 |
| 52 | E3 | f | 22 045 |
| 56 | Ab3 | f | 22 967 |
| 61 | Db4 | f | 20 502 |
| 64 | E4 | ff | 23 580 |
| 66 | Gb4 | mp | 14 177 |
| 67 | G4 | ff | 16 691 |
| 68 | Ab4 | f | 24 994 |
| 71 | B4 | mp | 8 069 |
| 73 | Db5 | f | 17 041 |
| 79 | G5 | f | 9 463 |
| 85 | Db6 | f | 10 722 |
| 92 | Ab6 | f | 10 404 |

Notes outside A1–Ab6 are pitch-shifted from the nearest sample, as Tone.Sampler does for
the piano. The real EP200 has 64 keys (A1–C7), so the far ends of an 88-key keyboard will
sound thin.

## Follow-up

- `VITE_EPIANO_SAMPLES_URL` overrides the base URL; the pinned jsDelivr URL is the default.
- The footer credits Greg Sullivan (CC BY 3.0) next to the Salamander credit.
- P9 decides self-hosting for both sample sets.
