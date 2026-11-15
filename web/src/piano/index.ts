// Keyboard rendering: pure layout, a canvas renderer and its rAF controller (rule 5).
export { Keyboard, type KeyboardProps } from './Keyboard';
export {
  countOutOfRange,
  DEFAULT_KEYBOARD_SIZE,
  KEYBOARD_RANGES,
  KEYBOARD_SIZES,
  layoutKeys,
  type KeyboardSize,
  type KeyLayout,
  type KeyRange,
} from './layout';
export { drawKeyboard, readPianoColors, type PianoColors } from './KeyboardRenderer';
export { PianoController, type FrameScheduler, type PositionSource } from './PianoController';
