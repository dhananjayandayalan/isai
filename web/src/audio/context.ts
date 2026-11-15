// The browser's audio context. A native AudioContext, not Tone's default wrapper, because
// the MIDI time mapping needs getOutputTimestamp() (ADR 0004). main.tsx hands this to
// AudioEngine, which calls it synchronously inside the first click.

export function createBrowserAudioContext(): AudioContext {
  return new AudioContext({ latencyHint: 'interactive' });
}
