export type { MidiDevice, MidiInput, MidiNoteEvent, MidiNoteListener, Unsubscribe } from './MidiInput';
export type { AudioClock } from './AudioClock';
export { FAKE_DEVICE, FakeMidiInput, type FakeNoteOptions } from './FakeMidiInput';
export {
  browserMidiAccess,
  MidiError,
  WebMidiInput,
  type MidiAccessLike,
  type MidiInputPortLike,
  type MidiMessageLike,
  type RequestMidiAccess,
} from './WebMidiInput';
