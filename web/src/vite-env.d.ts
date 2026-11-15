/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Folder URL (ending in /) for the piano samples; defaults to the Tone.js host. */
  readonly VITE_PIANO_SAMPLES_URL?: string;
  /** Folder URL (ending in /) for the electric piano samples; defaults to a pinned jsDelivr copy. */
  readonly VITE_EPIANO_SAMPLES_URL?: string;
  /** The Supabase project (P8). With both set, Isai has accounts; without, it runs locally. */
  readonly VITE_SUPABASE_URL?: string;
  /** The project's public anon key (never the service-role key). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
