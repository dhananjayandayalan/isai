# Phase 0 spikes

These spikes gate ADR-016 and ADR-017 (spec §10.8). Record each one as `S<n>-<slug>.md` using the template below.

| Spike | Question | Pass condition |
|---|---|---|
| S1 | Do beat_this, the ISMIR19 chord model and basic-pitch export to ONNX with matching outputs? | Labels identical and activations within tolerance on 3 songs; pre-processing decision recorded per model |
| S2 | Do the models run in onnxruntime-web in Chrome and in Tauri (WebView2, WKWebView, WebKitGTK)? | Full 4-min track within the §10.4 desktop budget; WASM vs WebGPU timings recorded |
| S3 | Does onnxruntime-react-native + native PCM decode work on a mid-range Android phone and an iPhone? | Full track within the §10.4 phone budget |
| S4 | What do the models weigh after quantisation, and what does it cost in accuracy? | < 30 MB without Demucs; accuracy loss ≤ 1 pt |

If a spike fails on one platform, only that platform falls back (Python sidecar on desktop, or hosted analysis on mobile).

## Template
```
# S<n> — <title>
Date:
Machine / device:
Versions:
## Method
## Results (table)
## Decision — pass / fail / fallback for <platform>
```
