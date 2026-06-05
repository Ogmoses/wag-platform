// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals:     true,
    setupFiles:  ['./tests/setup.ts'],
    coverage: {
      provider:   'v8',
      reporter:   ['text', 'html'],
      include:    ['src/**/*.{ts,tsx}'],
      exclude:    ['src/**/*.d.ts', 'src/types/**'],
      thresholds: {
        lines:     60,
        functions: 60,
        branches:  50,
      },
    },
  },
});
