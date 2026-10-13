import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

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
      'no-restricted-properties': [
        'error',
        {
          object: 'navigator',
          property: 'requestMIDIAccess',
          message: 'Use the MidiInput interface from src/midi/ (ADR 0003).',
        },
      ],
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'webmidi', message: 'Use the MidiInput interface from src/midi/ (ADR 0003).' }] },
      ],
    },
  },
  {
    files: ['src/midi/**/*.{ts,tsx}'],
    rules: { 'no-restricted-properties': 'off', 'no-restricted-imports': 'off' },
  },
  {
    files: ['*.{js,ts}', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
);
