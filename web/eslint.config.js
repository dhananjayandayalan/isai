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
// Any use of the Date object: Date.now, Date['now'], new Date(), Date(), const { now } = Date.
const DATE_SYNTAX = [
  "MemberExpression[object.name='Date']",
  "MemberExpression[object.property.name='Date']",
  "NewExpression[callee.name='Date']",
  "NewExpression[callee.property.name='Date']",
  "CallExpression[callee.name='Date']",
  "VariableDeclarator[init.name='Date'] > ObjectPattern",
].map((selector) => ({ selector, message: CLOCK_MESSAGE }));

const TIMER_SYNTAX = [
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

const CLOCK_SYNTAX = [...DATE_SYNTAX, ...TIMER_SYNTAX];

const CLOCK_GLOBALS = ['setTimeout', 'setInterval'].map((name) => ({ name, message: CLOCK_MESSAGE }));

const SUPABASE_MESSAGE =
  'Use the interfaces in src/api/ (AuthClient, SongStore, ...); only src/api/ imports supabase-js ' +
  '(ADR 0015, CLAUDE.md rule 10).';
// Dynamic imports slip past no-restricted-imports.
const SUPABASE_SYNTAX = [
  { selector: "ImportExpression[source.value=/^@supabase./]", message: SUPABASE_MESSAGE },
];
const MIDI_PATTERN = { group: ['webmidi', 'webmidi/*'], message: MIDI_MESSAGE };
const SUPABASE_PATTERN = { group: ['@supabase/*'], message: SUPABASE_MESSAGE };
const MIDI_IMPORTS = { patterns: [MIDI_PATTERN] };
// App code outside src/api/: neither Web MIDI nor Supabase.
const APP_IMPORTS = { patterns: [MIDI_PATTERN, SUPABASE_PATTERN] };

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
    // App code: rules 4, 6 and 10.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...MIDI_SYNTAX, ...CLOCK_SYNTAX, ...SUPABASE_SYNTAX],
      'no-restricted-globals': ['error', ...CLOCK_GLOBALS],
      'no-restricted-imports': ['error', APP_IMPORTS],
    },
  },
  {
    // Tests import neither Supabase (they use src/api/fakes.ts) nor Web MIDI outside src/midi/.
    files: ['src/**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', APP_IMPORTS] },
  },
  {
    // src/api/ is the one place that talks to Supabase (rule 10); rules 4 and 6 still hold.
    files: ['src/api/**/*.{ts,tsx}'],
    ignores: ['src/api/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...MIDI_SYNTAX, ...CLOCK_SYNTAX],
      'no-restricted-imports': ['error', MIDI_IMPORTS],
    },
  },
  {
    // The MIDI adapters may touch Web MIDI, but still not the wall clock.
    files: ['src/midi/**/*.{ts,tsx}'],
    ignores: ['src/midi/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...CLOCK_SYNTAX, ...SUPABASE_SYNTAX],
      'no-restricted-imports': ['error', { patterns: [SUPABASE_PATTERN] }],
    },
  },
  {
    // The one exception to rule 6 (ADR 0006): calendar dates for saved sessions. `Date` is
    // allowed in this file only, and still no timers or performance.now.
    files: ['src/sessions/wallClock.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...MIDI_SYNTAX, ...TIMER_SYNTAX, ...SUPABASE_SYNTAX],
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
