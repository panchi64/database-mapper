import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    // Most of what's worth testing here is pure geometry, routing, layout and
    // store logic, so `node` is the default. The handful of suites that need a
    // DOM opt in per-file with a `@vitest-environment jsdom` docblock.
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/components/ui/**', 'src/**/index.ts'],
    },
  },
});
