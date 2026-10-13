import '../../design/system/tokens.css';
import '../../design/system/components.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AudioEngine } from './audio/engine';
import { WebMidiInput } from './midi/WebMidiInput';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// The real wiring (ADR 0004): Tone.js and the piano load on the first Play or Connect
// click, in their own chunk; the MIDI adapter maps timestamps onto the audio clock.
const audio = new AudioEngine(async () => {
  const { createToneAudio } = await import('./audio/tone');
  return createToneAudio(import.meta.env.VITE_PIANO_SAMPLES_URL || undefined);
});
const midi = new WebMidiInput(audio.clock);

createRoot(root).render(
  <StrictMode>
    <App deps={{ audio, midi }} />
  </StrictMode>,
);
