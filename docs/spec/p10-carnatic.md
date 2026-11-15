---
id: spec-p10-carnatic
phase: P10
title: Carnatic path — shruti, raga, tala, raga-aware swaras
status: draft
track: both
depends_on: [spec-p05-harmony-arranger, spec-p07-notation-settings, spec-p09-deployment]
---

# P10 — Carnatic path

## Goal

A learner uploads a Carnatic recording (voice or instrument, with or without tanpura and
mridangam). They give the raga and Sa if they know them, and get back:
- the melody as swaras, spelled for the raga, with sthayi dots
- the shruti in Hz
- the tala cycle counted on screen
- an arrangement with the melody in the right hand and a tanpura-style drone in the left,
  instead of Western chords

Raga detection only suggests; it never claims certainty.

## Scope

### Theory — `pipeline/src/isai/theory/` and `web/src/theory/` (≥ 90% coverage, both sides)
- **Melakarta ragas, computed:** for the 72 melakartas, M1 for 1–36 and M2 for 37–72.
  The chakra (6 per half) selects the R–G pair from (R1G1, R1G2, R1G3, R2G2, R2G3, R3G3).
  The position in the chakra selects the D–N pair from the same pattern. Tested against
  known ragas: 15 Mayamalavagowla, 22 Kharaharapriya, 29 Dheerasankarabharanam,
  65 Mechakalyani.
- **Janya ragas:** a data file (`theory/data/ragas.yaml`) with name, parent melakarta,
  arohanam and avarohanam as swara lists, and common alternative spellings of the name.
  It starts with about 60 commonly taught ragas, checked by the owner or a musician
  friend. The same file is used by both packages (copied by `/schema-sync`-style
  generation, or served next to the schema).
- **Raga-aware swara spelling:** the same pitch is shown as R3 or G2 (and D3 or N2)
  according to the raga's swaras. This upgrades P7's scale-based default.
- **Tala:** Adi (8 aksharas: laghu 4 + drutam 2 + drutam 2), Rupakam (3, often counted
  as 6), Misra Chapu (7 = 3+2+2) and Khanda Chapu (5 = 2+3), plus nadai (chatusra and
  tisra) for subdivisions. Angas drive the on-screen count (beats, waves, finger counts).

### Pipeline
- **Source type `carnatic`** is accepted by the CLI and the worker.
- **Path:**
  - ingest
  - optional separation (vocals versus accompaniment, when mridangam or violin are
    present)
  - melody f0 (P4 tracker)
  - shruti
  - raga candidates
  - tala
  - arrange
- **Shruti** (`tonality/shruti.py`):
  - Estimate Sa from the tanpura drone (stable Sa–Pa spectral peaks) when one is present,
    else from the f0 histogram (the strongest stable pitch with a strong Pa a fifth above).
  - A user-supplied Sa (note name or Hz) overrides the estimate and is checked against the
    audio (warn if they're more than 50 cents apart).
  - Output `tonality.tonicHz`. `tonality.key` is the nearest Western note name, for the
    keyboard.
- **Raga candidates** (`tonality/raga.py`, pure scoring over the data file):
  - A swarasthana histogram from stable f0 regions relative to Sa, compared with each
    raga's swara set, with bonuses for arohanam/avarohanam direction matches.
  - Top-3 candidates with scores.
  - `tonality.raga` is set only when the user supplied it, or the best candidate's
    margin is high. Otherwise the candidates are shown as suggestions.
- **Gamaka-tolerant segmentation:** P4's segmentation with raga-constrained quantisation.
  Frames snap to the raga's swaras, not all 12 semitones, and oscillations (kampitam)
  around a swara are one note. Gamakas aren't represented as pitch bends; the piano plays
  the swara's stable pitch.
- **Tala:** beats from the rhythm stage (mridangam-aware if the spike shows a gain).
  Cycle length from the user's choice (default Adi) or from periodicity; the cycle start
  (samam) is aligned to the strongest recurring accent.
- **Arranger, Carnatic rules** (`arrange/carnatic.py`, rule-based, tested):
  - The right hand is the melody (octave placement as in P5).
  - The left hand plays a drone: Sa–Pa–Sa′ (or Sa–Ma–Sa′ for ragas without Pa) on each
    tala anga, held, at three levels (held drone, anga pulses, tanpura-style
    pattern).
  - `chords: []` and the harmony stage is skipped.
- **Golden set:** at least 3 Carnatic entries with `tonic_hz`, `raga` and tala.
  `/golden-eval` scores:
  - Sa within 20 cents
  - raga top-1 and top-3 accuracy
  - melody onset F1 when a reference exists
  - tala cycle length correct

### Web
- **Upload:** "What kind of recording is it?" includes Carnatic. When chosen, show the Sa
  field (note picker or "Detect automatically") and the raga field (search the raga list,
  or "Detect automatically"), as in `Upload.dc.html`.
- **Song overview:**
  - raga name with arohanam and avarohanam in swaras
  - shruti (e.g. "Sa = D#, 155 Hz")
  - tala
  - candidate ragas when not confirmed, with "Set raga" (re-spelling only; no
    re-analysis)
- **Practice:** swaras are the default notation for Carnatic songs, with madhya, mandra
  and tara sthayi dots. A tala counter shows the akshara count and the anga gesture
  (clap, wave, finger) for the current beat. The metronome can click on angas.
- **Results:** sections are tala cycles (avartanams) instead of 4-bar phrases.

## Needs owner approval before building

- **Schema change (minor bump):**
  - `tala` (optional): `{ name, aksharas, angas: number[], nadai }`
  - `tonality.ragaCandidates` (optional): `[{ name, score }]`
  - a rule that `chords` may be empty for `carnatic`
  `timeSignature` stays (Adi as 4/4 × 2 for Western displays) so older readers still work.
- **New ADR — Carnatic data model:** where the raga data lives and how both packages get
  it; spelling rules; tala representation; drone arrangement.
- **Musical review:** the raga data file and the arranger output are checked by a
  Carnatic musician friend before release. Their sign-off is an exit criterion.
- **Dependencies:** none expected beyond P4. A mridangam-specific rhythm model would need
  its own spike and approval.

## Out of scope

Hindustani ragas and taals. Gamaka rendering as pitch bends or ornaments. Lyrics
(sahityam). Automatic raga certainty claims. Kalpanaswaram or improvisation generation.
Varnam- or kriti-specific structure (pallavi, anupallavi, charanam) beyond generic
sections.

## Exit criteria

- [ ] Carnatic ADR accepted; schema change approved and `/schema-sync` clean
- [ ] Melakarta computation, raga spelling and tala tests pass; `theory/` ≥ 90% in both packages
- [ ] Shruti within 20 cents and tala cycle correct on the golden Carnatic songs; raga top-3 accuracy reported
- [ ] A user-supplied Sa and raga override detection and are respected in spelling
- [ ] A Carnatic song uploads, analyses and practises end to end on staging, then production
- [ ] A musician friend signs off the raga data and two arranged songs
- [ ] `/golden-eval` report committed; no regressions on the Western paths
- [ ] Lint, type check and tests pass in both packages
