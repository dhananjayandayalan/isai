import { defineConfig } from 'vitest/config';

// End to end on the local Supabase stack (`pnpm db:start` first): the real api/ clients,
// the real worker. Not part of `pnpm test`.
export default defineConfig({
  server: { fs: { allow: ['.', '../schema'] } },
  test: {
    include: ['e2e/**/*.e2e.ts'],
    globalSetup: ['e2e/stack.ts'],
    testTimeout: 300_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
