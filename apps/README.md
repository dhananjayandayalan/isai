# apps/

Each app is scaffolded with its official generator in the phase that introduces it (spec §6, §10.8). Don't create them earlier.

| App | Phase | Generator |
|---|---|---|
| `web/` | 4 | `pnpm create vite web --template react-ts` |
| `desktop/` | 5 | `pnpm create tauri-app` (frontend = `apps/web`; needs the Rust toolchain) |
| `edge/` | 2 | `pnpm create cloudflare edge` (Worker) |
| `mobile/` | 7 | `pnpm create expo-app mobile` (needs a dev build for onnxruntime-react-native) |
