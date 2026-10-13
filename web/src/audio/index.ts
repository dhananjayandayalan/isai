// Audio engine interfaces and test fakes. Tone.js lives only in ./tone.ts, which is
// imported dynamically by main.tsx so tests and the first page load never pull it in.
export type {
  Instrument,
  InstrumentSound,
  LoadedAudio,
  Transport,
  TransportState,
} from './types';
export { AudioEngine, type AudioLoader } from './engine';
export { FakeTransport } from './FakeTransport';
export { FakeInstrument, type InstrumentCall } from './FakeInstrument';
