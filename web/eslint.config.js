import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const MIDI_MESSAGE = 'Use the MidiInput interface from src/midi/ (ADR 0003, CLAUDE.md rule 4).';

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
      // CLAUDE.md rule 4: only web/src/midi/ may touch Web MIDI.
      // Any access to requestMIDIAccess, however the navigator is reached.
      'no-restricted-syntax': [
        'error',
        ...[
          "MemberExpression[property.name='requestMIDIAccess']",
          "MemberExpression[property.value='requestMIDIAccess']",
          "ObjectPattern > Property[key.name='requestMIDIAccess']",
        ].map((selector) => ({ selector, message: MIDI_MESSAGE })),
      ],
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['webmidi', 'webmidi/*'], message: MIDI_MESSAGE }] },
      ],
    },
  },
  {
    files: ['src/midi/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': 'off', 'no-restricted-imports': 'off' },
  },
  {
    files: ['*.{js,ts}', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
);
