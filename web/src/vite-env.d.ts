/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Folder URL (ending in /) for the piano samples; defaults to the Tone.js host. */
  readonly VITE_PIANO_SAMPLES_URL?: string;
  /** Folder URL (ending in /) for the electric piano samples; defaults to a pinned jsDelivr copy. */
  readonly VITE_EPIANO_SAMPLES_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
