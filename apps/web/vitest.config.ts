import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // Unit tests only. Browser tests live in `e2e/` and run under Playwright
    // against the full stack.
    include: ['src/**/*.test.ts'],
  },
});
