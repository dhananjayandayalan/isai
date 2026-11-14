// Audio engine interfaces and test fakes. Tone.js lives only in ./tone.ts, which is
// imported dynamically by main.tsx so tests and the first page load never pull it in.
export type {
  Instrument,
  InstrumentSound,
  LoadedAudio,
  Transport,
  TransportState,
} from './types';
export {
  AudioEngine,
  type AudioContextLike,
  type AudioEngineOptions,
  type AudioSource,
} from './engine';
export { FakeTransport } from './FakeTransport';
export { FakeInstrument, type InstrumentCall } from './FakeInstrument';
export { instrumentPart } from './parts';
export { applyVelocityCurve, CURVE_GAMMA, type VelocityCurve } from './velocity';
export { SwitchableInstrument, type Voice, type VoicedInstrument } from './voices';
