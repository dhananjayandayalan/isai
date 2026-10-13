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
  },
});
