import '../../design/system/tokens.css';
import '../../design/system/components.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { createBrowserAudioContext } from './audio/context';
import { AudioEngine } from './audio/engine';
import { WebMidiInput } from './midi/WebMidiInput';
import { IndexedDbSessionStore, ResilientSessionStore } from './sessions/store';
import { LocalSettingsStore } from './settings/store';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// The real wiring (ADR 0004). The AudioContext is created inside the first Play or Connect
// click; Tone.js and the piano then load in their own chunk. The MIDI adapter maps
// timestamps onto the audio clock.
const audio = new AudioEngine({
  createContext: createBrowserAudioContext,
  load: async (context) => {
    const { createToneAudio } = await import('./audio/tone');
    return createToneAudio(
      context,
      import.meta.env.VITE_PIANO_SAMPLES_URL || undefined,
      import.meta.env.VITE_EPIANO_SAMPLES_URL || undefined,
    );
  },
});
const midi = new WebMidiInput(audio.clock);
// Kept on this device (ADR 0006). Both cope with storage that throws (private windows).
const settings = new LocalSettingsStore(() => window.localStorage);
const deviceSessions = new IndexedDbSessionStore(() => window.indexedDB);

// With a backend configured (P8, ADR 0015) Isai has accounts, a library and uploads;
// without one it runs as before: example songs, .song.json files, sessions on this device.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function start(container: HTMLElement): Promise<void> {
  if (supabaseUrl && supabaseKey) {
    const [{ createSupabaseApi }, { CloudApp }] = await Promise.all([
      import('./api/supabase'),
      import('./cloud/CloudApp'),
    ]);
    const api = createSupabaseApi(supabaseUrl, supabaseKey);
    const local = { all: () => deviceSessions.all(), flags: () => window.localStorage };
    createRoot(container).render(
      <StrictMode>
        <BrowserRouter>
          <CloudApp api={api} deps={{ audio, midi, settings }} local={local} />
        </BrowserRouter>
      </StrictMode>,
    );
    return;
  }
  const sessions = new ResilientSessionStore(deviceSessions);
  createRoot(container).render(
    <StrictMode>
      <App deps={{ audio, midi, settings, sessions }} />
    </StrictMode>,
  );
}

void start(root);
