import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const MIDI_MESSAGE = 'Use the MidiInput interface from src/midi/ (ADR 0003, CLAUDE.md rule 4).';
const CLOCK_MESSAGE =
  'Timing comes from the audio clock: use the Transport / AudioClock from src/audio/, or ' +
  'requestAnimationFrame for drawing (ADR 0004, CLAUDE.md rule 6).';

// CLAUDE.md rule 4: only web/src/midi/ may touch Web MIDI.
// Any access to requestMIDIAccess, however the navigator is reached.
const MIDI_SYNTAX = [
  "MemberExpression[property.name='requestMIDIAccess']",
  "MemberExpression[property.value='requestMIDIAccess']",
  "ObjectPattern > Property[key.name='requestMIDIAccess']",
].map((selector) => ({ selector, message: MIDI_MESSAGE }));

// CLAUDE.md rule 6: no wall clock or timers in app code, however they are reached
// (`Date.now`, `Date['now']`, `new Date()`, `performance.now`, `const { now } = performance`,
// `window.performance.now`, `globalThis.setTimeout`, ...).
const CLOCK_SYNTAX = [
  // Any use of the Date object: Date.now, Date['now'], new Date(), Date(), const { now } = Date.
  "MemberExpression[object.name='Date']",
  "MemberExpression[object.property.name='Date']",
  "NewExpression[callee.name='Date']",
  "NewExpression[callee.property.name='Date']",
  "CallExpression[callee.name='Date']",
  "VariableDeclarator[init.name='Date'] > ObjectPattern",
  // performance.now, however `performance` is reached and however `now` is spelled.
  "MemberExpression[object.name='performance'][property.name='now']",
  "MemberExpression[object.name='performance'][property.value='now']",
  "MemberExpression[object.property.name='performance'][property.name='now']",
  "MemberExpression[object.property.name='performance'][property.value='now']",
  "VariableDeclarator[init.name='performance'] > ObjectPattern > Property[key.name='now']",
  "VariableDeclarator[init.property.name='performance'] > ObjectPattern > Property[key.name='now']",
  // Timers.
  "MemberExpression[property.name=/^(setTimeout|setInterval)$/]",
  "MemberExpression[property.value=/^(setTimeout|setInterval)$/]",
  "ObjectPattern > Property[key.name=/^(setTimeout|setInterval)$/]",
].map((selector) => ({ selector, message: CLOCK_MESSAGE }));

const CLOCK_GLOBALS = ['setTimeout', 'setInterval'].map((name) => ({ name, message: CLOCK_MESSAGE }));

const MIDI_IMPORTS = { patterns: [{ group: ['webmidi', 'webmidi/*'], message: MIDI_MESSAGE }] };

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'src/generated'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    rules: {
      'no-restricted-syntax': ['error', ...MIDI_SYNTAX],
      'no-restricted-imports': ['error', MIDI_IMPORTS],
    },
  },
  {
    // App code: rules 4 and 6.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...MIDI_SYNTAX, ...CLOCK_SYNTAX],
      'no-restricted-globals': ['error', ...CLOCK_GLOBALS],
    },
  },
  {
    // The MIDI adapters may touch Web MIDI, but still not the wall clock.
    files: ['src/midi/**/*.{ts,tsx}'],
    ignores: ['src/midi/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...CLOCK_SYNTAX],
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['src/midi/**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-syntax': 'off', 'no-restricted-imports': 'off' },
  },
  {
    files: ['*.{js,ts}', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
);
