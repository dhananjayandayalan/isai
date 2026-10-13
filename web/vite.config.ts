import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    // The Song schema, its examples and the design system live outside web/.
    fs: { allow: ['.', '../schema', '../design'] },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/generated/**', 'src/main.tsx'],
      reporter: [['text', { skipFull: false }], 'json-summary'],
      // CLAUDE.md: theory/ (and arrange/, when the web gets one) needs 90%+ line coverage.
      thresholds: { 'src/theory/**': { lines: 90 } },
    },
  },
});
