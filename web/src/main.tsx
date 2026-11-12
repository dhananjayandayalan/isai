import '../../design/system/tokens.css';
import '../../design/system/components.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { createBrowserAudioContext } from './audio/context';
import { AudioEngine } from './audio/engine';
import { WebMidiInput } from './midi/WebMidiInput';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// The real wiring (ADR 0004). The AudioContext is created inside the first Play or Connect
// click; Tone.js and the piano then load in their own chunk. The MIDI adapter maps
// timestamps onto the audio clock.
const audio = new AudioEngine({
  createContext: createBrowserAudioContext,
  load: async (context) => {
    const { createToneAudio } = await import('./audio/tone');
    return createToneAudio(context, import.meta.env.VITE_PIANO_SAMPLES_URL || undefined);
  },
});
const midi = new WebMidiInput(audio.clock);

createRoot(root).render(
  <StrictMode>
    <App deps={{ audio, midi }} />
  </StrictMode>,
);
